import React, { useState, useEffect, useRef } from 'react';
import { BatchProcessor } from '../services/batchProcessor';

interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

interface BatchProgressProps {
  contacts: Contact[];
  template: Template;
  attachment: File;
  onComplete: (operationId: string, results: ProcessingStatus[]) => void;
  onBack: () => void;
}

interface ProcessingStatus {
  contactId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  messageId?: string;
  error?: string;
}

export const BatchProgress: React.FC<BatchProgressProps> = ({
  contacts,
  template,
  attachment,
  onComplete,
  onBack
}) => {
  const processorRef = useRef<BatchProcessor | null>(null);
  const [statuses, setStatuses] = useState<ProcessingStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [operationId, setOperationId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new BatchProcessor();
    }
  }, []);

  useEffect(() => {
    // Initialize statuses
    const initialStatuses: ProcessingStatus[] = contacts.map(contact => ({
      contactId: contact.id,
      status: 'pending'
    }));
    setStatuses(initialStatuses);
    setTotalBatches(Math.ceil(contacts.length / 20));
  }, [contacts]);

  const startProcessing = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const processor = processorRef.current || new BatchProcessor();
      processorRef.current = processor;

      const initialized = await processor.initialize();
      if (!initialized) {
        throw new Error('Authentication required. Please sign in again.');
      }

      let latestResults: ProcessingStatus[] = [];

      const opId = await processor.processContacts(
        contacts,
        template,
        attachment,
        (results) => {
          latestResults = results;
          setStatuses([...results]);

          const processed = results.filter(r => r.status !== 'pending').length;
          const batch = Math.min(
            totalBatches || 1,
            Math.max(1, Math.ceil(processed / 20))
          );
          setCurrentBatch(batch);
        }
      );

      setOperationId(opId);
      setIsProcessing(false);
      onComplete(opId, latestResults.length > 0 ? latestResults : statuses);
    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process contacts. Please try again.');
      setIsProcessing(false);
    }
  };

  const completedCount = statuses.filter(s => s.status === 'completed').length;
  const failedCount = statuses.filter(s => s.status === 'failed').length;
  const processingCount = statuses.filter(s => s.status === 'processing').length;
  const pendingCount = statuses.filter(s => s.status === 'pending').length;

  const progressPercentage = contacts.length > 0 ? (completedCount + failedCount) / contacts.length * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Creating Draft Emails</h2>
        <p className="text-gray-600">
          Processing {contacts.length} contacts in {totalBatches} batches of up to 20 emails each.
        </p>
      </div>

      {/* Progress Overview */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Progress</h3>
          <span className="text-sm text-gray-500">
            Batch {currentBatch} of {totalBatches}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{completedCount + failedCount} of {contacts.length} processed</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Status Counts */}
        <div className="grid grid-cols-4 gap-4 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-gray-500">{pendingCount}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-600">{processingCount}</div>
            <div className="text-sm text-blue-600">Processing</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <div className="text-sm text-green-600">Completed</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-red-600">{failedCount}</div>
            <div className="text-sm text-red-600">Failed</div>
          </div>
        </div>
      </div>

      {/* Processing Details */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Contact Status</h3>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <div className="divide-y divide-gray-200">
            {statuses.map((status, index) => {
              const contact = contacts.find(c => c.id === status.contactId);
              if (!contact) return null;

              return (
                <div key={status.contactId} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      {status.status === 'completed' && (
                        <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {status.status === 'failed' && (
                        <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                      {status.status === 'processing' && (
                        <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                      )}
                      {status.status === 'pending' && (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                      <p className="text-sm text-gray-500">{contact.email}</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {status.status === 'completed' && 'Draft created'}
                    {status.status === 'failed' && status.error}
                    {status.status === 'processing' && 'Creating draft...'}
                    {status.status === 'pending' && 'Waiting...'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={isProcessing}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back
        </button>
        {!isProcessing && completedCount + failedCount === contacts.length ? (
          <button
            onClick={() => onComplete(operationId, statuses)}
            className="btn-primary"
          >
            Review Results
          </button>
        ) : (
          <button
            onClick={startProcessing}
            disabled={isProcessing}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : 'Start Processing'}
          </button>
        )}
      </div>
    </div>
  );
};
