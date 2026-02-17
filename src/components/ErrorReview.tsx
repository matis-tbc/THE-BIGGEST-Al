import React, { useEffect, useMemo, useState } from 'react';
import { campaignStore } from '../services/campaignStore';
import { cancelSchedulerJob, enqueueSchedulerJob, listSchedulerJobs, pauseSchedulerJob, resumeSchedulerJob, SchedulerJob } from '../services/schedulerService';
import { syncSchedulerResults } from '../services/campaignSync';

interface ErrorReviewProps {
  operationId: string;
  campaignId?: string;
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

function toLocalDateTimeInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDurationMs(value: number): string {
  if (!value) return 'n/a';
  const minutes = Math.round(value / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = (minutes / 60).toFixed(1);
  return `${hours} hr`;
}

export const ErrorReview: React.FC<ErrorReviewProps> = ({ operationId, campaignId, results, onStartOver, onReviewFailedContacts }) => {
  const [retryCount, setRetryCount] = useState(0);
  const [analytics, setAnalytics] = useState<{
    total: number;
    drafted: number;
    queued: number;
    sending: number;
    sent: number;
    failed: number;
    replied: number;
    sendRate: number;
    replyRate: number;
    avgTimeToSendMs: number;
    avgTimeToReplyMs: number;
  } | null>(null);
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [jobError, setJobError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('CU Hyperloop Campaign Drafts');
  const [categoryName, setCategoryName] = useState('CU-Hyperloop');
  const [scheduleAt, setScheduleAt] = useState(toLocalDateTimeInputValue(new Date(Date.now() + 10 * 60 * 1000)));

  const completedResults = results.filter(r => r.status === 'completed');
  const failedResults = results.filter(r => r.status === 'failed');
  const messageIds = useMemo(
    () => completedResults.map(item => item.messageId).filter((value): value is string => Boolean(value)),
    [completedResults]
  );

  const refreshCampaign = async () => {
    if (!campaignId) return;
    await syncSchedulerResults();
    const [nextAnalytics, allJobs] = await Promise.all([
      campaignStore.computeAnalytics(campaignId),
      listSchedulerJobs(),
    ]);
    setAnalytics(nextAnalytics);
    setJobs(allJobs.filter(job => job.campaignId === campaignId));
  };

  useEffect(() => {
    refreshCampaign().catch(error => {
      console.error('Failed to refresh campaign analytics:', error);
    });
    const timer = window.setInterval(() => {
      refreshCampaign().catch(error => {
        console.error('Failed to refresh campaign analytics:', error);
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [campaignId]);

  const handleRetryFailed = async () => {
    setRetryCount(prev => prev + 1);
    // In real implementation, this would retry the failed contacts
    console.log('Retrying failed contacts...');
  };

  const handleQueueAutoSort = async () => {
    try {
      setJobError(null);
      if (!campaignId) {
        throw new Error('Campaign context is not available.');
      }
      if (messageIds.length === 0) {
        throw new Error('No successful draft message IDs available for scheduling.');
      }
      const runAtMs = new Date(scheduleAt).getTime();
      if (!Number.isFinite(runAtMs)) {
        throw new Error('Please provide a valid schedule time.');
      }

      const job = await enqueueSchedulerJob({
        campaignId,
        messageIds,
        runAt: runAtMs,
        folderName: folderName.trim() || 'CU Hyperloop Campaign Drafts',
        categoryName: categoryName.trim() || undefined,
        maxAttempts: 3,
      });
      await campaignStore.setQueued(campaignId, messageIds, job.id);
      await campaignStore.updateCampaignStatus(campaignId, 'queued');
      await campaignStore.createEvents(messageIds.map(messageId => ({
        campaignId,
        messageId,
        type: 'queued_for_send',
        detail: `Queued for scheduler automation (${new Date(runAtMs).toLocaleString()}).`,
      })));
      await refreshCampaign();
    } catch (error) {
      console.error('Failed to queue scheduler job:', error);
      setJobError(error instanceof Error ? error.message : 'Failed to queue scheduler job.');
    }
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

  const handleExportAudit = async () => {
    if (!campaignId) return;
    const csv = await campaignStore.exportAuditCsv(campaignId);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `campaign-audit-${campaignId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Operation Complete</h2>
        <p className="text-gray-600">Review the results of your email draft creation.</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{results.length}</div>
          <div className="text-sm text-gray-600">Total Contacts</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{completedResults.length}</div>
          <div className="text-sm text-green-600">Drafts Created</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600">{failedResults.length}</div>
          <div className="text-sm text-red-600">Failed</div>
        </div>
      </div>

      {campaignId && analytics && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Campaign Automation + Analytics</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleExportAudit} className="btn-secondary">Export Audit CSV</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-gray-500">Drafted</p>
              <p className="text-lg font-semibold text-gray-900">{analytics.drafted}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-blue-50 p-3">
              <p className="text-blue-700">Queued</p>
              <p className="text-lg font-semibold text-blue-800">{analytics.queued}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-green-50 p-3">
              <p className="text-green-700">Automation Complete</p>
              <p className="text-lg font-semibold text-green-800">{analytics.sent}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-red-50 p-3">
              <p className="text-red-700">Failed</p>
              <p className="text-lg font-semibold text-red-800">{analytics.failed}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
            <p>Auto-processing rate: {(analytics.sendRate * 100).toFixed(0)}%</p>
            <p>Reply rate tracked: {(analytics.replyRate * 100).toFixed(0)}%</p>
            <p>Avg queue-to-complete: {formatDurationMs(analytics.avgTimeToSendMs)}</p>
            <p>Avg complete-to-reply: {formatDurationMs(analytics.avgTimeToReplyMs)}</p>
          </div>

          <div className="border border-gray-200 rounded-md p-3 space-y-3">
            <h4 className="text-sm font-medium text-gray-800">Queue Auto-Sorting</h4>
            <p className="text-xs text-gray-600">
              Schedule moving drafted messages into a campaign folder and optionally tag a category.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={event => setScheduleAt(event.target.value)}
                className="input-field"
              />
              <input
                type="text"
                value={folderName}
                onChange={event => setFolderName(event.target.value)}
                placeholder="Folder name in Drafts"
                className="input-field"
              />
              <input
                type="text"
                value={categoryName}
                onChange={event => setCategoryName(event.target.value)}
                placeholder="Optional category"
                className="input-field"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{messageIds.length} drafted message(s) eligible.</p>
              <button onClick={handleQueueAutoSort} className="btn-secondary">Queue Auto-Sort Job</button>
            </div>
            {jobError && <p className="text-xs text-red-700">{jobError}</p>}
          </div>

          {jobs.length > 0 && (
            <div className="border border-gray-200 rounded-md">
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-sm font-medium text-gray-800">
                Scheduler Jobs
              </div>
              <div className="divide-y divide-gray-100">
                {jobs.map(job => (
                  <div key={job.id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-gray-900">
                        {job.status.toUpperCase()} · {new Date(job.runAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {job.messageIds.length} msg · folder "{job.folderName}" · attempts {job.attempts}/{job.maxAttempts}
                      </p>
                      {job.error && <p className="text-xs text-red-700">{job.error}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {job.status === 'paused' && (
                        <button
                          onClick={() => resumeSchedulerJob(job.id).then(refreshCampaign)}
                          className="btn-secondary"
                        >
                          Resume
                        </button>
                      )}
                      {(job.status === 'queued' || job.status === 'running') && (
                        <button
                          onClick={() => pauseSchedulerJob(job.id).then(refreshCampaign)}
                          className="btn-secondary"
                        >
                          Pause
                        </button>
                      )}
                      {(job.status === 'queued' || job.status === 'paused') && (
                        <button
                          onClick={() => cancelSchedulerJob(job.id).then(refreshCampaign)}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Results */}
      {completedResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 bg-green-50 border-b border-green-200">
            <h3 className="text-sm font-medium text-green-800">
              ✅ Successfully Created ({completedResults.length})
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div className="divide-y divide-gray-200">
              {completedResults.map((result, index) => (
                <div key={result.contactId} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{result.name}</p>
                      <p className="text-sm text-gray-500">{result.email}</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
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
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <h3 className="text-sm font-medium text-red-800">
              ❌ Failed to Create ({failedResults.length})
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div className="divide-y divide-gray-200">
              {failedResults.map((result, index) => (
                <div key={result.contactId} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{result.name}</p>
                      <p className="text-sm text-gray-500">{result.email}</p>
                    </div>
                  </div>
                  <div className="text-sm text-red-600">
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
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Next Steps</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                {completedResults.length > 0 && (
                  <>✅ {completedResults.length} draft emails have been created in your Outlook. Check your Drafts folder to review and send them.</>
                )}
                {failedResults.length > 0 && (
                  <>⚠️ {failedResults.length} contacts failed. You can retry them or export the results for manual follow-up.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
