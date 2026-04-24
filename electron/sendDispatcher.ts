const { graphFetch, graphJson } = require("./graphHelper");
const fsp = require("node:fs/promises");
const path = require("node:path");

const DEFERRED_SEND_PROPERTY_ID = "SystemTime 0x3FEF";
const SMALL_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

export interface RecipientPayload {
  recipientId: string;
  /** Primary recipient address. Always present. */
  toEmail: string;
  /** Optional extra addresses when a row's email cell is a list (e.g.
   * "a@x.com, b@x.com"). All entries plus `toEmail` are sent on the TO line. */
  additionalToEmails?: string[];
  ccEmails?: string[];
  subject: string;
  bodyHtml: string;
  attachment?: SharedAttachment;
}

export interface SharedAttachment {
  name: string;
  mime: string;
  buffer: Buffer;
}

export interface DispatchOptions {
  mode: "draft" | "send-now" | "schedule";
  scheduledForIso?: string;
  deferredSendIso?: string;
  attachment?: SharedAttachment;
  /**
   * Fired between phases so the UI can show draft-created vs attachment-
   * uploading states. Optional — callers that only care about final
   * success/failure can ignore it.
   */
  onPhase?: (phase: "drafted" | "attaching") => void;
}

export interface DispatchResult {
  recipientId: string;
  ok: boolean;
  messageId?: string;
  conversationId?: string;
  internetMessageId?: string;
  error?: string;
}

const ME_BASE = "/me";

function buildDraftBody(recipient: RecipientPayload, deferredSendIso?: string): any {
  // Build the TO list from the primary address plus any additional addresses
  // on the row. Dedupe case-insensitively so "a@x.com" and "A@X.COM" only
  // appear once. Empty tokens are dropped defensively.
  const toAddrs: string[] = [recipient.toEmail, ...(recipient.additionalToEmails || [])]
    .map((a) => (a || "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const dedupedTo = toAddrs.filter((a) => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const message: any = {
    subject: recipient.subject,
    body: { contentType: "HTML", content: recipient.bodyHtml },
    toRecipients: dedupedTo.map((addr) => ({ emailAddress: { address: addr } })),
  };
  if (recipient.ccEmails && recipient.ccEmails.length > 0) {
    message.ccRecipients = recipient.ccEmails.map((addr) => ({ emailAddress: { address: addr } }));
  }
  if (deferredSendIso) {
    message.singleValueExtendedProperties = [
      { id: DEFERRED_SEND_PROPERTY_ID, value: deferredSendIso },
    ];
  }
  return message;
}

async function attachInlineSmall(
  authService: any,
  messageId: string,
  attachment: SharedAttachment,
): Promise<void> {
  const body = {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: attachment.name,
    contentType: attachment.mime,
    contentBytes: attachment.buffer.toString("base64"),
  };
  const res = await graphFetch(authService, `${ME_BASE}/messages/${messageId}/attachments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Attachment upload failed (${res.status}): ${err}`);
  }
}

async function attachLargeViaUploadSession(
  authService: any,
  messageId: string,
  attachment: SharedAttachment,
): Promise<void> {
  const buffer = attachment.buffer;
  const sessionRes = await graphJson(
    authService,
    `${ME_BASE}/messages/${messageId}/attachments/createUploadSession`,
    {
      method: "POST",
      body: JSON.stringify({
        AttachmentItem: {
          attachmentType: "file",
          name: attachment.name,
          size: buffer.length,
          contentType: attachment.mime,
        },
      }),
    },
  );

  const uploadUrl: string = sessionRes.uploadUrl;
  try {
    let offset = 0;
    while (offset < buffer.length) {
      const end = Math.min(offset + UPLOAD_CHUNK_SIZE, buffer.length);
      const chunk = buffer.subarray(offset, end);
      const rangeHeader = `bytes ${offset}-${end - 1}/${buffer.length}`;
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.length),
          "Content-Range": rangeHeader,
        },
        body: chunk,
      });
      if (!res.ok && res.status !== 201 && res.status !== 200 && res.status !== 202) {
        const err = await res.text();
        throw new Error(`Chunk upload failed at ${rangeHeader} (${res.status}): ${err}`);
      }
      offset = end;
    }
  } catch (err) {
    // Best-effort cleanup so a mid-upload failure doesn't orphan the session on Graph.
    try {
      await fetch(uploadUrl, { method: "DELETE" });
    } catch {
      // ignore cleanup failures
    }
    throw err;
  }
}

export async function dispatchRecipient(
  authService: any,
  recipient: RecipientPayload,
  options: DispatchOptions,
): Promise<DispatchResult> {
  try {
    const deferredSendIso =
      options.mode === "schedule" ? options.scheduledForIso : options.deferredSendIso;

    const draftBody = buildDraftBody(recipient, deferredSendIso);

    const draft = await graphJson(authService, `${ME_BASE}/messages`, {
      method: "POST",
      body: JSON.stringify(draftBody),
      clientRequestId: recipient.recipientId,
    });

    const messageId: string = draft.id;
    const conversationId: string | undefined = draft.conversationId;
    const internetMessageId: string | undefined = draft.internetMessageId;

    // Signal to the caller that the draft is created and we're about to
    // start uploading the attachment (if any). Callers can emit this to
    // the UI so the "Drafted" / "Uploading" counters progress visibly.
    try {
      options.onPhase?.("drafted");
    } catch {}

    const effectiveAttachment = recipient.attachment ?? options.attachment;
    if (effectiveAttachment) {
      try {
        options.onPhase?.("attaching");
      } catch {}
      if (effectiveAttachment.buffer.length <= SMALL_ATTACHMENT_LIMIT) {
        await attachInlineSmall(authService, messageId, effectiveAttachment);
      } else {
        await attachLargeViaUploadSession(authService, messageId, effectiveAttachment);
      }
    }

    if (options.mode !== "draft") {
      const sendRes = await graphFetch(authService, `${ME_BASE}/messages/${messageId}/send`, {
        method: "POST",
      });
      if (!sendRes.ok) {
        const err = await sendRes.text();
        throw new Error(`Send failed (${sendRes.status}): ${err}`);
      }
    }

    return {
      recipientId: recipient.recipientId,
      ok: true,
      messageId,
      conversationId,
      internetMessageId,
    };
  } catch (error: any) {
    return {
      recipientId: recipient.recipientId,
      ok: false,
      error: error?.message || String(error),
    };
  }
}

export async function appendRunLog(
  userDataDir: string,
  runId: string,
  entry: Record<string, any>,
): Promise<void> {
  const dir = path.join(userDataDir, "runs");
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${runId}.jsonl`);
  await fsp.appendFile(
    file,
    `${JSON.stringify({ ...entry, timestamp: new Date().toISOString() })}\n`,
    "utf8",
  );
}
