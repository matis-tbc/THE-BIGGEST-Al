import React from 'react';

interface RendererErrorOverlayProps {
  message: string;
  onRetry: () => void;
}

export const RendererErrorOverlay: React.FC<RendererErrorOverlayProps> = ({ message, onRetry }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-70 flex flex-col items-center justify-center p-6 text-white">
      <div className="max-w-lg w-full bg-gray-900 bg-opacity-90 rounded-xl p-6 border border-red-400">
        <h2 className="text-xl font-semibold mb-3">We hit a snag</h2>
        <p className="text-sm text-red-100 mb-4 whitespace-pre-wrap break-words">{message}</p>
        <p className="text-xs text-gray-300 mb-6">
          Check the DevTools console (⌥⌘I / Ctrl+Shift+I) for more detail. Try retrying below or go back to the previous step.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            className="btn-secondary"
            onClick={() => {
              console.info('[RendererErrorOverlay] Retrying after renderer error');
              onRetry();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
};
