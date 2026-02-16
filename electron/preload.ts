const { contextBridge, ipcRenderer } = require('electron');

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
      handleRedirect: (url: string, authContext?: { codeVerifier?: string; state?: string }) => Promise<any>;
      openExternal: (url: string) => Promise<void>;
      onAuthCompleted: (callback: (result: { success: boolean; message?: string }) => void) => () => void;
    };
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication methods
  startLogin: () => ipcRenderer.invoke('auth:start-login'),
  getTokens: () => ipcRenderer.invoke('auth:get-tokens'),
  getUserProfile: () => ipcRenderer.invoke('auth:get-user-profile'),
  refreshToken: (refreshToken: string) => ipcRenderer.invoke('auth:refresh-token', refreshToken),
  logout: () => ipcRenderer.invoke('auth:logout'),
  handleRedirect: (url: string, authContext?: { codeVerifier?: string; state?: string }) => ipcRenderer.invoke('auth:handle-redirect', url, authContext),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  onAuthCompleted: (callback: (result: { success: boolean; message?: string }) => void) => {
    const handler = (_: any, result: { success: boolean; message?: string }) => callback(result);
    ipcRenderer.on('auth:completed', handler);
    return () => ipcRenderer.removeListener('auth:completed', handler);
  },
});
