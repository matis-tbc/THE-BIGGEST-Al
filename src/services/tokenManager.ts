import { GraphClientService } from './graphClient';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class TokenManager {
  private graphService: GraphClientService;
  private refreshMutex: boolean = false;

  constructor(graphService: GraphClientService) {
    this.graphService = graphService;
  }

  async initialize(): Promise<boolean> {
    try {
      const tokens = await window.electronAPI.getTokens();
      if (tokens) {
        await this.graphService.initialize(tokens);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token initialization failed:', error);
      return false;
    }
  }

  async ensureValidToken(): Promise<boolean> {
    try {
      const tokens = await this.graphService.getTokens();
      if (!tokens) {
        return false;
      }

      // Check if token is expired (with 5 minute buffer)
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const isExpired = Date.now() >= (tokens.expiresAt - bufferTime);

      if (isExpired) {
        return await this.refreshToken();
      }

      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  private async refreshToken(): Promise<boolean> {
    if (this.refreshMutex) {
      // Wait for ongoing refresh
      while (this.refreshMutex) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return true;
    }

    this.refreshMutex = true;

    try {
      await this.graphService.refreshTokens();
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    } finally {
      this.refreshMutex = false;
    }
  }

  async logout(): Promise<void> {
    try {
      await window.electronAPI.logout();
      this.graphService = new GraphClientService();
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  isTokenExpired(tokens: StoredTokens): boolean {
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    return Date.now() >= (tokens.expiresAt - bufferTime);
  }

  getTokenExpiryTime(tokens: StoredTokens): Date {
    return new Date(tokens.expiresAt);
  }

  getTimeUntilExpiry(tokens: StoredTokens): number {
    return tokens.expiresAt - Date.now();
  }
}
