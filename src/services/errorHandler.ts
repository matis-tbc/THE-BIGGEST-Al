export interface ErrorContext {
  operation: string;
  contactId?: string;
  messageId?: string;
  batchIndex?: number;
  retryCount?: number;
  additionalData?: Record<string, any>;
}

export interface ErrorCategory {
  type: 'transient' | 'permanent' | 'rate_limit' | 'authentication' | 'validation' | 'network';
  shouldRetry: boolean;
  maxRetries: number;
  backoffMultiplier: number;
  userMessage: string;
}

export class ErrorHandler {
  private errorCategories: Map<string, ErrorCategory> = new Map();

  constructor() {
    this.initializeErrorCategories();
  }

  private initializeErrorCategories(): void {
    // Transient errors (network issues, temporary service unavailability)
    this.errorCategories.set('transient', {
      type: 'transient',
      shouldRetry: true,
      maxRetries: 5,
      backoffMultiplier: 2,
      userMessage: 'Temporary issue, retrying...'
    });

    // Rate limiting errors
    this.errorCategories.set('rate_limit', {
      type: 'rate_limit',
      shouldRetry: true,
      maxRetries: 3,
      backoffMultiplier: 3,
      userMessage: 'Rate limited, waiting before retry...'
    });

    // Authentication errors
    this.errorCategories.set('authentication', {
      type: 'authentication',
      shouldRetry: false,
      maxRetries: 1,
      backoffMultiplier: 1,
      userMessage: 'Authentication failed, please sign in again'
    });

    // Validation errors (bad data, invalid email, etc.)
    this.errorCategories.set('validation', {
      type: 'validation',
      shouldRetry: false,
      maxRetries: 0,
      backoffMultiplier: 1,
      userMessage: 'Validation error, please check your data'
    });

    // Network errors
    this.errorCategories.set('network', {
      type: 'network',
      shouldRetry: true,
      maxRetries: 3,
      backoffMultiplier: 2,
      userMessage: 'Network issue, retrying...'
    });

    // Permanent errors (should not retry)
    this.errorCategories.set('permanent', {
      type: 'permanent',
      shouldRetry: false,
      maxRetries: 0,
      backoffMultiplier: 1,
      userMessage: 'Permanent error, cannot retry'
    });
  }

  categorizeError(error: Error | string, context: ErrorContext): ErrorCategory {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorString = errorMessage.toLowerCase();

    // Check for specific error patterns
    if (errorString.includes('rate limit') || errorString.includes('throttle') || errorString.includes('429')) {
      return this.errorCategories.get('rate_limit')!;
    }

    if (errorString.includes('auth') || errorString.includes('token') || errorString.includes('401') || errorString.includes('403')) {
      return this.errorCategories.get('authentication')!;
    }

    if (errorString.includes('network') || errorString.includes('timeout') || errorString.includes('connection')) {
      return this.errorCategories.get('network')!;
    }

    if (errorString.includes('invalid') || errorString.includes('validation') || errorString.includes('400')) {
      return this.errorCategories.get('validation')!;
    }

    // Default to transient for most errors (will retry)
    return this.errorCategories.get('transient')!;
  }

  calculateBackoffDelay(retryCount: number, category: ErrorCategory): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const exponentialDelay = baseDelay * Math.pow(category.backoffMultiplier, retryCount);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  shouldRetry(error: Error | string, context: ErrorContext, retryCount: number): boolean {
    const category = this.categorizeError(error, context);
    
    if (!category.shouldRetry) {
      return false;
    }

    if (retryCount >= category.maxRetries) {
      return false;
    }

    return true;
  }

  getUserFriendlyMessage(error: Error | string, context: ErrorContext): string {
    const category = this.categorizeError(error, context);
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    // Add context-specific information
    let message = category.userMessage;
    
    if (context.contactId) {
      message += ` (Contact: ${context.contactId})`;
    }
    
    if (context.batchIndex !== undefined) {
      message += ` (Batch: ${context.batchIndex + 1})`;
    }
    
    // Add specific error details for debugging (truncated)
    const shortError = errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage;
    message += ` - ${shortError}`;
    
    return message;
  }

  logError(error: Error | string, context: ErrorContext, retryCount: number = 0): void {
    const category = this.categorizeError(error, context);
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    console.error(`[ErrorHandler] ${category.type.toUpperCase()} Error:`, {
      operation: context.operation,
      contactId: context.contactId,
      messageId: context.messageId,
      batchIndex: context.batchIndex,
      retryCount,
      error: errorMessage,
      category: category.type,
      shouldRetry: category.shouldRetry && retryCount < category.maxRetries,
      additionalData: context.additionalData
    });
  }

  createRecoveryPlan(error: Error | string, context: ErrorContext, retryCount: number): {
    shouldRetry: boolean;
    delayMs: number;
    userMessage: string;
    category: string;
  } {
    const category = this.categorizeError(error, context);
    const shouldRetry = this.shouldRetry(error, context, retryCount);
    const delayMs = shouldRetry ? this.calculateBackoffDelay(retryCount, category) : 0;
    const userMessage = this.getUserFriendlyMessage(error, context);

    return {
      shouldRetry,
      delayMs,
      userMessage,
      category: category.type
    };
  }

  // Specialized error handlers for common operations
  handleBatchError(error: Error, batchIndex: number, contactIds: string[], retryCount: number) {
    const context: ErrorContext = {
      operation: 'batch_processing',
      batchIndex,
      retryCount,
      additionalData: {
        contactCount: contactIds.length,
        contactIds: contactIds.slice(0, 5) // Log first 5 for reference
      }
    };

    this.logError(error, context, retryCount);
    return this.createRecoveryPlan(error, context, retryCount);
  }

  handleAttachmentError(error: Error, messageId: string, retryCount: number) {
    const context: ErrorContext = {
      operation: 'attachment_upload',
      messageId,
      retryCount
    };

    this.logError(error, context, retryCount);
    return this.createRecoveryPlan(error, context, retryCount);
  }

  handleGraphApiError(error: Error, operation: string, retryCount: number) {
    const context: ErrorContext = {
      operation: `graph_api_${operation}`,
      retryCount,
      additionalData: {
        apiOperation: operation
      }
    };

    this.logError(error, context, retryCount);
    return this.createRecoveryPlan(error, context, retryCount);
  }
}

// Singleton instance
export const errorHandler = new ErrorHandler();