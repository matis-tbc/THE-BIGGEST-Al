export {};

declare global {
  interface Window {
    electronAPI?: {
      startLogin: () => Promise<{ authUrl: string }>;
      getTokens: () => Promise<any>;
      getUserProfile: () => Promise<{ displayName: string; email: string } | null>;
      refreshToken: (refreshToken: string) => Promise<any>;
      logout: () => Promise<boolean>;
      handleRedirect: (url: string, authContext?: { codeVerifier?: string; state?: string }) => Promise<any>;
      openExternal: (url: string) => Promise<void>;
      enqueueSchedulerJob: (payload: {
        campaignId: string;
        messageIds: string[];
        runAt: number;
        folderName: string;
        categoryName?: string;
        maxAttempts?: number;
      }) => Promise<any>;
      listSchedulerJobs: () => Promise<any[]>;
      pauseSchedulerJob: (jobId: string) => Promise<any>;
      resumeSchedulerJob: (jobId: string) => Promise<any>;
      cancelSchedulerJob: (jobId: string) => Promise<any>;
      onAuthCompleted: (callback: (result: { success: boolean; message?: string }) => void) => () => void;
    };
  }
}
