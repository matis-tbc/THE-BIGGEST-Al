import { GraphClientService } from './graphClient';
import { AttachmentHandler } from './attachmentHandler';
import { TokenManager } from './tokenManager';
import { mergeTemplate, parseTemplateSections } from '../utils/templateMerge';

interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

interface ProcessingResult {
  contactId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  messageId?: string;
  error?: string;
}

export class BatchProcessor {
  private graphService: GraphClientService;
  private attachmentHandler: AttachmentHandler;
  private tokenManager: TokenManager;
  private readonly BATCH_SIZE = 20; // Graph API batch limit
  private readonly MAX_CONCURRENT_BATCHES = 3;

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
    template: Template,
    attachment: File,
    onProgress: (results: ProcessingResult[]) => void
  ): Promise<string> {
    const operationId = `op-${Date.now()}`;
    const results: ProcessingResult[] = contacts.map(contact => ({
      contactId: contact.id,
      status: 'pending'
    }));

    try {
      // Ensure valid token before starting
      const hasValidToken = await this.tokenManager.ensureValidToken();
      if (!hasValidToken) {
        throw new Error('Authentication required. Please sign in again.');
      }

      // Process contacts in batches
      const batches = this.createBatches(contacts, this.BATCH_SIZE);
      const processedBatches = await this.processBatchesInParallel(
        batches,
        template,
        attachment,
        results,
        onProgress
      );

      // Attach files to successfully created drafts
      if (attachment) {
        await this.attachFilesToDrafts(processedBatches, attachment, results, onProgress);
      }

      return operationId;
    } catch (error) {
      console.error('Batch processing failed:', error);
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
    template: Template,
    attachment: File,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void
  ): Promise<string[]> {
    const createdMessageIds: string[] = [];
    const concurrency = Math.min(this.MAX_CONCURRENT_BATCHES, batches.length);

    const parsedTemplate = parseTemplateSections(template.content);
    const subjectTemplate = parsedTemplate.subject || '';
    const toTemplate = parsedTemplate.to || '';
    const bodyTemplate = parsedTemplate.body || template.content;

    for (let i = 0; i < batches.length; i += concurrency) {
      const batchGroup = batches.slice(i, i + concurrency);
      
      const batchPromises = batchGroup.map(async (batch, batchIndex) => {
        const globalBatchIndex = i + batchIndex;
        return await this.processBatch(
          batch,
          subjectTemplate,
          toTemplate,
          bodyTemplate,
          globalBatchIndex,
          results,
          onProgress
        );
      });

      const batchResults = await Promise.all(batchPromises);
      createdMessageIds.push(...batchResults.flat());
    }

    return createdMessageIds;
  }

  private async processBatch(
    batch: Contact[],
    subjectTemplate: string,
    toTemplate: string,
    bodyTemplate: string,
    batchIndex: number,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void
  ): Promise<string[]> {
    const createdMessageIds: string[] = [];

    try {
      // Mark contacts as processing
      batch.forEach(contact => {
        const result = results.find(r => r.contactId === contact.id);
        if (result) {
          result.status = 'processing';
        }
      });
      onProgress([...results]);

      // Prepare draft data
      const drafts = batch.map(contact => {
        const subject = mergeTemplate(subjectTemplate, contact).trim();
        const body = mergeTemplate(bodyTemplate, contact);
        const mergedRecipients = mergeTemplate(toTemplate, contact).trim();

        const toEmails = this.parseRecipients(mergedRecipients);
        const resolvedRecipients = toEmails.length > 0 ? toEmails : [contact.email].filter(Boolean);

        return {
          subject,
          body,
          toEmails: resolvedRecipients
        };
      });

      // Create drafts in batch
      const batchResults = await this.graphService.createBatchDrafts(drafts);

      // Update results
      batch.forEach((contact, index) => {
        const result = results.find(r => r.contactId === contact.id);
        const batchResult = batchResults[index];
        
        if (result && batchResult) {
          if (batchResult.success) {
            result.status = 'completed';
            result.messageId = batchResult.id;
            createdMessageIds.push(batchResult.id);
          } else {
            result.status = 'failed';
            result.error = batchResult.error || 'Unknown error';
          }
        }
      });

      onProgress([...results]);
      return createdMessageIds;

    } catch (error) {
      console.error(`Batch ${batchIndex} processing failed:`, error);
      
      // Mark all contacts in this batch as failed
      batch.forEach(contact => {
        const result = results.find(r => r.contactId === contact.id);
        if (result) {
          result.status = 'failed';
          result.error = error instanceof Error ? error.message : 'Batch processing failed';
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
    onProgress: (results: ProcessingResult[]) => void
  ): Promise<void> {
    if (messageIds.length === 0) return;

    try {
      const attachmentResults = await this.attachmentHandler.attachFileToMultipleDrafts(
        messageIds,
        attachment
      );

      // Update results with attachment status
      attachmentResults.forEach(result => {
        const contactResult = results.find(r => r.messageId === result.messageId);
        if (contactResult && !result.success) {
          contactResult.status = 'failed';
          contactResult.error = result.error || 'Attachment failed';
        }
      });

      onProgress([...results]);
    } catch (error) {
      console.error('File attachment failed:', error);
      // Don't fail the entire operation for attachment errors
    }
  }

  private parseRecipients(input: string): string[] {
    if (!input) return [];
    return input
      .split(/[;,]+/)
      .flatMap(part => part.split(/\s+/))
      .map(value => value.trim())
      .filter(Boolean);
  }

  async getOperationStatus(operationId: string): Promise<ProcessingResult[]> {
    // In a real implementation, this would query the database
    // For now, return empty array
    return [];
  }

  async retryFailedContacts(
    failedResults: ProcessingResult[],
    template: Template,
    attachment: File,
    onProgress: (results: ProcessingResult[]) => void
  ): Promise<void> {
    // Implementation for retrying failed contacts
    // This would be similar to the main processing but only for failed contacts
    console.log('Retrying failed contacts:', failedResults.length);
  }
}
