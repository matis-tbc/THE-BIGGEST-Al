import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gauge, Rocket, ShieldCheck, Zap } from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.onAuthCompleted) {
      return;
    }

    const unsubscribe = window.electronAPI.onAuthCompleted((result) => {
      setIsLoading(false);
      if (result.success) {
        onAuthSuccess();
      } else {
        setError(result.message || 'Authentication failed. Please try again.');
      }
    });

    return unsubscribe;
  }, [onAuthSuccess]);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { authUrl } = await window.electronAPI.startLogin();

      // Open the auth URL in the system browser via Electron main process
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(authUrl);
      } else {
        window.open(authUrl, '_blank', 'noopener,noreferrer');
      }

      // Authentication will complete when the OAuth redirect is handled
      // The onAuthCompleted listener will handle success/failure

    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to start authentication. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full tunnel-shell flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="tunnel-content max-w-3xl w-full space-y-8"
      >
        <div className="text-center">
          <div className="mx-auto h-20 w-20 rounded-2xl flex items-center justify-center mb-5 border border-cyan-300/40 bg-slate-900/70 shadow-neon">
            <Rocket className="h-9 w-9 text-cyan-300" />
          </div>
          <h2 className="text-4xl font-bold text-slate-100 tracking-tight">CU Hyperloop Draft Console</h2>
          <p className="mt-2 text-sm text-slate-300">
            Generate high-velocity outreach drafts with tunnel-grade precision.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Secure Microsoft authentication opens in your browser, then routes you back into mission control.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-400/40 rounded-xl p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-100">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">Launch Checklist</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-sky-400/25 bg-slate-900/40 p-3">
                <p className="text-xs font-medium text-sky-300 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Gauge className="h-3.5 w-3.5" /> Intake
                </p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li>Import and refine CSV rows</li>
                  <li>Clean invalid recipients in-app</li>
                </ul>
              </div>
              <div className="rounded-xl border border-violet-400/25 bg-slate-900/40 p-3">
                <p className="text-xs font-medium text-violet-300 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" /> Compose
                </p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li>Save reusable templates</li>
                  <li>Version and restore draft content</li>
                </ul>
              </div>
              <div className="rounded-xl border border-cyan-400/25 bg-slate-900/40 p-3">
                <p className="text-xs font-medium text-cyan-300 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Validate
                </p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li>Run preflight recipient checks</li>
                  <li>Create Outlook drafts safely</li>
                </ul>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Sign in with your CU account, then drive the full workflow from data cleanup to tunnel-ready draft output.
            </p>
          </div>

          <motion.button
            onClick={handleLogin}
            disabled={isLoading}
            whileHover={{ scale: isLoading ? 1 : 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="btn-primary w-full flex justify-center items-center px-4 py-3 text-base rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
                </svg>
                Sign in with Microsoft
              </>
            )}
          </motion.button>
        </div>

        <div className="text-center">
          <p className="text-xs text-slate-400">
            By signing in, you agree to use this application responsibly and in accordance with your organization's policies.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
