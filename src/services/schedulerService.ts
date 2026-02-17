export type SchedulerJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface SchedulerJob {
  id: string;
  campaignId: string;
  messageIds: string[];
  runAt: number;
  folderName: string;
  categoryName?: string;
  attempts: number;
  maxAttempts: number;
  status: SchedulerJobStatus;
  error?: string;
  lastResult?: {
    succeededMessageIds: string[];
    failedMessageIds: Array<{ messageId: string; error: string }>;
  };
  createdAt: number;
  updatedAt: number;
}

export async function enqueueSchedulerJob(payload: {
  campaignId: string;
  messageIds: string[];
  runAt: number;
  folderName: string;
  categoryName?: string;
  maxAttempts?: number;
}): Promise<SchedulerJob> {
  if (!window.electronAPI?.enqueueSchedulerJob) {
    throw new Error('Scheduler API unavailable in this environment.');
  }
  return window.electronAPI.enqueueSchedulerJob(payload) as Promise<SchedulerJob>;
}

export async function listSchedulerJobs(): Promise<SchedulerJob[]> {
  if (!window.electronAPI?.listSchedulerJobs) {
    return [];
  }
  return window.electronAPI.listSchedulerJobs() as Promise<SchedulerJob[]>;
}

export async function pauseSchedulerJob(jobId: string): Promise<SchedulerJob | null> {
  if (!window.electronAPI?.pauseSchedulerJob) return null;
  return window.electronAPI.pauseSchedulerJob(jobId) as Promise<SchedulerJob | null>;
}

export async function resumeSchedulerJob(jobId: string): Promise<SchedulerJob | null> {
  if (!window.electronAPI?.resumeSchedulerJob) return null;
  return window.electronAPI.resumeSchedulerJob(jobId) as Promise<SchedulerJob | null>;
}

export async function cancelSchedulerJob(jobId: string): Promise<SchedulerJob | null> {
  if (!window.electronAPI?.cancelSchedulerJob) return null;
  return window.electronAPI.cancelSchedulerJob(jobId) as Promise<SchedulerJob | null>;
}
