const electron = require('electron');
require('dotenv').config();
const { app, BrowserWindow, ipcMain, shell } = electron;
const path = require('path');
const http = require('http');
const fs = require('fs');
const { AuthService } = require('./auth');

const isDev = process.env.NODE_ENV === 'development';
const OAUTH_PORT = 3000;
const OAUTH_HOST = '127.0.0.1';

let mainWindow: any;
let oauthServer: any;
interface PendingAuth {
  codeVerifier: string;
  state: string;
}

let pendingAuth: PendingAuth | null = null;

function getPendingAuthStorePath(): string {
  return path.join(app.getPath('userData'), 'pending-auth.json');
}

function persistPendingAuth(context: PendingAuth): void {
  try {
    fs.writeFileSync(getPendingAuthStorePath(), JSON.stringify({
      codeVerifier: context.codeVerifier,
      state: context.state,
      createdAt: Date.now(),
    }), 'utf8');
  } catch (error) {
    console.warn('Failed to persist pending auth context:', error);
  }
}

function readPersistedPendingAuth(): PendingAuth | null {
  try {
    const storePath = getPendingAuthStorePath();
    if (!fs.existsSync(storePath)) {
      return null;
    }

    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.codeVerifier || !parsed?.state) {
      return null;
    }
    return { codeVerifier: parsed.codeVerifier, state: parsed.state };
  } catch (error) {
    console.warn('Failed to read pending auth context:', error);
    return null;
  }
}

function clearPersistedPendingAuth(): void {
  try {
    const storePath = getPendingAuthStorePath();
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }
  } catch (error) {
    console.warn('Failed to clear pending auth context:', error);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createOAuthRedirectServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for authentication
ipcMain.handle('auth:start-login', async () => {
  try {
    const authService = new AuthService();
    const result = await authService.startLogin();
    pendingAuth = { codeVerifier: result.codeVerifier, state: result.state };
    persistPendingAuth(pendingAuth);
    return { authUrl: result.authUrl };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
});

ipcMain.handle('auth:get-tokens', async () => {
  try {
    const authService = new AuthService();
    const tokens = await authService.getStoredTokens();
    return tokens;
  } catch (error) {
    console.error('Get tokens error:', error);
    return null;
  }
});

ipcMain.handle('auth:get-user-profile', async () => {
  try {
    const authService = new AuthService();
    let tokens = await authService.getStoredTokens();
    if (!tokens) {
      return null;
    }

    const fetchProfile = async (accessToken: string) => {
      const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Graph /me failed (${response.status}): ${body}`);
      }

      const profile = await response.json() as { displayName?: string; mail?: string; userPrincipalName?: string };
      return {
        displayName: profile.displayName || '',
        email: profile.mail || profile.userPrincipalName || '',
      };
    };

    try {
      return await fetchProfile(tokens.accessToken);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('(401)') && tokens.refreshToken) {
        tokens = await authService.refreshAccessToken(tokens.refreshToken);
        return await fetchProfile(tokens.accessToken);
      }
      throw error;
    }
  } catch (error) {
    console.error('Get user profile error:', error);
    return null;
  }
});

ipcMain.handle('auth:refresh-token', async (_: any, refreshToken: string) => {
  try {
    const authService = new AuthService();
    const newTokens = await authService.refreshAccessToken(refreshToken);
    return newTokens;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
});

ipcMain.handle('auth:logout', async () => {
  try {
    const authService = new AuthService();
    await authService.logout();
    return true;
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
});

// Handle OAuth redirect (fallback when server is bypassed)
ipcMain.handle('auth:handle-redirect', async (_: any, url: string, authContext?: { codeVerifier?: string; state?: string }) => {
  try {
    const authService = new AuthService();
    const context = authContext?.codeVerifier ? authContext : pendingAuth;

    if (!context?.codeVerifier) {
      throw new Error('Missing code verifier for OAuth redirect handling');
    }

    const result = await authService.handleRedirect(url, context.codeVerifier, context.state);
    pendingAuth = null;
    return result;
  } catch (error) {
    console.error('Redirect handling error:', error);
    throw error;
  }
});

ipcMain.handle('app:open-external', async (_: any, url: string) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('Open external error:', error);
    throw error;
  }
});

function createOAuthRedirectServer(): void {
  if (oauthServer) {
    return;
  }

  oauthServer = http.createServer(async (req: any, res: any) => {
    try {
      if (!req.url) {
        res.writeHead(400).end('Bad Request');
        return;
      }

      const requestUrl = new URL(req.url, `http://${OAUTH_HOST}:${OAUTH_PORT}`);
      if (requestUrl.pathname !== '/redirect') {
        res.writeHead(404).end('Not Found');
        return;
      }

      const stateFromRequest = requestUrl.searchParams.get('state') || '';
      let authContext = pendingAuth;
      if (!authContext || (stateFromRequest && authContext.state !== stateFromRequest)) {
        const persisted = readPersistedPendingAuth();
        if (persisted && (!stateFromRequest || persisted.state === stateFromRequest)) {
          authContext = persisted;
          pendingAuth = persisted;
        }
      }

      if (!authContext) {
        res.writeHead(400).end('Missing code verifier');
        mainWindow?.webContents.send('auth:completed', { success: false, message: 'Missing code verifier' });
        return;
      }

      const authService = new AuthService();
      const redirectUrl = `http://${OAUTH_HOST}:${OAUTH_PORT}${requestUrl.pathname}${requestUrl.search}`;
      const redirectSuccess = await authService.handleRedirect(redirectUrl, authContext.codeVerifier, authContext.state);
      pendingAuth = null;
      clearPersistedPendingAuth();

      if (redirectSuccess) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authentication complete. You may close this window.</h2></body></html>');
        mainWindow?.webContents.send('auth:completed', { success: true });
      } else {
        const message = 'Authentication failed during token exchange. Please verify Azure app public client settings.';
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h2>Authentication failed.</h2><p>${message}</p><p>You may close this window.</p></body></html>`);
        mainWindow?.webContents.send('auth:completed', { success: false, message });
      }
      mainWindow?.focus();
    } catch (error: any) {
      console.error('OAuth redirect handling failed:', error);
      pendingAuth = null;
      clearPersistedPendingAuth();
      const message = error?.message || 'Authentication failed. Please verify your Azure AD app registration.';
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h2>Authentication failed.</h2><p>${message}</p><p>You may close this window.</p></body></html>`);
      mainWindow?.webContents.send('auth:completed', { success: false, message });
    }
  });

  oauthServer.listen(OAUTH_PORT, OAUTH_HOST, () => {
    console.log(`OAuth redirect server listening on http://${OAUTH_HOST}:${OAUTH_PORT}/redirect`);
  });
}
