import React, { useState, useEffect, useRef } from "react";
import { BatchProcessor, Contact } from "../services/batchProcessor";

interface Template {
  id: string;
  name: string;
  subjects?: string[];
  content: string;
  variables: string[];
}

interface BatchProgressProps {
  contacts: Contact[];
  templates: Template[];
  defaultTemplateId: string | null;
  attachment: File | null;
  onComplete: (operationId: string, results: ProcessingStatus[]) => void;
  onBack: () => void;
}

interface ProcessingStatus {
  contactId: string;
  status: "pending" | "processing" | "drafted" | "attaching" | "completed" | "failed";
  messageId?: string;
  error?: string;
}

export const BatchProgress: React.FC<BatchProgressProps> = ({
  contacts,
  templates,
  defaultTemplateId,
  attachment,
  onComplete,
  onBack,
}) => {
  const processorRef = useRef<BatchProcessor | null>(null);
  const [statuses, setStatuses] = useState<ProcessingStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [operationId, setOperationId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new BatchProcessor();
    }
  }, []);

  useEffect(() => {
    // Initialize statuses
    const initialStatuses: ProcessingStatus[] = contacts.map((contact) => ({
      contactId: contact.id,
      status: "pending",
    }));
    setStatuses(initialStatuses);
    setTotalBatches(Math.ceil(contacts.length / 4));
  }, [contacts]);

  const startProcessing = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const processor = processorRef.current || new BatchProcessor();
      processorRef.current = processor;

      const initialized = await processor.initialize();
      if (!initialized) {
        throw new Error("Authentication required. Please sign in again.");
      }

      let latestResults: ProcessingStatus[] = [];

      const opId = await processor.processContacts(
        contacts,
        templates,
        defaultTemplateId,
        attachment,
        (results) => {
          latestResults = results;
          setStatuses([...results]);

          const processed = results.filter(
            (r) => r.status !== "pending",
          ).length;
          const batch = Math.min(
            totalBatches || 1,
            Math.max(1, Math.ceil(processed / 4)),
          );
          setCurrentBatch(batch);
        },
      );

      setOperationId(opId);
      setIsProcessing(false);

      // Final progress update so the user sees the completed state
      if (latestResults.length > 0) {
        setStatuses([...latestResults]);
      }
    } catch (err) {
      console.error("Processing error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to process contacts. Please try again.",
      );
      setIsProcessing(false);
    }
  };

  const completedCount = statuses.filter((s) => s.status === "completed").length;
  const failedCount = statuses.filter((s) => s.status === "failed").length;
  const processingCount = statuses.filter((s) => s.status === "processing").length;
  const pendingCount = statuses.filter((s) => s.status === "pending").length;

  const draftedCount = statuses.filter((s) => s.status === "drafted").length;
  const attachingCount = statuses.filter((s) => s.status === "attaching").length;

  let progressPercentage = 0;
  if (contacts.length > 0) {
    if (attachment) {
      // 2 phases: Draft creation (1 point) + Attachment Upload (1 point) per contact
      const draftPoints = statuses.filter(s => ["drafted", "attaching", "completed"].includes(s.status)).length;
      const attachPoints = completedCount;
      const failPoints = failedCount * 2; // Failed counts as fully processed for percentage purposes
      progressPercentage = ((draftPoints + attachPoints + failPoints) / (contacts.length * 2)) * 100;
    } else {
      progressPercentage = ((completedCount + failedCount) / contacts.length) * 100;
    }
  }

  // Determine current phase text
  let currentPhase = "Finished";
  if (failedCount + completedCount < contacts.length) {
    if (attachment) {
      if (attachingCount > 0 || draftedCount > 0) {
        currentPhase = "Uploading Attachments...";
      } else if (processingCount > 0) {
        currentPhase = "Creating Drafts...";
      } else {
        currentPhase = "Pending...";
      }
    } else {
      if (processingCount > 0 || pendingCount > 0) currentPhase = "Creating Drafts...";
      else currentPhase = "Pending...";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">
          Generating Campaign
        </h2>
        <p className="text-gray-400">
          {currentPhase} ({contacts.length} total contacts)
        </p>
      </div>

      {/* Progress Overview */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-100">Progress</h3>
          <span className="text-sm text-gray-400">
            {attachment
              ? `${completedCount + failedCount === contacts.length ? contacts.length : draftedCount + attachingCount + completedCount + failedCount} of ${contacts.length} Drafts Created`
              : `Batch ${currentBatch} of ${totalBatches}`
            }
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>
              {attachment ? (
                completedCount + failedCount === contacts.length
                  ? `${completedCount + failedCount} of ${contacts.length} fully completed`
                  : attachingCount > 0 || draftedCount > 0 || completedCount > 0
                    ? `${completedCount + failedCount} of ${contacts.length} uploaded`
                    : `${draftedCount} of ${contacts.length} drafted`
              ) : `${completedCount + failedCount} of ${contacts.length} processed`}
            </span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Status Counts */}
        <div className={`grid gap-4 text-center ${attachment ? 'grid-cols-3 md:grid-cols-6' : 'grid-cols-4'}`}>
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="text-2xl font-bold text-gray-400">{pendingCount}</div>
            <div className="text-sm text-gray-400">Pending</div>
          </div>
          <div className="bg-blue-900/30 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-400">{processingCount}</div>
            <div className="text-sm text-blue-400">Drafting</div>
          </div>

          {attachment && (
            <>
              <div className="bg-indigo-900/30 rounded-lg p-3">
                <div className="text-2xl font-bold text-indigo-400">{draftedCount}</div>
                <div className="text-sm text-indigo-400">Drafted</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-400">{attachingCount}</div>
                <div className="text-sm text-purple-400">Uploading</div>
              </div>
            </>
          )}

          <div className="bg-green-900/30 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-400">{completedCount}</div>
            <div className="text-sm text-green-400">Completed</div>
          </div>
          <div className="bg-red-900/30 rounded-lg p-3">
            <div className="text-2xl font-bold text-red-400">{failedCount}</div>
            <div className="text-sm text-red-400">Failed</div>
          </div>
        </div>
      </div>

      {/* Processing Details */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg">
        <div className="px-4 py-3 bg-gray-700 border-b border-gray-600">
          <h3 className="text-sm font-medium text-gray-100">Contact Status</h3>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <div className="divide-y divide-gray-700">
            {statuses.map((status) => {
              const contact = contacts.find((c) => c.id === status.contactId);
              if (!contact) return null;

              return (
                <div
                  key={status.contactId}
                  className="px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      {status.status === "completed" && (
                        <svg
                          className="h-5 w-5 text-green-500"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {status.status === "failed" && (
                        <svg
                          className="h-5 w-5 text-red-500"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {status.status === "processing" && (
                        <svg
                          className="animate-spin h-5 w-5 text-blue-500"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {status.status === "attaching" && (
                        <svg
                          className="animate-spin h-5 w-5 text-purple-500"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {status.status === "drafted" && (
                        <svg className="h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                      {status.status === "pending" && (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-100">
                        {contact.name}
                      </p>
                      <p className="text-sm text-gray-400">{contact.email}</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    {status.status === "completed" && "Finished"}
                    {status.status === "failed" && status.error}
                    {status.status === "attaching" && "Uploading file..."}
                    {status.status === "drafted" && "Draft ready (queueing upload...)"}
                    {status.status === "processing" && "Creating draft..."}
                    {status.status === "pending" && "Waiting..."}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-300"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-200">{error}</p>
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
            {isProcessing ? "Processing..." : "Start Processing"}
          </button>
        )}
      </div>
    </div>
  );
};
