import { GraphClientService } from "./graphClient";
import { AttachmentHandler } from "./attachmentHandler";
import { TokenManager } from "./tokenManager";
import { mergeTemplate, parseTemplateSections, DEFAULT_SUBJECTS, formatEmailBodyHtml } from "../utils/templateMerge";

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

export class BatchProcessor {
  private graphService: GraphClientService;
  private attachmentHandler: AttachmentHandler;
  private tokenManager: TokenManager;
  private readonly BATCH_SIZE = 20; // 20 requests per array loop. `graphClient` natively serializes them so we can batch freely.
  private readonly MAX_CONCURRENT_BATCHES = 1; // Strict serial execution
  private readonly DEFAULT_CC_EMAILS = ["cuhyperloop@colorado.edu"];

  constructor() {
    this.graphService = new GraphClientService();
    this.attachmentHandler = new AttachmentHandler(this.graphService);
    this.tokenManager = new TokenManager(this.graphService);
  }

  async initialize(): Promise<boolean> {
    return await this.tokenManager.initialize();
  }

  async processContacts(
    contacts: Contact[],
    templates: Template[],
    defaultTemplateId: string | null,
    attachment: File | null,
    onProgress: (results: ProcessingResult[]) => void,
  ): Promise<string> {
    const operationId = `op-${Date.now()}`;
    const results: ProcessingResult[] = contacts.map((contact) => ({
      contactId: contact.id,
      status: "pending",
    }));

    try {
      // Ensure valid token before starting
      const hasValidToken = await this.tokenManager.ensureValidToken();
      if (!hasValidToken) {
        throw new Error("Authentication required. Please sign in again.");
      }

      // Process contacts in batches
      const batches = this.createBatches(contacts, this.BATCH_SIZE);
      const processedBatches = await this.processBatchesInParallel(
        batches,
        templates,
        defaultTemplateId,
        attachment !== null,
        results,
        onProgress,
      );

      // Attach files to successfully created drafts
      if (attachment) {
        await this.attachFilesToDrafts(
          processedBatches,
          attachment,
          results,
          onProgress,
        );
      }

      return operationId;
    } catch (error) {
      console.error("Batch processing failed:", error);
      throw error;
    }
  }

  private createBatches(contacts: Contact[], batchSize: number): Contact[][] {
    const batches: Contact[][] = [];
    for (let i = 0; i < contacts.length; i += batchSize) {
      batches.push(contacts.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatchesInParallel(
    batches: Contact[][],
    templates: Template[],
    defaultTemplateId: string | null,
    hasAttachment: boolean,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void,
  ): Promise<string[]> {
    const createdMessageIds: string[] = [];
    const concurrency = Math.min(this.MAX_CONCURRENT_BATCHES, batches.length);

    for (let i = 0; i < batches.length; i += concurrency) {
      const batchGroup = batches.slice(i, i + concurrency);

      const batchPromises = batchGroup.map(async (batch, batchIndex) => {
        const globalBatchIndex = i + batchIndex;
        return await this.processBatch(
          batch,
          templates,
          defaultTemplateId,
          hasAttachment,
          globalBatchIndex,
          results,
          onProgress,
        );
      });

      const batchResults = await Promise.all(batchPromises);
      createdMessageIds.push(...batchResults.flat());

      // Delay to respect Exchange graph throttling 
      if (i + concurrency < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return createdMessageIds;
  }

  private async processBatch(
    batch: Contact[],
    templates: Template[],
    defaultTemplateId: string | null,
    hasAttachment: boolean,
    batchIndex: number,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void,
  ): Promise<string[]> {
    const createdMessageIds: string[] = [];

    try {
      // Mark contacts as processing
      batch.forEach((contact) => {
        const result = results.find((r) => r.contactId === contact.id);
        if (result) {
          result.status = "processing";
        }
      });
      onProgress([...results]);

      // Prepare draft data
      const drafts = batch.map((contact, index) => {
        const activeId = contact.templateId || defaultTemplateId;
        const activeTemplate =
          templates.find((t) => t.id === activeId) || templates[0];
        const parsedTemplate = parseTemplateSections(activeTemplate.content);

        // A/B Subject Loading Logic
        const availableSubjects = activeTemplate.subjects && activeTemplate.subjects.length > 0
          ? activeTemplate.subjects
          : (parsedTemplate.subject ? [parsedTemplate.subject] : DEFAULT_SUBJECTS);

        // Select subject based on contact index in the batch to evenly distribute
        const selectedSubjectTemplate = availableSubjects[index % availableSubjects.length];

        const toTemplate = parsedTemplate.to || "";
        const bodyTemplate = parsedTemplate.body || activeTemplate.content;

        const subject = mergeTemplate(selectedSubjectTemplate, contact).trim();
        const rawBody = mergeTemplate(bodyTemplate, contact);
        const body = formatEmailBodyHtml(rawBody);

        const mergedRecipients = mergeTemplate(toTemplate, contact).trim();

        const toEmails = this.parseRecipients(mergedRecipients);
        const resolvedRecipients =
          toEmails.length > 0 ? toEmails : [contact.email].filter(Boolean);

        return {
          subject,
          body,
          toEmails: resolvedRecipients,
          ccEmails: this.DEFAULT_CC_EMAILS,
        };
      });

      // Create drafts in batch
      const batchResults = await this.graphService.createBatchDrafts(drafts);

      // Update results
      batch.forEach((contact, index) => {
        const result = results.find((r) => r.contactId === contact.id);
        const batchResult = batchResults[index];

        if (result && batchResult) {
          if (batchResult.success) {
            result.status = hasAttachment ? "drafted" : "completed";
            result.messageId = batchResult.id;
            createdMessageIds.push(batchResult.id);
          } else {
            result.status = "failed";
            result.error = batchResult.error || "Unknown error";
          }
        }
      });

      onProgress([...results]);
      return createdMessageIds;
    } catch (error) {
      console.error(`Batch ${batchIndex} processing failed:`, error);

      // Mark all contacts in this batch as failed
      batch.forEach((contact) => {
        const result = results.find((r) => r.contactId === contact.id);
        if (result) {
          result.status = "failed";
          result.error =
            error instanceof Error ? error.message : "Batch processing failed";
        }
      });

      onProgress([...results]);
      return [];
    }
  }

  private async attachFilesToDrafts(
    messageIds: string[],
    attachment: File,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void,
  ): Promise<void> {
    if (messageIds.length === 0) return;

    for (const messageId of messageIds) {
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount <= maxRetries) {
        try {
          const result = results.find((r) => r.messageId === messageId);
          if (result && result.status === "drafted") {
            result.status = "attaching";
            onProgress([...results]);
          }

          // Dynamic delay: 250ms for first attempt to yield Exchange DB indexing, 3s-9s for retries
          await new Promise(resolve => setTimeout(resolve, retryCount === 0 ? 250 : retryCount * 3000));

          await this.attachmentHandler.attachFileToDraft(messageId, attachment);

          if (result && result.status === "attaching") {
            result.status = "completed";
            onProgress([...results]);
          }

          break; // Exit retry loop on success
        } catch (error) {
          console.error(`Attachment failed for message ${messageId} (Attempt ${retryCount + 1}):`, error);
          retryCount++;

          if (retryCount > maxRetries) {
            const result = results.find((r) => r.messageId === messageId);
            if (result) {
              result.status = "failed";
              result.error = error instanceof Error ? error.message : "Attachment failed";
              onProgress([...results]);
            }
            break;
          }
        }
      }
    }
  }

  private parseRecipients(input: string): string[] {
    if (!input) return [];
    return input
      .split(/[;,]+/)
      .flatMap((part) => part.split(/\s+/))
      .map((value) => value.trim())
      .filter(Boolean);
  }

  async getOperationStatus(_operationId: string): Promise<ProcessingResult[]> {
    // In a real implementation, this would query the database
    // For now, return empty array
    return [];
  }

  async retryFailedContacts(
    failedResults: ProcessingResult[],
    _templates: Template[],
    _defaultTemplateId: string | null,
    _attachment: File | null,
    _onProgress: (results: ProcessingResult[]) => void,
  ): Promise<void> {
    // Implementation for retrying failed contacts
    console.log("Retrying failed contacts:", failedResults.length);
  }
}
