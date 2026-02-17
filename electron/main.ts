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
const SCHEDULER_POLL_MS = 5000;

let mainWindow: any;
let oauthServer: any;
interface PendingAuth {
  codeVerifier: string;
  state: string;
}

let pendingAuth: PendingAuth | null = null;
let schedulerTimer: NodeJS.Timeout | null = null;

type SchedulerStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

interface SchedulerJob {
  id: string;
  campaignId: string;
  messageIds: string[];
  runAt: number;
  folderName: string;
  categoryName?: string;
  attempts: number;
  maxAttempts: number;
  status: SchedulerStatus;
  error?: string;
  lastResult?: {
    succeededMessageIds: string[];
    failedMessageIds: Array<{ messageId: string; error: string }>;
  };
  createdAt: number;
  updatedAt: number;
}

const schedulerJobs = new Map<string, SchedulerJob>();

function getPendingAuthStorePath(): string {
  return path.join(app.getPath('userData'), 'pending-auth.json');
}

function getSchedulerStorePath(): string {
  return path.join(app.getPath('userData'), 'scheduler-jobs.json');
}

function loadSchedulerJobs(): void {
  try {
    const filePath = getSchedulerStorePath();
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as SchedulerJob[];
    if (!Array.isArray(parsed)) return;
    parsed.forEach(job => {
      if (job?.id && Array.isArray(job.messageIds)) {
        schedulerJobs.set(job.id, job);
      }
    });
  } catch (error) {
    console.warn('Failed to load scheduler jobs:', error);
  }
}

function persistSchedulerJobs(): void {
  try {
    const payload = Array.from(schedulerJobs.values()).sort((a, b) => b.createdAt - a.createdAt);
    fs.writeFileSync(getSchedulerStorePath(), JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.warn('Failed to persist scheduler jobs:', error);
  }
}

function listSchedulerJobs(): SchedulerJob[] {
  return Array.from(schedulerJobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function updateSchedulerJob(jobId: string, updater: (job: SchedulerJob) => SchedulerJob): SchedulerJob | null {
  const current = schedulerJobs.get(jobId);
  if (!current) return null;
  const next = updater(current);
  schedulerJobs.set(jobId, { ...next, updatedAt: Date.now() });
  persistSchedulerJobs();
  return schedulerJobs.get(jobId) || null;
}

async function graphRequest(accessToken: string, endpoint: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph request failed (${response.status}) ${endpoint}: ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function ensureCampaignFolder(accessToken: string, folderName: string): Promise<string> {
  const childFolders = await graphRequest(
    accessToken,
    `/me/mailFolders/drafts/childFolders?$select=id,displayName&$top=200`
  ) as { value?: Array<{ id: string; displayName: string }> };

  const existing = (childFolders.value || []).find(
    folder => folder.displayName.toLowerCase() === folderName.toLowerCase()
  );
  if (existing) return existing.id;

  const created = await graphRequest(accessToken, '/me/mailFolders/drafts/childFolders', {
    method: 'POST',
    body: JSON.stringify({ displayName: folderName }),
  }) as { id: string };

  return created.id;
}

async function runSchedulerJob(job: SchedulerJob): Promise<void> {
  const authService = new AuthService();
  let tokens = await authService.getStoredTokens();
  if (!tokens) {
    throw new Error('Authentication required before scheduler execution.');
  }
  if (authService.isTokenExpired(tokens) && tokens.refreshToken) {
    tokens = await authService.refreshAccessToken(tokens.refreshToken);
  }

  const folderId = await ensureCampaignFolder(tokens.accessToken, job.folderName);
  const succeededMessageIds: string[] = [];
  const failedMessageIds: Array<{ messageId: string; error: string }> = [];

  for (const messageId of job.messageIds) {
    try {
      if (job.categoryName && job.categoryName.trim()) {
        await graphRequest(tokens.accessToken, `/me/messages/${messageId}`, {
          method: 'PATCH',
          body: JSON.stringify({ categories: [job.categoryName.trim()] }),
        });
      }
      await graphRequest(tokens.accessToken, `/me/messages/${messageId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId: folderId }),
      });
      succeededMessageIds.push(messageId);
    } catch (error) {
      failedMessageIds.push({
        messageId,
        error: error instanceof Error ? error.message : 'Unknown auto-sort failure',
      });
    }
  }

  const hasFailures = failedMessageIds.length > 0;
  const canRetry = hasFailures && job.attempts + 1 < job.maxAttempts;
  const nextStatus: SchedulerStatus = hasFailures ? (canRetry ? 'queued' : 'failed') : 'completed';
  const nextRunAt = canRetry ? Date.now() + Math.min(600000, (2 ** (job.attempts + 1)) * 30000) : job.runAt;

  updateSchedulerJob(job.id, current => ({
    ...current,
    attempts: current.attempts + 1,
    runAt: nextRunAt,
    status: nextStatus,
    error: hasFailures ? `${failedMessageIds.length} message(s) failed auto-sort` : undefined,
    lastResult: { succeededMessageIds, failedMessageIds },
  }));
}

function startScheduler(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(async () => {
    const now = Date.now();
    const dueJobs = listSchedulerJobs().filter(job => job.status === 'queued' && job.runAt <= now);
    for (const job of dueJobs) {
      updateSchedulerJob(job.id, current => ({ ...current, status: 'running', error: undefined }));
      try {
        await runSchedulerJob(job);
      } catch (error) {
        updateSchedulerJob(job.id, current => {
          const canRetry = current.attempts + 1 < current.maxAttempts;
          return {
            ...current,
            attempts: current.attempts + 1,
            status: canRetry ? 'queued' : 'failed',
            runAt: canRetry ? Date.now() + Math.min(600000, (2 ** (current.attempts + 1)) * 30000) : current.runAt,
            error: error instanceof Error ? error.message : 'Scheduler execution failed',
          };
        });
      }
    }
  }, SCHEDULER_POLL_MS);
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
  loadSchedulerJobs();
  startScheduler();
  createWindow();
  createOAuthRedirectServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
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

ipcMain.handle('campaign:scheduler-enqueue', async (_: any, payload: {
  campaignId: string;
  messageIds: string[];
  runAt: number;
  folderName: string;
  categoryName?: string;
  maxAttempts?: number;
}) => {
  const now = Date.now();
  const job: SchedulerJob = {
    id: `job-${now}-${Math.random().toString(36).slice(2, 8)}`,
    campaignId: payload.campaignId,
    messageIds: Array.from(new Set(payload.messageIds.filter(Boolean))),
    runAt: Math.max(payload.runAt || now, now),
    folderName: payload.folderName || `Campaign ${new Date().toLocaleDateString()}`,
    categoryName: payload.categoryName,
    attempts: 0,
    maxAttempts: Math.max(1, payload.maxAttempts || 3),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
  schedulerJobs.set(job.id, job);
  persistSchedulerJobs();
  return job;
});

ipcMain.handle('campaign:scheduler-list', async () => {
  return listSchedulerJobs();
});

ipcMain.handle('campaign:scheduler-pause', async (_: any, jobId: string) => {
  const updated = updateSchedulerJob(jobId, current => ({
    ...current,
    status: current.status === 'queued' || current.status === 'running' ? 'paused' : current.status,
  }));
  return updated;
});

ipcMain.handle('campaign:scheduler-resume', async (_: any, jobId: string) => {
  const updated = updateSchedulerJob(jobId, current => ({
    ...current,
    status: current.status === 'paused' ? 'queued' : current.status,
    runAt: current.runAt < Date.now() ? Date.now() + 1000 : current.runAt,
  }));
  return updated;
});

ipcMain.handle('campaign:scheduler-cancel', async (_: any, jobId: string) => {
  const updated = updateSchedulerJob(jobId, current => ({
    ...current,
    status: 'cancelled',
  }));
  return updated;
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
