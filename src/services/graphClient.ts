import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class GraphClientService {
  private client: Client;
  private tokens: StoredTokens | null = null;

  constructor() {
    this.client = Client.initWithMiddleware({
      authProvider: new CustomAuthProvider(this),
    });
  }

  async initialize(tokens: StoredTokens) {
    this.tokens = tokens;
  }

  async getTokens(): Promise<StoredTokens | null> {
    return this.tokens;
  }

  async refreshTokens(): Promise<StoredTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      if (!window.electronAPI) throw new Error("Electron API is unavailable");
      const newTokens = await window.electronAPI.refreshToken(this.tokens.refreshToken);
      this.tokens = newTokens;
      return newTokens;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  async createDraft(subject: string, body: string, toEmails: string[], ccEmails: string[] = []): Promise<string> {
    try {
      const recipients = toEmails.map(address => ({
        emailAddress: { address }
      }));

      const ccRecipients = ccEmails.map(address => ({
        emailAddress: { address }
      }));

      const message: any = {
        subject,
        body: {
          contentType: 'HTML',
          content: body
        },
        toRecipients: recipients
      };

      if (ccRecipients.length > 0) {
        message.ccRecipients = ccRecipients;
      }

      const response = await this.client.api('/me/messages').post(message);
      return response.id;
    } catch (error) {
      console.error('Draft creation failed:', error);
      throw error;
    }
  }

  async createUploadSession(messageId: string, fileName: string, fileSize: number): Promise<string> {
    try {
      const response = await this.client
        .api(`/me/messages/${messageId}/attachments/createUploadSession`)
        .post({
          AttachmentItem: {
            attachmentType: 'file',
            name: fileName,
            size: fileSize
          }
        });

      return response.uploadUrl;
    } catch (error) {
      console.error('Upload session creation failed:', error);
      throw error;
    }
  }

  async uploadFileChunk(uploadUrl: string, chunk: ArrayBuffer, rangeStart: number, rangeEnd: number, totalSize: number): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout to prevent hanging connections

    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': (rangeEnd - rangeStart + 1).toString(),
          'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
        },
        body: chunk,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      clearTimeout(timeout);
      console.error('Chunk upload failed:', error);
      throw error;
    }
  }

  async createBatchDrafts(drafts: Array<{ subject: string, body: string, toEmails: string[], ccEmails?: string[] }>): Promise<Array<{ id: string, success: boolean, error?: string }>> {
    const results: Array<{ id: string, success: boolean, error?: string }> = [];

    // Execute strictly sequentially to avoid Microsoft Graph MailboxConcurrency throttling (limit: 4 concurrent)
    for (const draft of drafts) {
      try {
        const id = await this.createDraft(draft.subject, draft.body, draft.toEmails, draft.ccEmails);
        results.push({ id, success: true });
      } catch (error: any) {
        // We capture individual failures to not break the entire batch flow
        results.push({
          id: '',
          success: false,
          error: error.message || 'Failed to create draft'
        });
      }
    }

    return results;
  }

  async getUserInfo(): Promise<{ displayName: string, mail: string }> {
    try {
      const response = await this.client.api('/me').get();
      return {
        displayName: response.displayName,
        mail: response.mail || response.userPrincipalName
      };
    } catch (error) {
      console.error('Get user info failed:', error);
      throw error;
    }
  }
}

class CustomAuthProvider implements AuthenticationProvider {
  constructor(private graphService: GraphClientService) { }

  async getAccessToken(): Promise<string> {
    const tokens = await this.graphService.getTokens();
    if (!tokens) {
      throw new Error('No tokens available');
    }

    // Check if token is expired (with 5 minute buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    if (Date.now() >= (tokens.expiresAt - bufferTime)) {
      // Token is expired or about to expire, refresh it
      const newTokens = await this.graphService.refreshTokens();
      return newTokens.accessToken;
    }

    return tokens.accessToken;
  }
}
