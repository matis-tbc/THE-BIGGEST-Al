import { campaignStore, CampaignStatus } from './campaignStore';
import { listSchedulerJobs } from './schedulerService';

const SYNC_KEY = 'email-drafter.scheduler-sync.v1';

function getSyncedMarkers(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SYNC_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

function saveSyncedMarkers(markers: Set<string>): void {
  const values = Array.from(markers).slice(-5000);
  window.localStorage.setItem(SYNC_KEY, JSON.stringify(values));
}

function deriveCampaignStatus(statuses: string[]): CampaignStatus {
  if (statuses.some(status => status === 'failed')) return 'failed';
  if (statuses.some(status => status === 'queued')) return 'queued';
  if (statuses.some(status => status === 'sending')) return 'sending';
  if (statuses.every(status => status === 'sent' || status === 'replied')) return 'sent';
  if (statuses.some(status => status === 'drafted')) return 'drafted';
  return 'drafted';
}

export async function syncSchedulerResults(): Promise<void> {
  const jobs = await listSchedulerJobs();
  const terminalJobs = jobs.filter(job => (job.status === 'completed' || job.status === 'failed') && job.lastResult);
  if (!terminalJobs.length) return;

  const syncedMarkers = getSyncedMarkers();

  for (const job of terminalJobs) {
    const marker = `${job.id}:${job.status}:${job.attempts}:${job.updatedAt}`;
    if (syncedMarkers.has(marker)) continue;

    const successIds = job.lastResult?.succeededMessageIds || [];
    const failedIds = job.lastResult?.failedMessageIds || [];

    if (successIds.length) {
      await campaignStore.updateMessagesByMessageId(
        job.campaignId,
        successIds.map(messageId => ({ messageId, status: 'sent' }))
      );
      await campaignStore.createEvents(successIds.map(messageId => ({
        campaignId: job.campaignId,
        messageId,
        type: 'send_succeeded',
        detail: `Scheduler job ${job.id} completed auto-sort.`,
      })));
    }

    if (failedIds.length) {
      await campaignStore.updateMessagesByMessageId(
        job.campaignId,
        failedIds.map(item => ({ messageId: item.messageId, status: 'failed', error: item.error }))
      );
      await campaignStore.createEvents(failedIds.map(item => ({
        campaignId: job.campaignId,
        messageId: item.messageId,
        type: 'send_failed',
        detail: item.error,
      })));
    }

    const messages = await campaignStore.listMessages(job.campaignId);
    const status = deriveCampaignStatus(messages.map(message => message.status));
    await campaignStore.updateCampaignStatus(job.campaignId, status);

    syncedMarkers.add(marker);
  }

  saveSyncedMarkers(syncedMarkers);
}
