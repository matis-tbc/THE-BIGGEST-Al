const keytar = require('keytar');

const envClientId = process.env.AZURE_CLIENT_ID;
const envTenantId = process.env.AZURE_TENANT_ID;

if (!envClientId) {
  throw new Error('AZURE_CLIENT_ID environment variable must be set before starting the app.');
}

if (!envTenantId) {
  throw new Error('AZURE_TENANT_ID environment variable must be set before starting the app.');
}

const CLIENT_ID: string = envClientId;
const TENANT_ID: string = envTenantId;

const REDIRECT_URI = process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/redirect';
const AUTH_BASE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0`;
const SCOPES = ['User.Read', 'Mail.ReadWrite', 'offline_access'];
const SERVICE_NAME = 'email-drafter';
const ACCOUNT_NAME = 'microsoft-tokens';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class AuthService {
  private generateState(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
  }

  private generateCodeVerifier(): string {
    // Use Node.js crypto for random bytes
    const crypto = require('crypto');
    const array = crypto.randomBytes(32);
    return array.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private generateCodeChallenge(verifier: string): string {
    // Use Node.js crypto for hashing (sync version)
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  async startLogin(): Promise<{ authUrl: string; codeVerifier: string; state: string }> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
      state,
    });

    const authUrl = `${AUTH_BASE_URL}/authorize?${params.toString()}`;
    
    return { authUrl, codeVerifier, state };
  }

  async handleRedirect(url: string, codeVerifier: string, expectedState?: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');
      const returnedState = urlObj.searchParams.get('state');

      if (expectedState && returnedState !== expectedState) {
        throw new Error('OAuth state mismatch. Aborting authentication.');
      }

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code, codeVerifier);
      
      // Store tokens securely
      await this.storeTokens(tokenResponse);
      
      return true;
    } catch (error) {
      console.error('Redirect handling error:', error);
      return false;
    }
  }

  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
    const tokenParamKeys = Array.from(tokenParams.keys());
    if (tokenParamKeys.includes('client_secret') || tokenParamKeys.includes('client_assertion')) {
      throw new Error('Unexpected token request shape for PKCE flow.');
    }
    const response = await fetch(`${AUTH_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams,
    });

    if (!response.ok) {
      const rawError = await response.text();
      let parsedForLog: any = null;
      try {
        parsedForLog = JSON.parse(rawError);
      } catch {}
      console.error('[AuthService] Token exchange failed', {
        status: response.status,
        endpoint: `${AUTH_BASE_URL}/token`,
        clientId: CLIENT_ID,
        tenantId: TENANT_ID,
        error: parsedForLog?.error || 'unknown',
        errorCodes: parsedForLog?.error_codes || [],
        traceId: parsedForLog?.trace_id || null,
        correlationId: parsedForLog?.correlation_id || null,
      });
      let friendlyMessage = rawError;
      try {
        const parsed = JSON.parse(rawError);
        if (parsed?.error === 'invalid_client' && parsed?.error_description?.includes('AADSTS70002')) {
          friendlyMessage = 'Azure AD rejected the PKCE token exchange (AADSTS70002). Please open the Azure Portal → App registrations → your app → Authentication and ensure: \n• A "Mobile and desktop applications" platform exists with redirect URI matching your AZURE_REDIRECT_URI (default http://localhost:3000/redirect) \n• "Allow public client flows" is enabled under the Advanced settings.';
        } else if (parsed?.error_description) {
          friendlyMessage = parsed.error_description;
        }
      } catch (parseErr) {
        console.warn('Failed to parse token error response', parseErr);
      }

      throw new Error(friendlyMessage);
    }

    return await response.json() as unknown as TokenResponse;
  }

  private async storeTokens(tokens: TokenResponse): Promise<void> {
    const expiresAt = Date.now() + (tokens.expires_in * 1000);
    const storedTokens: StoredTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiresAt,
    };

    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, JSON.stringify(storedTokens));
  }

  async getStoredTokens(): Promise<StoredTokens | null> {
    try {
      const stored = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (!stored) return null;
      
      return JSON.parse(stored) as StoredTokens;
    } catch (error) {
      console.error('Error retrieving stored tokens:', error);
      return null;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
    const response = await fetch(`${AUTH_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: SCOPES.join(' '),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json() as TokenResponse;
    const expiresAt = Date.now() + (tokens.expires_in * 1000);
    
    const storedTokens: StoredTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiresAt,
    };

    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, JSON.stringify(storedTokens));
    return storedTokens;
  }

  async logout(): Promise<void> {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  isTokenExpired(tokens: StoredTokens): boolean {
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    return Date.now() >= (tokens.expiresAt - bufferTime);
  }
}
