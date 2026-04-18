import {
  mergeTemplate,
  parseTemplateSections,
  formatEmailBodyHtml,
  getSubjectForContactIndex,
} from "../utils/templateMerge";

export interface Contact {
  id: string;
  name: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined;
}

interface Template {
  id: string;
  name: string;
  subjects?: string[];
  content: string;
  variables: string[];
}

interface ProcessingResult {
  contactId: string;
  status: "pending" | "processing" | "drafted" | "attaching" | "completed" | "failed";
  messageId?: string;
  error?: string;
}

export type SendMode = "draft" | "send-now" | "schedule";

export interface SendOptions {
  mode: SendMode;
  staggerSeconds: number;
  scheduledForIso?: string;
  ccEmails?: string[];
}

const DEFAULT_CC_EMAILS = ["cuhyperloop@colorado.edu"];

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fileToBase64(file: File): Promise<{ name: string; mime: string; base64: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return {
    name: file.name,
    mime: file.type || "application/octet-stream",
    base64: btoa(binary),
  };
}

function parseRecipients(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[;,]+/)
    .flatMap((part) => part.split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

export class BatchProcessor {
  async initialize(): Promise<boolean> {
    if (!window.electronAPI) return false;
    const tokens = await window.electronAPI.getTokens();
    return !!tokens?.accessToken;
  }

  async processContacts(
    contacts: Contact[],
    templates: Template[],
    defaultTemplateId: string | null,
    attachment: File | null,
    sendOptions: SendOptions,
    onProgress: (results: ProcessingResult[]) => void,
  ): Promise<string> {
    if (!window.electronAPI) {
      throw new Error("Electron bridge unavailable");
    }

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const recipientIds = contacts.map(() => generateId());

    const results: ProcessingResult[] = contacts.map((contact) => ({
      contactId: contact.id,
      status: "pending",
    }));

    let activeAccountEmail: string | null = null;
    try {
      const profile = await window.electronAPI.getUserProfile();
      activeAccountEmail = (profile?.email || "").toLowerCase() || null;
    } catch {}

    const baseCc = sendOptions.ccEmails ?? DEFAULT_CC_EMAILS;
    const effectiveCc = activeAccountEmail
      ? baseCc.filter((cc) => cc.toLowerCase() !== activeAccountEmail)
      : baseCc;

    const recipients = contacts.map((contact, index) => {
      const activeId = contact.templateId || defaultTemplateId;
      const activeTemplate = templates.find((t) => t.id === activeId) || templates[0];
      const parsedTemplate = parseTemplateSections(activeTemplate.content);
      const selectedSubjectTemplate = getSubjectForContactIndex(activeTemplate, index);
      const toTemplate = parsedTemplate.to || "";
      const bodyTemplate = parsedTemplate.body || activeTemplate.content;
      const subject = mergeTemplate(selectedSubjectTemplate, contact).trim();
      const rawBody = mergeTemplate(bodyTemplate, contact);
      const bodyHtml = formatEmailBodyHtml(rawBody);
      const mergedRecipients = mergeTemplate(toTemplate, contact).trim();
      const toEmails = parseRecipients(mergedRecipients);
      const toEmail = toEmails[0] || contact.email;
      return {
        recipientId: recipientIds[index],
        toEmail,
        toName: contact.name,
        ccEmails: effectiveCc,
        subject,
        bodyHtml,
      };
    });

    let attachmentPayload: { name: string; mime: string; base64: string } | undefined;
    if (attachment) {
      attachmentPayload = await fileToBase64(attachment);
    }

    const recipientToContactId = new Map<string, string>();
    recipients.forEach((r, i) => {
      recipientToContactId.set(r.recipientId, contacts[i].id);
    });

    const unsubscribe = window.electronAPI.onDispatchProgress(runId, (event) => {
      const contactId = recipientToContactId.get(event.result.recipientId);
      if (!contactId) return;
      const idx = results.findIndex((r) => r.contactId === contactId);
      if (idx < 0) return;
      if (event.result.ok) {
        results[idx] = {
          ...results[idx],
          status: sendOptions.mode === "draft" ? "completed" : "completed",
          messageId: event.result.messageId,
        };
      } else {
        results[idx] = { ...results[idx], status: "failed", error: event.result.error };
      }
      onProgress([...results]);
    });

    contacts.forEach((c) => {
      const idx = results.findIndex((r) => r.contactId === c.id);
      if (idx >= 0) results[idx].status = "processing";
    });
    onProgress([...results]);

    try {
      await window.electronAPI.dispatchRun({
        runId,
        recipients,
        attachment: attachmentPayload,
        mode: sendOptions.mode,
        staggerSeconds: sendOptions.staggerSeconds,
        scheduledForIso: sendOptions.scheduledForIso,
        identityEmail: activeAccountEmail || undefined,
      });
    } finally {
      unsubscribe();
    }

    return runId;
  }

  async getOperationStatus(_operationId: string): Promise<ProcessingResult[]> {
    return [];
  }

  async retryFailedContacts(
    failedResults: ProcessingResult[],
    _templates: Template[],
    _defaultTemplateId: string | null,
    _attachment: File | null,
    _onProgress: (results: ProcessingResult[]) => void,
  ): Promise<void> {
    console.log("Retrying failed contacts:", failedResults.length);
  }
}
