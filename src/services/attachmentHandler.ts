import { GraphClientService } from './graphClient';

export class AttachmentHandler {
  private graphService: GraphClientService;
  private readonly CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunks

  constructor(graphService: GraphClientService) {
    this.graphService = graphService;
  }

  async attachFileToDraft(messageId: string, file: File): Promise<void> {
    try {
      // Create upload session
      const uploadUrl = await this.graphService.createUploadSession(
        messageId,
        file.name,
        file.size
      );

      // Upload file in chunks
      await this.uploadFileInChunks(uploadUrl, file);

    } catch (error) {
      console.error('File attachment failed:', error);
      throw error;
    }
  }

  private async uploadFileInChunks(uploadUrl: string, file: File): Promise<void> {
    const fileBuffer = await file.arrayBuffer();
    const totalSize = fileBuffer.byteLength;
    let uploadedBytes = 0;

    while (uploadedBytes < totalSize) {
      const chunkEnd = Math.min(uploadedBytes + this.CHUNK_SIZE - 1, totalSize - 1);
      const chunk = fileBuffer.slice(uploadedBytes, chunkEnd + 1);

      try {
        await this.graphService.uploadFileChunk(
          uploadUrl,
          chunk,
          uploadedBytes,
          chunkEnd,
          totalSize
        );

        uploadedBytes = chunkEnd + 1;

        // Add small delay between chunks to avoid rate limiting
        if (uploadedBytes < totalSize) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Chunk upload failed (bytes ${uploadedBytes}-${chunkEnd}):`, error);
        throw error;
      }
    }
  }

  async attachFileToMultipleDrafts(messageIds: string[], file: File): Promise<Array<{messageId: string, success: boolean, error?: string}>> {
    const results: Array<{messageId: string, success: boolean, error?: string}> = [];

    // Process attachments in parallel (max 3 at a time)
    const concurrency = 3;
    const chunks = this.chunkArray(messageIds, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (messageId) => {
        try {
          await this.attachFileToDraft(messageId, file);
          return { messageId, success: true };
        } catch (error) {
          console.error(`Attachment failed for message ${messageId}:`, error);
          return { 
            messageId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  isLargeFile(file: File): boolean {
    return file.size > 3 * 1024 * 1024; // 3MB threshold
  }

  getEstimatedUploadTime(file: File): number {
    // Rough estimate: 1MB per second
    const mbPerSecond = 1;
    const fileSizeMB = file.size / (1024 * 1024);
    return Math.ceil(fileSizeMB / mbPerSecond);
  }
}
