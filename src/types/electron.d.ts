export {};

declare global {
  interface Window {
    electronAPI?: {
      startLogin: () => Promise<{ authUrl: string }>;
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
      ) => Promise<{
        companies: Array<{
          name: string;
          website: string;
          reasoning: string;
          estimatedSize?: string;
          industry?: string;
          suggestedContactTitles?: string[];
          relevanceScore?: number;
        }>;
      }>;
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
          toName?: string;
          ccEmails?: string[];
          subject: string;
          bodyHtml: string;
        }>;
        attachment?: { name: string; mime: string; base64: string };
        mode: "draft" | "send-now" | "schedule";
        staggerSeconds: number;
        scheduledForIso?: string;
        campaignId?: string;
        campaignName?: string;
        identityEmail?: string;
      }) => Promise<{
        submitted: number;
        failed: number;
        results: Array<{
          recipientId: string;
          ok: boolean;
          messageId?: string;
          conversationId?: string;
          internetMessageId?: string;
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
        moreAvailable?: boolean;
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
        bounces?: Array<{ failedRecipients: string[]; diagnostic?: string }>;
      }>;
      pollSentItemsDelta: (payload: { deltaLink?: string }) => Promise<{
        ok: boolean;
        expired?: boolean;
        error?: string;
        deltaLink?: string;
        moreAvailable?: boolean;
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
      dbMetrics: (filter?: { identityEmail?: string }) => Promise<{
        total: number;
        submitted: number;
        delivered: number;
        failed: number;
        bounced: number;
        replyCount: number;
        replyRate: number;
      }>;
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
