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
      const newTokens = await window.electronAPI.refreshToken(this.tokens.refreshToken);
      this.tokens = newTokens;
      return newTokens;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  async createDraft(subject: string, body: string, toEmails: string[]): Promise<string> {
    try {
      const recipients = toEmails.map(address => ({
        emailAddress: { address }
      }));

      const message = {
        subject,
        body: {
          contentType: 'HTML',
          content: body
        },
        toRecipients: recipients
      };

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
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': (rangeEnd - rangeStart + 1).toString(),
          'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
        },
        body: chunk
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Chunk upload failed:', error);
      throw error;
    }
  }

  async createBatchDrafts(drafts: Array<{subject: string, body: string, toEmails: string[]}>): Promise<Array<{id: string, success: boolean, error?: string}>> {
    try {
      const requests = drafts.map((draft, index) => ({
        id: (index + 1).toString(),
        method: 'POST',
        url: '/me/messages',
        body: {
          subject: draft.subject,
          body: {
            contentType: 'HTML',
            content: draft.body
          },
          toRecipients: draft.toEmails.map(address => ({
            emailAddress: { address }
          }))
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }));

      const batchRequest = {
        requests
      };

      const response = await this.client.api('/$batch').post(batchRequest);

      const responseMap = new Map<string, any>();
      response.responses.forEach((resp: any) => {
        responseMap.set(resp.id, resp);
      });

      return drafts.map((_, index) => {
        const requestId = (index + 1).toString();
        const resp = responseMap.get(requestId);
        if (!resp) {
          return { id: '', success: false, error: 'Missing batch response' };
        }

        const messageId = resp.body?.id;
        const success = resp.status >= 200 && resp.status < 300 && Boolean(messageId);
        const error = resp.status >= 400 ? resp.body?.error?.message : (!messageId ? 'Missing message id' : undefined);

        return { id: messageId || '', success, error };
      });
    } catch (error) {
      console.error('Batch draft creation failed:', error);
      throw error;
    }
  }

  async getUserInfo(): Promise<{displayName: string, mail: string}> {
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
  constructor(private graphService: GraphClientService) {}

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
