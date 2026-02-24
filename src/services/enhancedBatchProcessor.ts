import { GraphClientService } from './graphClient';
import { AttachmentHandler } from './attachmentHandler';
import { TokenManager } from './tokenManager';
import { mergeTemplate, parseTemplateSections } from '../utils/templateMerge';
import { errorHandler, ErrorContext } from './errorHandler';

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
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  messageId?: string;
  error?: string;
  retryCount?: number;
}

interface BatchProcessingOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  continueOnSingleFailure?: boolean;
  partialBatchRecovery?: boolean;
}

export class EnhancedBatchProcessor {
  private graphService: GraphClientService;
  private attachmentHandler: AttachmentHandler;
  private tokenManager: TokenManager;
  private readonly BATCH_SIZE = 20; // Graph API batch limit
  private readonly MAX_CONCURRENT_BATCHES = 3;
  private readonly DEFAULT_OPTIONS: BatchProcessingOptions = {
    maxRetries: 3,
    retryDelayMs: 1000,
    continueOnSingleFailure: true,
    partialBatchRecovery: true
  };

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
    onProgress: (results: ProcessingResult[]) => void,
    options: BatchProcessingOptions = {}
  ): Promise<string> {
    const operationId = `op-${Date.now()}`;
    const processingOptions = { ...this.DEFAULT_OPTIONS, ...options };
    
    const results: ProcessingResult[] = contacts.map(contact => ({
      contactId: contact.id,
      status: 'pending',
      retryCount: 0
    }));

    try {
      // Ensure valid token before starting
      const hasValidToken = await this.tokenManager.ensureValidToken();
      if (!hasValidToken) {
        throw new Error('Authentication required. Please sign in again.');
      }

      // Process contacts in batches with enhanced error handling
      const batches = this.createBatches(contacts, this.BATCH_SIZE);
      const processedBatches = await this.processBatchesWithRetry(
        batches,
        template,
        attachment,
        results,
        onProgress,
        processingOptions
      );

      // Attach files to successfully created drafts with retry logic
      if (attachment) {
        await this.attachFilesWithRetry(processedBatches, attachment, results, onProgress, processingOptions);
      }

      return operationId;
    } catch (error) {
      console.error('Batch processing failed:', error);
      
      // Mark all as failed with appropriate error message
      results.forEach(result => {
        if (result.status === 'pending' || result.status === 'processing') {
          result.status = 'failed';
          result.error = error instanceof Error ? error.message : 'Batch processing failed';
        }
      });
      
      onProgress([...results]);
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

  private async processBatchesWithRetry(
    batches: Contact[][],
    template: Template,
    attachment: File,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void,
    options: BatchProcessingOptions
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
        return await this.processBatchWithRetry(
          batch,
          subjectTemplate,
          toTemplate,
          bodyTemplate,
          globalBatchIndex,
          results,
          onProgress,
          options
        );
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect successful message IDs
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          createdMessageIds.push(...result.value);
        } else {
          console.error(`Batch ${i + index} failed:`, result.reason);
        }
      });
    }

    return createdMessageIds;
  }

  private async processBatchWithRetry(
    batch: Contact[],
    subjectTemplate: string,
    toTemplate: string,
    bodyTemplate: string,
    batchIndex: number,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void,
    options: BatchProcessingOptions,
    retryCount: number = 0
  ): Promise<string[]> {
    const contactIds = batch.map(contact => contact.id);
    
    try {
      // Mark contacts as processing
      batch.forEach(contact => {
        const result = results.find(r => r.contactId === contact.id);
        if (result && result.status !== 'completed') {
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
      const createdMessageIds: string[] = [];
      const failedContacts: Contact[] = [];

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
            failedContacts.push(contact);
          }
        }
      });

      onProgress([...results]);

      // Handle failed contacts with retry logic if enabled
      if (failedContacts.length > 0 && options.continueOnSingleFailure && retryCount < (options.maxRetries || 3)) {
        console.log(`Retrying ${failedContacts.length} failed contacts in batch ${batchIndex}, attempt ${retryCount + 1}`);
        
        // Mark failed contacts as retrying
        failedContacts.forEach(contact => {
          const result = results.find(r => r.contactId === contact.id);
          if (result) {
            result.status = 'retrying';
            result.retryCount = (result.retryCount || 0) + 1;
          }
        });
        onProgress([...results]);

        // Wait before retry
        await this.delay(this.calculateRetryDelay(retryCount));

        // Retry only the failed contacts
        const retryResults = await this.processBatchWithRetry(
          failedContacts,
          subjectTemplate,
          toTemplate,
          bodyTemplate,
          batchIndex,
          results,
          onProgress,
          options,
          retryCount + 1
        );

        createdMessageIds.push(...retryResults);
      }

      return createdMessageIds;

    } catch (error) {
      // Use enhanced error handler
      const recoveryPlan = errorHandler.handleBatchError(
        error as Error,
        batchIndex,
        contactIds,
        retryCount
      );

      // Mark all contacts in this batch based on error type
      batch.forEach(contact => {
        const result = results.find(r => r.contactId === contact.id);
        if (result && result.status !== 'completed') {
          if (recoveryPlan.shouldRetry && retryCount < (options.maxRetries || 3)) {
            result.status = 'retrying';
            result.retryCount = (result.retryCount || 0) + 1;
            result.error = recoveryPlan.userMessage;
          } else {
            result.status = 'failed';
            result.error = recoveryPlan.userMessage;
          }
        }
      });

      onProgress([...results]);

      // Retry the entire batch if error is retryable
      if (recoveryPlan.shouldRetry && retryCount < (options.maxRetries || 3)) {
        console.log(`Retrying batch ${batchIndex} after error, attempt ${retryCount + 1}`);
        
        // Wait before retry based on error category
        await this.delay(recoveryPlan.delayMs);

        return await this.processBatchWithRetry(
          batch,
          subjectTemplate,
          toTemplate,
          bodyTemplate,
          batchIndex,
          results,
          onProgress,
          options,
          retryCount + 1
        );
      }

      return [];
    }
  }

  private async attachFilesWithRetry(
    messageIds: string[],
    attachment: File,
    results: ProcessingResult[],
    onProgress: (results: ProcessingResult[]) => void,
    options: BatchProcessingOptions
  ): Promise<void> {
    if (messageIds.length === 0) return;

    const concurrency = 3;
    const chunks = this.chunkArray(messageIds, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (messageId) => {
        let retryCount = 0;
        const maxRetries = options.maxRetries || 3;

        while (retryCount <= maxRetries) {
          try {
            await this.attachmentHandler.attachFileToDraft(messageId, attachment);
            
            // Update the corresponding result if found
            const result = results.find(r => r.messageId === messageId);
            if (result && result.status === 'completed') {
              // Attachment successful, no change needed
            }
            
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            
            const recoveryPlan = errorHandler.handleAttachmentError(
              error as Error,
              messageId,
              retryCount
            );

            if (recoveryPlan.shouldRetry && retryCount <= maxRetries) {
              console.log(`Retrying attachment for message ${messageId}, attempt ${retryCount}`);
              await this.delay(recoveryPlan.delayMs);
              continue;
            } else {
              // Mark as failed
              const result = results.find(r => r.messageId === messageId);
              if (result) {
                result.status = 'failed';
                result.error = `Attachment failed: ${recoveryPlan.userMessage}`;
              }
              break;
            }
          }
        }
      });

      await Promise.allSettled(promises);
      onProgress([...results]);
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

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, etc.
    const baseDelay = 1000;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000; // Up to 1 second jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    onProgress: (results: ProcessingResult[]) => void,
    options: BatchProcessingOptions = {}
  ): Promise<void> {
    // This would reconstruct contacts from failed results and retry them
    // Implementation would be similar to the main processing but only for failed contacts
    console.log('Retrying failed contacts:', failedResults.length);
    
    // For now, just mark them as pending for retry
    failedResults.forEach(result => {
      result.status = 'pending';
      result.error = undefined;
      result.retryCount = (result.retryCount || 0) + 1;
    });
    
    onProgress([...failedResults]);
  }
}