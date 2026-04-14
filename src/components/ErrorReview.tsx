import React, { useMemo, useState, useEffect } from 'react';
import { fireCampaignConfetti } from '../utils/confetti';

interface ErrorReviewProps {
  operationId: string;
  results: ProcessingResult[];
  onStartOver: () => void;
  onReviewFailedContacts?: () => void;
}

interface ProcessingResult {
  contactId: string;
  name: string;
  email: string;
  status: 'completed' | 'failed';
  messageId?: string;
  error?: string;
}

export const ErrorReview: React.FC<ErrorReviewProps> = ({ operationId, results, onStartOver, onReviewFailedContacts }) => {
  const [retryCount, setRetryCount] = useState(0);

  const completedResults = results.filter(r => r.status === 'completed');
  const failedResults = results.filter(r => r.status === 'failed');

  // Fire confetti when campaign has successful results
  useEffect(() => {
    if (completedResults.length > 0) {
      fireCampaignConfetti();
    }
  }, []);

  const handleRetryFailed = async () => {
    setRetryCount(prev => prev + 1);
    console.log('Retrying failed contacts...');
  };

  const handleExportResults = () => {
    const csvContent = [
      ['Name', 'Email', 'Status', 'Message ID', 'Error'],
      ...results.map(result => [
        result.name,
        result.email,
        result.status,
        result.messageId || '',
        result.error || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `email-drafter-results-${operationId}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">Operation Complete</h2>
        <p className="text-gray-400">Review the results of your email draft creation.</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-100">{results.length}</div>
          <div className="text-sm text-gray-400">Total Contacts</div>
        </div>
        <div className="bg-green-900/30 border border-green-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{completedResults.length}</div>
          <div className="text-sm text-green-400">Drafts Created</div>
        </div>
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{failedResults.length}</div>
          <div className="text-sm text-red-400">Failed</div>
        </div>
      </div>

      {/* Success Results */}
      {completedResults.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <div className="px-4 py-3 bg-green-900/30 border-b border-green-800">
            <h3 className="text-sm font-medium text-green-300">
              Successfully Created ({completedResults.length})
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div className="divide-y divide-gray-700">
              {completedResults.map((result) => (
                <div key={result.contactId} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-100">{result.name}</p>
                      <p className="text-sm text-gray-400">{result.email}</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    Draft created
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Failed Results */}
      {failedResults.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <div className="px-4 py-3 bg-red-900/30 border-b border-red-800">
            <h3 className="text-sm font-medium text-red-300">
              Failed to Create ({failedResults.length})
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div className="divide-y divide-gray-700">
              {failedResults.map((result) => (
                <div key={result.contactId} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-100">{result.name}</p>
                      <p className="text-sm text-gray-400">{result.email}</p>
                    </div>
                  </div>
                  <div className="text-sm text-red-400">
                    {result.error}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <div className="flex space-x-3">
          {failedResults.length > 0 && onReviewFailedContacts && (
            <button
              onClick={onReviewFailedContacts}
              className="btn-secondary"
            >
              Jump to Contact Fixes
            </button>
          )}
          {failedResults.length > 0 && (
            <button
              onClick={handleRetryFailed}
              className="btn-secondary"
            >
              Retry Failed ({retryCount > 0 && `Attempt ${retryCount + 1}`})
            </button>
          )}
          <button
            onClick={handleExportResults}
            className="btn-secondary"
          >
            Export Results
          </button>
        </div>
        <button
          onClick={onStartOver}
          className="btn-primary"
        >
          Start New Operation
        </button>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-900/30 border border-blue-800 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-300" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-200">Next Steps</h3>
            <div className="mt-2 text-sm text-blue-300">
              <p>
                {completedResults.length > 0 && (
                  <>{completedResults.length} draft emails have been created in your Outlook. Check your Drafts folder to review and send them.</>
                )}
                {failedResults.length > 0 && (
                  <> {failedResults.length} contacts failed. You can retry them or export the results for manual follow-up.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
