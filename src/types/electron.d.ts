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
      companySearch: (query: string, filters?: {
        industry?: string;
        size?: string;
        location?: string;
        excludeNames?: string[];
        campaignDescription?: string;
        refinement?: string;
      }) => Promise<{
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
      onAuthCompleted: (callback: (result: { success: boolean; message?: string }) => void) => () => void;
    };
  }
}
