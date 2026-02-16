export class RateLimiter {
  private retryAfter: number = 0;
  private maxRetries: number = 3;
  private baseDelay: number = 1000; // 1 second

  async executeWithRetry<T>(
    request: () => Promise<T>,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check if we need to wait due to rate limiting
        if (this.retryAfter > Date.now()) {
          const waitTime = this.retryAfter - Date.now();
          console.log(`Rate limited, waiting ${waitTime}ms`);
          await this.delay(waitTime);
        }

        const result = await request();
        
        // Reset retry after on success
        this.retryAfter = 0;
        return result;
        
      } catch (error: any) {
        lastError = error;
        
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);
          this.retryAfter = Date.now() + (retryAfter * 1000);
          
          console.log(`Rate limited, retry after ${retryAfter} seconds`);
          
          if (attempt < maxRetries) {
            const backoffDelay = this.calculateBackoffDelay(attempt);
            await this.delay(backoffDelay);
            continue;
          }
        } else if (this.isRetryableError(error)) {
          if (attempt < maxRetries) {
            const backoffDelay = this.calculateBackoffDelay(attempt);
            console.log(`Retryable error, retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await this.delay(backoffDelay);
            continue;
          }
        }
        
        // Non-retryable error or max retries reached
        break;
      }
    }
    
    throw lastError || new Error('Request failed after all retries');
  }

  private isRateLimitError(error: any): boolean {
    return error?.status === 429 || 
           error?.statusCode === 429 ||
           error?.code === 'ThrottledRequest' ||
           error?.message?.includes('rate limit') ||
           error?.message?.includes('throttled');
  }

  private isRetryableError(error: any): boolean {
    const retryableStatuses = [500, 502, 503, 504];
    const retryableCodes = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];
    
    return retryableStatuses.includes(error?.status) ||
           retryableStatuses.includes(error?.statusCode) ||
           retryableCodes.includes(error?.code) ||
           error?.message?.includes('timeout') ||
           error?.message?.includes('network');
  }

  private extractRetryAfter(error: any): number {
    // Check for Retry-After header
    const retryAfterHeader = error?.headers?.['retry-after'] || 
                           error?.response?.headers?.['retry-after'];
    
    if (retryAfterHeader) {
      return parseInt(retryAfterHeader, 10) || 60;
    }
    
    // Check for retry-after in error message
    const retryAfterMatch = error?.message?.match(/retry.after[:\s]+(\d+)/i);
    if (retryAfterMatch) {
      return parseInt(retryAfterMatch[1], 10);
    }
    
    // Default retry after time
    return 60;
  }

  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset(): void {
    this.retryAfter = 0;
  }

  getRetryAfter(): number {
    return Math.max(0, this.retryAfter - Date.now());
  }
}

export class BatchRateLimiter {
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private readonly MAX_CONCURRENT_REQUESTS = 3;

  async executeBatch<T>(
    requests: Array<() => Promise<T>>,
    batchId: string = 'default'
  ): Promise<T[]> {
    const rateLimiter = this.getRateLimiter(batchId);
    const results: T[] = [];
    
    // Process requests in chunks to respect concurrency limits
    const chunks = this.chunkArray(requests, this.MAX_CONCURRENT_REQUESTS);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(request => 
        rateLimiter.executeWithRetry(request)
      );
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }
    
    return results;
  }

  private getRateLimiter(batchId: string): RateLimiter {
    if (!this.rateLimiters.has(batchId)) {
      this.rateLimiters.set(batchId, new RateLimiter());
    }
    return this.rateLimiters.get(batchId)!;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  resetAll(): void {
    this.rateLimiters.forEach(limiter => limiter.reset());
  }
}
