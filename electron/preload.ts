const { contextBridge, ipcRenderer } = require("electron");

// Make this a module
export {};

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI?: {
      startLogin: () => Promise<any>;
      getTokens: () => Promise<any>;
      getUserProfile: () => Promise<{ displayName: string; email: string } | null>;
      refreshToken: (refreshToken: string) => Promise<any>;
      logout: () => Promise<boolean>;
      handleRedirect: (
        url: string,
        authContext?: { codeVerifier?: string; state?: string },
      ) => Promise<any>;
      openExternal: (url: string) => Promise<void>;
      companySearch: (
        query: string,
        filters?: {
          industry?: string;
          size?: string;
          location?: string;
          excludeNames?: string[];
          campaignDescription?: string;
          refinement?: string;
        },
      ) => Promise<any>;
      emailGuess: (
        fullName: string,
        domain: string,
        knownContacts: { name: string; email: string }[],
      ) => Promise<any>;
      emailBacktest: (contacts: { name: string; email: string }[]) => Promise<any>;
      emailVerifyMx: (domain: string) => Promise<any>;
      emailParseLinkedin: (url: string) => Promise<any>;
      emailDetectPattern: (contacts: { name: string; email: string }[]) => Promise<any>;
      emailResolveDomain: (companyName: string) => Promise<any>;
      checkScopes: () => Promise<{
        signedIn: boolean;
        granted?: string[];
        missing: string[];
        error?: string;
      }>;
      dispatchRun: (payload: {
        runId: string;
        recipients: Array<{
          recipientId: string;
          toEmail: string;
          ccEmails?: string[];
          subject: string;
          bodyHtml: string;
        }>;
        attachment?: { name: string; mime: string; base64: string };
        mode: "draft" | "send-now" | "schedule";
        staggerSeconds: number;
        scheduledForIso?: string;
      }) => Promise<{
        submitted: number;
        failed: number;
        results: Array<{
          recipientId: string;
          ok: boolean;
          messageId?: string;
          conversationId?: string;
          error?: string;
        }>;
      }>;
      onDispatchProgress: (
        runId: string,
        callback: (event: {
          index: number;
          total: number;
          result: { recipientId: string; ok: boolean; messageId?: string; error?: string };
        }) => void,
      ) => () => void;
      sendDrafts: (payload: {
        runId: string;
        messageIds: string[];
        staggerSeconds: number;
        scheduledForIso?: string;
      }) => Promise<{
        sent: number;
        failed: number;
        results: Array<{ messageId: string; ok: boolean; error?: string }>;
        error?: string;
      }>;
      pollInboxDelta: (payload: { deltaLink?: string; identityEmail?: string }) => Promise<{
        ok: boolean;
        expired?: boolean;
        error?: string;
        deltaLink?: string;
        messages: Array<{
          id: string;
          conversationId: string;
          subject: string;
          from: string;
          fromName: string;
          receivedDateTime: string;
          bodyPreview: string;
          bodyContent?: string;
          bodyContentType?: string;
          isRead: boolean;
          transportHeaders?: string;
        }>;
      }>;
      pollSentItemsDelta: (payload: { deltaLink?: string }) => Promise<{
        ok: boolean;
        expired?: boolean;
        error?: string;
        deltaLink?: string;
        messages: Array<{
          id: string;
          conversationId: string;
          internetMessageId?: string;
          subject: string;
          toEmails: string[];
          sentDateTime: string;
          receivedDateTime: string;
        }>;
      }>;
      dbMarkDelivered: (match: {
        internetMessageId?: string;
        conversationId?: string;
        toEmail?: string;
        identityEmail: string;
        sentAt: string;
      }) => Promise<{ updated: number }>;
      dbMarkBounced: (match: {
        failedRecipients: string[];
        identityEmail: string;
        diagnostic?: string;
      }) => Promise<{ updated: number }>;
      onSendDraftsProgress: (
        runId: string,
        callback: (event: {
          index: number;
          total: number;
          result: { messageId: string; ok: boolean; error?: string };
        }) => void,
      ) => () => void;
      onAuthCompleted: (
        callback: (result: { success: boolean; message?: string }) => void,
      ) => () => void;
      dbRecordReplies: (replies: any[]) => Promise<{ inserted: any[]; all: any[] }>;
      dbListReplies: (filter?: { identityEmail?: string }) => Promise<any[]>;
      dbListRecipients: (filter?: {
        identityEmail?: string;
        runId?: string;
        campaignId?: string;
      }) => Promise<any[]>;
      dbListRuns: (filter?: { identityEmail?: string }) => Promise<any[]>;
      dbMetrics: (filter?: { identityEmail?: string }) => Promise<any>;
      dbGetRecipientTimeline: (id: string) => Promise<{ recipient: any; replies: any[] }>;
      dbMarkReplySeen: (id: string) => Promise<boolean>;
      dbMarkAllRepliesSeen: (identityEmail?: string) => Promise<boolean>;
      dbGetDeltaToken: (identityEmail: string, folder: string) => Promise<string | null>;
      dbSetDeltaToken: (
        identityEmail: string,
        folder: string,
        deltaLink: string,
      ) => Promise<boolean>;
      dbClearDeltaToken: (identityEmail: string, folder: string) => Promise<boolean>;
      dbIsMigrated: () => Promise<boolean>;
      dbRunMigration: (dump: any) => Promise<any>;
      reclassifyReply: (replyId: string) => Promise<any>;
      dbListCampaigns: (filter?: { identityEmail?: string; sinceIso?: string }) => Promise<any[]>;
      dbRecentActivity: (filter?: { identityEmail?: string; limit?: number }) => Promise<any[]>;
      dbTimeline: (filter?: {
        identityEmail?: string;
        days?: number;
      }) => Promise<Array<{ bucket: string; sends: number; replies: number }>>;
    };
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Authentication methods
  startLogin: () => ipcRenderer.invoke("auth:start-login"),
  getTokens: () => ipcRenderer.invoke("auth:get-tokens"),
  getUserProfile: () => ipcRenderer.invoke("auth:get-user-profile"),
  refreshToken: (refreshToken: string) => ipcRenderer.invoke("auth:refresh-token", refreshToken),
  logout: () => ipcRenderer.invoke("auth:logout"),
  handleRedirect: (url: string, authContext?: { codeVerifier?: string; state?: string }) =>
    ipcRenderer.invoke("auth:handle-redirect", url, authContext),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  companySearch: (query: string, filters?: Record<string, any>) =>
    ipcRenderer.invoke("company:search", query, filters),
  emailGuess: (
    fullName: string,
    domain: string,
    knownContacts: { name: string; email: string }[],
  ) => ipcRenderer.invoke("email:guess", fullName, domain, knownContacts),
  emailBacktest: (contacts: { name: string; email: string }[]) =>
    ipcRenderer.invoke("email:backtest", contacts),
  emailVerifyMx: (domain: string) => ipcRenderer.invoke("email:verify-mx", domain),
  emailParseLinkedin: (url: string) => ipcRenderer.invoke("email:parse-linkedin", url),
  emailDetectPattern: (contacts: { name: string; email: string }[]) =>
    ipcRenderer.invoke("email:detect-pattern", contacts),
  emailResolveDomain: (companyName: string) =>
    ipcRenderer.invoke("email:resolve-domain", companyName),
  checkScopes: () => ipcRenderer.invoke("auth:check-scopes"),
  dispatchRun: (payload: any) => ipcRenderer.invoke("mail:dispatch-run", payload),
  onDispatchProgress: (runId: string, callback: (event: any) => void) => {
    const channel = `mail:dispatch-progress:${runId}`;
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  sendDrafts: (payload: any) => ipcRenderer.invoke("mail:send-drafts", payload),
  pollInboxDelta: (payload: any) => ipcRenderer.invoke("mail:poll-inbox-delta", payload),
  pollSentItemsDelta: (payload: any) => ipcRenderer.invoke("mail:poll-sent-items-delta", payload),
  dbMarkDelivered: (match: any) => ipcRenderer.invoke("db:mark-delivered", match),
  dbMarkBounced: (match: any) => ipcRenderer.invoke("db:mark-bounced", match),
  onSendDraftsProgress: (runId: string, callback: (event: any) => void) => {
    const channel = `mail:send-drafts-progress:${runId}`;
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onAuthCompleted: (callback: (result: { success: boolean; message?: string }) => void) => {
    const handler = (_: any, result: { success: boolean; message?: string }) => callback(result);
    ipcRenderer.on("auth:completed", handler);
    return () => ipcRenderer.removeListener("auth:completed", handler);
  },
  dbRecordReplies: (replies: any[]) => ipcRenderer.invoke("db:record-replies", replies),
  dbListReplies: (filter?: any) => ipcRenderer.invoke("db:list-replies", filter),
  dbListRecipients: (filter?: any) => ipcRenderer.invoke("db:list-recipients", filter),
  dbListRuns: (filter?: any) => ipcRenderer.invoke("db:list-runs", filter),
  dbMetrics: (filter?: any) => ipcRenderer.invoke("db:metrics", filter),
  dbGetRecipientTimeline: (id: string) => ipcRenderer.invoke("db:get-recipient-timeline", id),
  dbMarkReplySeen: (id: string) => ipcRenderer.invoke("db:mark-reply-seen", id),
  dbMarkAllRepliesSeen: (identityEmail?: string) =>
    ipcRenderer.invoke("db:mark-all-replies-seen", identityEmail),
  dbGetDeltaToken: (identityEmail: string, folder: string) =>
    ipcRenderer.invoke("db:get-delta-token", identityEmail, folder),
  dbSetDeltaToken: (identityEmail: string, folder: string, deltaLink: string) =>
    ipcRenderer.invoke("db:set-delta-token", identityEmail, folder, deltaLink),
  dbClearDeltaToken: (identityEmail: string, folder: string) =>
    ipcRenderer.invoke("db:clear-delta-token", identityEmail, folder),
  dbIsMigrated: () => ipcRenderer.invoke("db:is-migrated"),
  dbRunMigration: (dump: any) => ipcRenderer.invoke("db:run-migration", dump),
  reclassifyReply: (replyId: string) => ipcRenderer.invoke("replies:reclassify", replyId),
  dbListCampaigns: (filter?: any) => ipcRenderer.invoke("db:list-campaigns", filter),
  dbRecentActivity: (filter?: any) => ipcRenderer.invoke("db:recent-activity", filter),
  dbTimeline: (filter?: any) => ipcRenderer.invoke("db:timeline", filter),
});
