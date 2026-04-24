const electron = require("electron");
require("dotenv").config();
const { app, BrowserWindow, ipcMain, shell } = electron;
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const { AuthService, parseScopesFromAccessToken, REQUIRED_SCOPES } = require("./auth");
const { graphFetch, graphJson } = require("./graphHelper");
const { dispatchRecipient, appendRunLog } = require("./sendDispatcher");
const { CompanyGeneratorService } = require("./companyGeneratorService");
const {
  guessEmail,
  guessEmailBatch,
  backtestPatterns,
  parseLinkedInUrl,
  detectDomainPattern,
  inferDomainCandidates,
} = require("./emailPatterns");
const { verifyMx } = require("./emailPatternService");
const { detectBounce } = require("./bounceParser");
const { initDb } = require("./db");
const recipientsRepo = require("./repository/recipients");
const repliesRepo = require("./repository/replies");
const runsRepo = require("./repository/runs");
const deltaTokensRepo = require("./repository/deltaTokens");
const metricsRepo = require("./repository/metrics");
const campaignsRepo = require("./repository/campaigns");
const { isMigrated, runMigration } = require("./migrate-from-localstorage");
const { classifyAndPersist, reclassify } = require("./classifyReply");

const isDev = process.env.NODE_ENV === "development";
const OAUTH_PORT = 3000;
const OAUTH_HOST = "127.0.0.1";
const EXTERNAL_URL_ALLOWED_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

function openSafeExternal(raw: string): Promise<void> | void {
  try {
    const u = new URL(raw);
    if (!EXTERNAL_URL_ALLOWED_PROTOCOLS.has(u.protocol)) {
      console.warn("Blocked openExternal for disallowed protocol:", u.protocol);
      return;
    }
    return shell.openExternal(raw);
  } catch {
    console.warn("Blocked openExternal for invalid URL");
  }
}

let mainWindow: any;
let oauthServer: any;
interface PendingAuth {
  codeVerifier: string;
  state: string;
}

let pendingAuth: PendingAuth | null = null;

function getPendingAuthStorePath(): string {
  return path.join(app.getPath("userData"), "pending-auth.json");
}
const MAX_ATTACHMENT_BYTES = 150 * 1024 * 1024; // Graph per-message cap

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
};

function resolveAttachmentPath(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  return trimmed;
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

async function loadAttachmentFromPath(
  raw: string,
): Promise<{ name: string; mime: string; buffer: Buffer }> {
  const resolved = resolveAttachmentPath(raw);
  const stat = await fsp.stat(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment exceeds 150 MB Graph limit (${stat.size} bytes): ${resolved}`);
  }
  const buffer = await fsp.readFile(resolved);
  return {
    name: path.basename(resolved),
    mime: mimeFromPath(resolved),
    buffer,
  };
}

ipcMain.handle("tools:split-packet", async (event: any, rawInput: string, rawOutput: string) => {
  const { spawn } = require("node:child_process");
  const inputPath = resolveAttachmentPath(rawInput);
  const outputPath = resolveAttachmentPath(rawOutput);
  const scriptDir = path.join(os.homedir(), "Desktop", "hyperloop_packet_scripts");
  const pythonBin = path.join(scriptDir, ".venv", "bin", "python");
  const scriptPath = path.join(scriptDir, "split_packet_pdf.py");
  if (!fs.existsSync(pythonBin)) {
    return { ok: false, error: `python venv not found at ${pythonBin}` };
  }
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `split script not found at ${scriptPath}` };
  }
  if (!fs.existsSync(inputPath)) {
    return { ok: false, error: `input PDF not found at ${inputPath}` };
  }
  await fsp.mkdir(outputPath, { recursive: true });
  return await new Promise((resolve) => {
    const child = spawn(pythonBin, [scriptPath, "--input", inputPath, "--output", outputPath], {
      cwd: scriptDir,
    });
    const emit = (line: string) => {
      try {
        event.sender.send("tools:split-packet:log", line);
      } catch {}
    };
    child.stdout.on("data", (data: Buffer) => {
      data
        .toString()
        .split(/\r?\n/)
        .filter((l: string) => l.length > 0)
        .forEach(emit);
    });
    child.stderr.on("data", (data: Buffer) => {
      data
        .toString()
        .split(/\r?\n/)
        .filter((l: string) => l.length > 0)
        .forEach((l: string) => emit(`[stderr] ${l}`));
    });
    child.on("close", async (code: number) => {
      if (code !== 0) {
        resolve({ ok: false, error: `python exited with code ${code}` });
        return;
      }
      try {
        const files = await fsp.readdir(outputPath);
        const pdfs = files.filter((f: string) => f.toLowerCase().endsWith(".pdf"));
        resolve({ ok: true, filesWritten: pdfs.length });
      } catch (err: any) {
        resolve({ ok: true, filesWritten: undefined, error: err?.message });
      }
    });
    child.on("error", (err: Error) => {
      resolve({ ok: false, error: err.message });
    });
  });
});

ipcMain.handle("attachment:check-path", async (_: any, rawPath: string) => {
  try {
    const resolved = resolveAttachmentPath(rawPath || "");
    if (!resolved) {
      return { exists: false, error: "empty path" };
    }
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) {
      return { exists: false, error: "not a file" };
    }
    return {
      exists: true,
      sizeBytes: stat.size,
      fileName: path.basename(resolved),
    };
  } catch (err: any) {
    return { exists: false, error: err?.message || String(err) };
  }
});

async function _graphRequest(
  accessToken: string,
  endpoint: string,
  init?: RequestInit,
): Promise<any> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
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

function persistPendingAuth(context: PendingAuth): void {
  try {
    fs.writeFileSync(
      getPendingAuthStorePath(),
      JSON.stringify({
        codeVerifier: context.codeVerifier,
        state: context.state,
        createdAt: Date.now(),
      }),
      "utf8",
    );
  } catch (error) {
    console.warn("Failed to persist pending auth context:", error);
  }
}

function readPersistedPendingAuth(): PendingAuth | null {
  try {
    const storePath = getPendingAuthStorePath();
    if (!fs.existsSync(storePath)) {
      return null;
    }

    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.codeVerifier || !parsed?.state) {
      return null;
    }
    return { codeVerifier: parsed.codeVerifier, state: parsed.state };
  } catch (error) {
    console.warn("Failed to read pending auth context:", error);
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
    console.warn("Failed to clear pending auth context:", error);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL("http://localhost:5273");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    openSafeExternal(url);
    return { action: "deny" };
  });
}

// App event handlers
app.whenReady().then(() => {
  try {
    initDb(app.getPath("userData"));
  } catch (err) {
    console.error("DB init failed:", err);
  }
  createWindow();
  createOAuthRedirectServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for authentication
ipcMain.handle("auth:start-login", async () => {
  try {
    const authService = new AuthService();
    const result = await authService.startLogin();
    pendingAuth = { codeVerifier: result.codeVerifier, state: result.state };
    persistPendingAuth(pendingAuth);
    return { authUrl: result.authUrl };
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
});

ipcMain.handle("auth:get-tokens", async () => {
  try {
    const authService = new AuthService();
    const tokens = await authService.getStoredTokens();
    return tokens;
  } catch (error) {
    console.error("Get tokens error:", error);
    return null;
  }
});

ipcMain.handle("auth:get-user-profile", async () => {
  try {
    const authService = new AuthService();
    const tokens = await authService.getStoredTokens();
    if (!tokens) return null;

    const profile = await graphJson(
      authService,
      "/me?$select=displayName,mail,userPrincipalName,id",
    );
    return {
      displayName: profile.displayName || "",
      email: profile.mail || profile.userPrincipalName || "",
      upn: profile.userPrincipalName || profile.mail || "",
      id: profile.id || "",
    };
  } catch (error) {
    console.error("Get user profile error:", error);
    return null;
  }
});

ipcMain.handle("auth:refresh-token", async (_: any, refreshToken: string) => {
  try {
    const authService = new AuthService();
    const newTokens = await authService.refreshAccessToken(refreshToken);
    return newTokens;
  } catch (error) {
    console.error("Token refresh error:", error);
    throw error;
  }
});

ipcMain.handle(
  "mail:dispatch-run",
  async (
    event: any,
    payload: {
      runId: string;
      recipients: Array<any>;
      attachment?: { name: string; mime: string; base64: string };
      mode: "draft" | "send-now" | "schedule";
      staggerSeconds: number;
      scheduledForIso?: string;
      campaignId?: string;
      campaignName?: string;
      identityEmail?: string;
    },
  ) => {
    const authService = new AuthService();
    const tokens = await authService.getStoredTokens();
    if (!tokens) {
      return {
        submitted: 0,
        failed: payload.recipients.length,
        results: [],
        error: "Not signed in",
      };
    }

    const identityEmail = (payload.identityEmail || "").toLowerCase();
    try {
      runsRepo.createRun({
        id: payload.runId,
        campaignId: payload.campaignId ?? null,
        campaignName: payload.campaignName ?? null,
        identityEmail,
        mode: payload.mode,
        staggerSeconds: payload.staggerSeconds,
        scheduledFor: payload.scheduledForIso ?? null,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("createRun failed:", err);
    }

    const userDataDir = app.getPath("userData");
    const sharedAttachment = payload.attachment
      ? {
          name: payload.attachment.name,
          mime: payload.attachment.mime,
          buffer: Buffer.from(payload.attachment.base64, "base64"),
        }
      : undefined;

    await appendRunLog(userDataDir, payload.runId, {
      phase: "run-start",
      mode: payload.mode,
      staggerSeconds: payload.staggerSeconds,
      scheduledForIso: payload.scheduledForIso,
      recipientCount: payload.recipients.length,
      attachmentName: sharedAttachment?.name,
      attachmentBytes: sharedAttachment?.buffer.length,
    });

    const useDeferred =
      payload.mode === "schedule" || (payload.mode === "send-now" && payload.staggerSeconds > 0);

    const baseTimeMs =
      payload.mode === "schedule" && payload.scheduledForIso
        ? new Date(payload.scheduledForIso).getTime()
        : Date.now() + 60 * 1000;

    const results: any[] = [];
    let submitted = 0;
    let failed = 0;
    const sendChannel = `mail:dispatch-progress:${payload.runId}`;

    for (let i = 0; i < payload.recipients.length; i++) {
      const recipient = payload.recipients[i];

      let perRowAttachment: { name: string; mime: string; buffer: Buffer } | undefined;
      let perRowAttachmentError: string | undefined;
      if (recipient.attachmentPath) {
        try {
          perRowAttachment = await loadAttachmentFromPath(recipient.attachmentPath);
        } catch (err: any) {
          perRowAttachmentError = err?.message || String(err);
        }
      }

      let dispatchOptions: any;
      if (useDeferred) {
        const deferredMs = baseTimeMs + i * payload.staggerSeconds * 1000;
        dispatchOptions = {
          mode: "send-now",
          deferredSendIso: new Date(deferredMs).toISOString(),
          attachment: sharedAttachment,
        };
      } else {
        dispatchOptions = {
          mode: payload.mode,
          attachment: sharedAttachment,
        };
      }

      // If the per-row path exists but failed to load, fail the row before it
      // ever hits Graph — consistent with the "rest of the batch keeps running"
      // contract for missing attachments.
      let result: any;
      if (perRowAttachmentError) {
        result = {
          recipientId: recipient.recipientId,
          ok: false,
          error: `Attachment path not readable: ${perRowAttachmentError}`,
        };
      } else {
        const recipientWithAttachment = perRowAttachment
          ? { ...recipient, attachment: perRowAttachment }
          : recipient;
        result = await dispatchRecipient(authService, recipientWithAttachment, dispatchOptions);
      }
      if (result.ok) submitted++;
      else failed++;

      let dbError: string | undefined;
      try {
        const status =
          payload.mode === "draft"
            ? result.ok
              ? "draft"
              : "failed"
            : result.ok
              ? "submitted"
              : "failed";
        recipientsRepo.upsertRecipient({
          id: recipient.recipientId,
          runId: payload.runId,
          campaignId: payload.campaignId ?? null,
          campaignName: payload.campaignName ?? null,
          identityEmail: identityEmail || "unknown@unknown",
          toEmail: recipient.toEmail,
          toName: recipient.toName ?? null,
          subject: recipient.subject ?? null,
          graphMessageId: result.messageId ?? null,
          internetMessageId: result.internetMessageId ?? null,
          conversationId: result.conversationId ?? null,
          mode: payload.mode,
          scheduledFor: dispatchOptions.deferredSendIso ?? payload.scheduledForIso ?? null,
          submittedAt: result.ok ? new Date().toISOString() : null,
          status,
          failureReason: result.error ?? null,
        });
      } catch (err: any) {
        dbError = err?.message || String(err);
        console.warn("upsertRecipient failed:", err);
      }

      // Surface DB-tracking failures to the caller so the UI can warn the user the
      // send happened but won't appear in the tracked recipients list.
      results.push(dbError ? { ...result, dbError } : result);

      await appendRunLog(userDataDir, payload.runId, {
        phase: "recipient",
        recipientId: recipient.recipientId,
        toEmail: recipient.toEmail,
        ok: result.ok,
        messageId: result.messageId,
        conversationId: result.conversationId,
        error: result.error,
        deferredSendIso: dispatchOptions.deferredSendIso,
      });

      try {
        event.sender.send(sendChannel, {
          index: i,
          total: payload.recipients.length,
          result,
        });
      } catch (_e) {
        // sender might be gone if window closed
      }

      if (!useDeferred && payload.staggerSeconds > 0 && i < payload.recipients.length - 1) {
        await new Promise((r) => setTimeout(r, payload.staggerSeconds * 1000));
      }
    }

    await appendRunLog(userDataDir, payload.runId, {
      phase: "run-end",
      submitted,
      failed,
    });

    try {
      runsRepo.finalizeRun(payload.runId, submitted, failed);
    } catch (err) {
      console.warn("finalizeRun failed:", err);
    }

    return { submitted, failed, results };
  },
);

ipcMain.handle(
  "mail:poll-inbox-delta",
  async (_: any, payload: { deltaLink?: string; identityEmail?: string }) => {
    try {
      const authService = new AuthService();
      const tokens = await authService.getStoredTokens();
      if (!tokens) {
        return { ok: false, error: "Not signed in", messages: [] };
      }

      let url =
        payload.deltaLink ||
        `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,internetMessageHeaders,isRead,body,singleValueExtendedProperties&$expand=singleValueExtendedProperties($filter=id eq 'String 0x007D')`;

      const messages: any[] = [];
      let nextDeltaLink: string | undefined;
      let pendingNextLink: string | undefined;
      let moreAvailable = false;
      let pageCount = 0;
      const MAX_PAGES = 20;

      while (url && pageCount < MAX_PAGES) {
        pageCount++;
        const res = await graphFetch(authService, url);
        if (res.status === 410) {
          return {
            ok: false,
            expired: true,
            messages: [],
            error: "Delta token expired, restart from scratch",
          };
        }
        if (!res.ok) {
          const body = await res.text();
          return { ok: false, error: `Inbox delta failed (${res.status}): ${body}`, messages: [] };
        }
        const data: any = await res.json();
        if (Array.isArray(data.value)) {
          for (const m of data.value) {
            const transportProp = Array.isArray(m.singleValueExtendedProperties)
              ? m.singleValueExtendedProperties.find(
                  (p: any) => typeof p?.id === "string" && p.id.toLowerCase().includes("0x007d"),
                )
              : undefined;
            messages.push({
              id: m.id,
              conversationId: m.conversationId,
              subject: m.subject,
              from: m.from?.emailAddress?.address || "",
              fromName: m.from?.emailAddress?.name || "",
              receivedDateTime: m.receivedDateTime,
              bodyPreview: m.bodyPreview,
              bodyContent: m.body?.content || "",
              bodyContentType: m.body?.contentType || "",
              isRead: m.isRead,
              transportHeaders: transportProp?.value || "",
            });
          }
        }
        if (data["@odata.nextLink"]) {
          pendingNextLink = data["@odata.nextLink"];
          url = data["@odata.nextLink"];
        } else if (data["@odata.deltaLink"]) {
          nextDeltaLink = data["@odata.deltaLink"];
          pendingNextLink = undefined;
          break;
        } else {
          pendingNextLink = undefined;
          break;
        }
      }

      // Page cap hit before Graph gave us a deltaLink. Hand the intermediate nextLink
      // back so the renderer can resume immediately without losing state.
      if (pageCount >= MAX_PAGES && pendingNextLink && !nextDeltaLink) {
        nextDeltaLink = pendingNextLink;
        moreAvailable = true;
      }

      const identity = (payload.identityEmail || "").toLowerCase();
      const bounceHits: Array<{ failedRecipients: string[]; diagnostic?: string }> = [];
      if (identity) {
        for (const m of messages) {
          const det = detectBounce({
            fromAddress: m.from,
            subject: m.subject,
            rawHeaders: m.transportHeaders,
            body: m.bodyContent || m.bodyPreview,
          });
          if (det.isBounce && det.failedRecipients.length > 0) {
            bounceHits.push({ failedRecipients: det.failedRecipients, diagnostic: det.diagnostic });
            try {
              const { getDb } = require("./db");
              const db = getDb();
              for (const email of det.failedRecipients) {
                db.prepare(`
                UPDATE recipients SET status = 'bounced', failure_reason = COALESCE(?, failure_reason)
                WHERE LOWER(to_email) = ? AND identity_email = ? AND status != 'bounced'
                  AND id = (SELECT id FROM recipients WHERE LOWER(to_email) = ? AND identity_email = ? ORDER BY submitted_at DESC LIMIT 1)
              `).run(
                  det.diagnostic ?? null,
                  email.toLowerCase(),
                  identity,
                  email.toLowerCase(),
                  identity,
                );
              }
            } catch (err) {
              console.warn("mark-bounced (inline) failed:", err);
            }
          }
        }
      }

      return {
        ok: true,
        messages,
        deltaLink: nextDeltaLink,
        moreAvailable,
        bounces: bounceHits,
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error), messages: [] };
    }
  },
);

ipcMain.handle(
  "mail:send-drafts",
  async (
    event: any,
    payload: {
      runId: string;
      messageIds: string[];
      staggerSeconds: number;
      scheduledForIso?: string;
    },
  ) => {
    const authService = new AuthService();
    const tokens = await authService.getStoredTokens();
    if (!tokens) {
      return { sent: 0, failed: payload.messageIds.length, results: [], error: "Not signed in" };
    }

    const userDataDir = app.getPath("userData");
    await appendRunLog(userDataDir, payload.runId, {
      phase: "send-drafts-start",
      count: payload.messageIds.length,
      staggerSeconds: payload.staggerSeconds,
      scheduledForIso: payload.scheduledForIso,
    });

    const useDeferred = !!payload.scheduledForIso || payload.staggerSeconds > 0;

    const baseTimeMs = payload.scheduledForIso
      ? new Date(payload.scheduledForIso).getTime()
      : Date.now() + 60 * 1000;

    const results: any[] = [];
    let sent = 0;
    let failed = 0;
    const channel = `mail:send-drafts-progress:${payload.runId}`;

    for (let i = 0; i < payload.messageIds.length; i++) {
      const messageId = payload.messageIds[i];
      let ok = false;
      let error: string | undefined;

      try {
        if (useDeferred) {
          const deferredMs = baseTimeMs + i * payload.staggerSeconds * 1000;
          const patchRes = await graphFetch(authService, `/me/messages/${messageId}`, {
            method: "PATCH",
            body: JSON.stringify({
              singleValueExtendedProperties: [
                { id: "SystemTime 0x3FEF", value: new Date(deferredMs).toISOString() },
              ],
            }),
          });
          if (!patchRes.ok) {
            throw new Error(
              `PATCH deferred-property failed (${patchRes.status}): ${await patchRes.text()}`,
            );
          }
        }

        const sendRes = await graphFetch(authService, `/me/messages/${messageId}/send`, {
          method: "POST",
        });
        if (!sendRes.ok) {
          throw new Error(`Send failed (${sendRes.status}): ${await sendRes.text()}`);
        }
        ok = true;
        sent++;
      } catch (e: any) {
        error = e?.message || String(e);
        failed++;
      }

      let dbError: string | undefined;
      try {
        const db = require("./db").getDb();
        if (ok) {
          db.prepare(
            `UPDATE recipients SET status = 'submitted', submitted_at = ? WHERE graph_message_id = ?`,
          ).run(new Date().toISOString(), messageId);
        } else {
          db.prepare(
            `UPDATE recipients SET status = 'failed', failure_reason = ? WHERE graph_message_id = ?`,
          ).run(error ?? null, messageId);
        }
      } catch (err: any) {
        dbError = err?.message || String(err);
        console.warn("update recipient on send-draft failed:", err);
      }

      const result = dbError ? { messageId, ok, error, dbError } : { messageId, ok, error };
      results.push(result);

      await appendRunLog(userDataDir, payload.runId, {
        phase: "send-draft",
        messageId,
        ok,
        error,
      });

      try {
        event.sender.send(channel, { index: i, total: payload.messageIds.length, result });
      } catch (_) {}

      if (!useDeferred && payload.staggerSeconds > 0 && i < payload.messageIds.length - 1) {
        await new Promise((r) => setTimeout(r, payload.staggerSeconds * 1000));
      }
    }

    await appendRunLog(userDataDir, payload.runId, {
      phase: "send-drafts-end",
      sent,
      failed,
    });

    return { sent, failed, results };
  },
);

ipcMain.handle("auth:check-scopes", async () => {
  try {
    const authService = new AuthService();
    const tokens = await authService.getStoredTokens();
    if (!tokens) {
      return { signedIn: false, missing: REQUIRED_SCOPES };
    }
    const granted = parseScopesFromAccessToken(tokens.accessToken);
    const missing = REQUIRED_SCOPES.filter((s: string) => !granted.includes(s));
    return { signedIn: true, granted, missing };
  } catch (error: any) {
    console.error("Scope check error:", error);
    return { signedIn: false, missing: REQUIRED_SCOPES, error: error?.message || String(error) };
  }
});

ipcMain.handle("auth:logout", async () => {
  try {
    const authService = new AuthService();
    await authService.logout();
    return true;
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
});

// Handle OAuth redirect (fallback when server is bypassed)
ipcMain.handle(
  "auth:handle-redirect",
  async (_: any, url: string, authContext?: { codeVerifier?: string; state?: string }) => {
    try {
      const authService = new AuthService();
      const context = authContext?.codeVerifier ? authContext : pendingAuth;

      if (!context?.codeVerifier) {
        throw new Error("Missing code verifier for OAuth redirect handling");
      }

      const result = await authService.handleRedirect(url, context.codeVerifier, context.state);
      pendingAuth = null;
      return result;
    } catch (error) {
      console.error("Redirect handling error:", error);
      throw error;
    }
  },
);

ipcMain.handle("app:open-external", async (_: any, url: string) => {
  try {
    await openSafeExternal(url);
    return true;
  } catch (error) {
    console.error("Open external error:", error);
    throw error;
  }
});

// Company Discovery Handler
ipcMain.handle(
  "company:search",
  async (
    _: any,
    query: string,
    filters?: {
      industry?: string;
      size?: string;
      location?: string;
      excludeNames?: string[];
      campaignDescription?: string;
      refinement?: string;
    },
  ) => {
    try {
      // Cap excludeNames so the prompt doesn't grow unbounded across repeated "find more" clicks.
      const cappedFilters = filters
        ? {
            ...filters,
            excludeNames: (filters.excludeNames ?? []).slice(-100),
          }
        : undefined;
      const generator = new CompanyGeneratorService();
      return await generator.search(query, cappedFilters);
    } catch (error) {
      console.error("Company search error:", error);
      throw error;
    }
  },
);

// Email pattern guesser IPC handlers
ipcMain.handle(
  "email:guess",
  async (
    _: any,
    fullName: string,
    domain: string,
    knownContacts: { name: string; email: string }[],
  ) => {
    try {
      if (!fullName || !domain || !Array.isArray(knownContacts)) return [];
      const capped = knownContacts.slice(0, 5000);
      return guessEmail(fullName, domain, capped);
    } catch (error) {
      console.error("Email guess error:", error);
      return [];
    }
  },
);

ipcMain.handle("email:backtest", async (_: any, contacts: { name: string; email: string }[]) => {
  try {
    if (!Array.isArray(contacts))
      return {
        totalContacts: 0,
        testableContacts: 0,
        correctGuesses: 0,
        accuracy: 0,
        perDomain: [],
      };
    const capped = contacts.slice(0, 5000);
    return backtestPatterns(capped);
  } catch (error) {
    console.error("Backtest error:", error);
    throw error;
  }
});

ipcMain.handle("email:verify-mx", async (_: any, domain: string) => {
  try {
    return await verifyMx(domain);
  } catch (error) {
    console.error("MX verify error:", error);
    return { valid: false, domain, exchanges: [], cached: false };
  }
});

ipcMain.handle("email:parse-linkedin", async (_: any, url: string) => {
  try {
    return parseLinkedInUrl(url);
  } catch (error) {
    console.error("LinkedIn parse error:", error);
    return null;
  }
});

ipcMain.handle(
  "email:detect-pattern",
  async (_: any, contacts: { name: string; email: string }[]) => {
    try {
      return detectDomainPattern(contacts);
    } catch (error) {
      console.error("Pattern detection error:", error);
      return null;
    }
  },
);

ipcMain.handle("email:resolve-domain", async (_: any, companyName: string) => {
  try {
    const candidates = inferDomainCandidates(companyName);
    for (const candidate of candidates) {
      const mx = await verifyMx(candidate);
      if (mx.valid) {
        return { domain: candidate, mxValid: true, candidates };
      }
    }
    return { domain: null, mxValid: false, candidates };
  } catch (error) {
    console.error("Domain resolve error:", error);
    return { domain: null, mxValid: false, candidates: [] };
  }
});

ipcMain.handle("mail:poll-sent-items-delta", async (_: any, payload: { deltaLink?: string }) => {
  try {
    const authService = new AuthService();
    const tokens = await authService.getStoredTokens();
    if (!tokens) {
      return { ok: false, error: "Not signed in", messages: [] };
    }

    let url =
      payload.deltaLink ||
      `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages/delta?$select=id,conversationId,subject,toRecipients,sentDateTime,receivedDateTime,internetMessageId`;

    const messages: any[] = [];
    let nextDeltaLink: string | undefined;
    let pendingNextLink: string | undefined;
    let moreAvailable = false;
    let pageCount = 0;
    const MAX_PAGES = 20;

    while (url && pageCount < MAX_PAGES) {
      pageCount++;
      const res = await graphFetch(authService, url);
      if (res.status === 410) {
        return { ok: false, expired: true, messages: [], error: "SentItems delta token expired" };
      }
      if (!res.ok) {
        const body = await res.text();
        return {
          ok: false,
          error: `SentItems delta failed (${res.status}): ${body}`,
          messages: [],
        };
      }
      const data: any = await res.json();
      if (Array.isArray(data.value)) {
        for (const m of data.value) {
          messages.push({
            id: m.id,
            conversationId: m.conversationId,
            internetMessageId: m.internetMessageId,
            subject: m.subject,
            toEmails: Array.isArray(m.toRecipients)
              ? m.toRecipients.map((r: any) => r?.emailAddress?.address || "").filter(Boolean)
              : [],
            sentDateTime: m.sentDateTime,
            receivedDateTime: m.receivedDateTime,
          });
        }
      }
      if (data["@odata.nextLink"]) {
        pendingNextLink = data["@odata.nextLink"];
        url = data["@odata.nextLink"];
      } else if (data["@odata.deltaLink"]) {
        nextDeltaLink = data["@odata.deltaLink"];
        pendingNextLink = undefined;
        break;
      } else {
        pendingNextLink = undefined;
        break;
      }
    }

    if (pageCount >= MAX_PAGES && pendingNextLink && !nextDeltaLink) {
      nextDeltaLink = pendingNextLink;
      moreAvailable = true;
    }

    return { ok: true, messages, deltaLink: nextDeltaLink, moreAvailable };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error), messages: [] };
  }
});

// ---------- DB IPC ----------

ipcMain.handle(
  "db:record-replies",
  async (
    _: any,
    replies: Array<{
      id: string;
      conversationId: string;
      identityEmail: string;
      fromAddress?: string;
      fromName?: string;
      subject?: string;
      bodyPreview?: string;
      rawBody?: string;
      receivedAt: string;
    }>,
  ) => {
    const inserted: any[] = [];
    for (const r of replies) {
      const row = repliesRepo.insertReplyIfNew(r);
      if (row) {
        inserted.push(row);
        classifyAndPersist(row.id).catch((err: any) =>
          console.warn("classify failed for", row.id, err?.message || err),
        );
      }
    }
    return { inserted, all: repliesRepo.listReplies({ identityEmail: replies[0]?.identityEmail }) };
  },
);

ipcMain.handle("replies:reclassify", async (_: any, replyId: string) => {
  return reclassify(replyId);
});

ipcMain.handle("db:list-replies", async (_: any, filter?: { identityEmail?: string }) => {
  return repliesRepo.listReplies(filter);
});

ipcMain.handle(
  "db:list-recipients",
  async (_: any, filter?: { identityEmail?: string; runId?: string; campaignId?: string }) => {
    return recipientsRepo.listRecipients(filter);
  },
);

ipcMain.handle("db:list-runs", async (_: any, filter?: { identityEmail?: string }) => {
  return runsRepo.listRuns(filter);
});

ipcMain.handle("db:metrics", async (_: any, filter?: { identityEmail?: string }) => {
  return metricsRepo.computeMetrics(filter);
});

ipcMain.handle(
  "db:list-campaigns",
  async (_: any, filter?: { identityEmail?: string; sinceIso?: string }) => {
    return campaignsRepo.listCampaignAggregates(filter);
  },
);

ipcMain.handle(
  "db:recent-activity",
  async (_: any, filter?: { identityEmail?: string; limit?: number }) => {
    return campaignsRepo.recentActivity(filter);
  },
);

ipcMain.handle(
  "db:timeline",
  async (_: any, filter?: { identityEmail?: string; days?: number }) => {
    return campaignsRepo.sendsRepliesTimeline(filter);
  },
);

ipcMain.handle("db:get-recipient-timeline", async (_: any, id: string) => {
  return recipientsRepo.getRecipientTimeline(id);
});

ipcMain.handle("db:mark-reply-seen", async (_: any, id: string) => {
  repliesRepo.markSeen(id);
  return true;
});

ipcMain.handle("db:mark-all-replies-seen", async (_: any, identityEmail?: string) => {
  repliesRepo.markAllSeen(identityEmail);
  return true;
});

ipcMain.handle("db:get-delta-token", async (_: any, identityEmail: string, folder: string) => {
  return deltaTokensRepo.getDeltaToken(identityEmail, folder);
});

ipcMain.handle(
  "db:set-delta-token",
  async (_: any, identityEmail: string, folder: string, deltaLink: string) => {
    deltaTokensRepo.setDeltaToken(identityEmail, folder, deltaLink);
    return true;
  },
);

ipcMain.handle("db:clear-delta-token", async (_: any, identityEmail: string, folder: string) => {
  deltaTokensRepo.clearDeltaToken(identityEmail, folder);
  return true;
});

ipcMain.handle(
  "db:mark-delivered",
  async (
    _: any,
    match: {
      internetMessageId?: string;
      conversationId?: string;
      toEmail?: string;
      identityEmail: string;
      sentAt: string;
    },
  ) => {
    const { getDb } = require("./db");
    const db = getDb();
    if (match.internetMessageId) {
      const info = db
        .prepare(`
      UPDATE recipients SET status = 'delivered', delivered_at = @sentAt
      WHERE internet_message_id = @imi AND identity_email = @identity AND status NOT IN ('delivered', 'bounced')
    `)
        .run({
          sentAt: match.sentAt,
          imi: match.internetMessageId,
          identity: match.identityEmail.toLowerCase(),
        });
      if (info.changes > 0) return { updated: info.changes };
    }
    if (match.conversationId && match.toEmail) {
      const info = db
        .prepare(`
      UPDATE recipients SET status = 'delivered', delivered_at = @sentAt
      WHERE conversation_id = @conv AND LOWER(to_email) = @toEmail AND identity_email = @identity AND status NOT IN ('delivered', 'bounced')
    `)
        .run({
          sentAt: match.sentAt,
          conv: match.conversationId,
          toEmail: match.toEmail.toLowerCase(),
          identity: match.identityEmail.toLowerCase(),
        });
      return { updated: info.changes };
    }
    return { updated: 0 };
  },
);

ipcMain.handle(
  "db:mark-bounced",
  async (
    _: any,
    match: { failedRecipients: string[]; identityEmail: string; diagnostic?: string },
  ) => {
    const { getDb } = require("./db");
    const db = getDb();
    let totalUpdated = 0;
    for (const email of match.failedRecipients) {
      const info = db
        .prepare(`
      UPDATE recipients SET status = 'bounced', failure_reason = COALESCE(@diag, failure_reason)
      WHERE LOWER(to_email) = @toEmail AND identity_email = @identity AND status NOT IN ('bounced')
      AND id IN (SELECT id FROM recipients WHERE LOWER(to_email) = @toEmail AND identity_email = @identity ORDER BY submitted_at DESC LIMIT 1)
    `)
        .run({
          diag: match.diagnostic ?? null,
          toEmail: email.toLowerCase(),
          identity: match.identityEmail.toLowerCase(),
        });
      totalUpdated += info.changes;
    }
    return { updated: totalUpdated };
  },
);

ipcMain.handle("db:is-migrated", async () => isMigrated());

ipcMain.handle("db:run-migration", async (_: any, dump: any) => {
  if (isMigrated()) return { alreadyMigrated: true };
  return runMigration(dump);
});

function createOAuthRedirectServer(): void {
  if (oauthServer) {
    return;
  }

  oauthServer = http.createServer(async (req: any, res: any) => {
    try {
      if (!req.url) {
        res.writeHead(400).end("Bad Request");
        return;
      }

      const requestUrl = new URL(req.url, `http://${OAUTH_HOST}:${OAUTH_PORT}`);
      if (requestUrl.pathname !== "/redirect") {
        res.writeHead(404).end("Not Found");
        return;
      }

      const stateFromRequest = requestUrl.searchParams.get("state") || "";
      let authContext = pendingAuth;
      if (!authContext || (stateFromRequest && authContext.state !== stateFromRequest)) {
        const persisted = readPersistedPendingAuth();
        if (persisted && (!stateFromRequest || persisted.state === stateFromRequest)) {
          authContext = persisted;
          pendingAuth = persisted;
        }
      }

      if (!authContext) {
        res.writeHead(400).end("Missing code verifier");
        mainWindow?.webContents.send("auth:completed", {
          success: false,
          message: "Missing code verifier",
        });
        return;
      }

      const authService = new AuthService();
      const redirectUrl = `http://${OAUTH_HOST}:${OAUTH_PORT}${requestUrl.pathname}${requestUrl.search}`;
      const redirectSuccess = await authService.handleRedirect(
        redirectUrl,
        authContext.codeVerifier,
        authContext.state,
      );
      pendingAuth = null;
      clearPersistedPendingAuth();

      if (redirectSuccess) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authentication complete. You may close this window.</h2></body></html>",
        );
        mainWindow?.webContents.send("auth:completed", { success: true });
      } else {
        const message =
          "Authentication failed during token exchange. Please verify Azure app public client settings.";
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h2>Authentication failed.</h2><p>${message}</p><p>You may close this window.</p></body></html>`,
        );
        mainWindow?.webContents.send("auth:completed", { success: false, message });
      }
      mainWindow?.focus();
    } catch (error: any) {
      console.error("OAuth redirect handling failed:", error);
      pendingAuth = null;
      clearPersistedPendingAuth();
      const message =
        error?.message || "Authentication failed. Please verify your Azure AD app registration.";
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(
        `<html><body><h2>Authentication failed.</h2><p>${message}</p><p>You may close this window.</p></body></html>`,
      );
      mainWindow?.webContents.send("auth:completed", { success: false, message });
    }
  });

  oauthServer.listen(OAUTH_PORT, OAUTH_HOST, () => {
    console.log(`OAuth redirect server listening on http://${OAUTH_HOST}:${OAUTH_PORT}/redirect`);
  });
}
