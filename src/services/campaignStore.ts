export type CampaignStatus = 'drafted' | 'queued' | 'sending' | 'sent' | 'failed' | 'paused';
export type MessageStatus = 'drafted' | 'queued' | 'sending' | 'sent' | 'failed' | 'replied';
export type EventType =
  | 'draft_created'
  | 'queued_for_send'
  | 'send_started'
  | 'send_succeeded'
  | 'send_failed'
  | 'reply_detected';

export interface CampaignRecord {
  id: string;
  name: string;
  templateId?: string;
  attachmentName?: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMessageRecord {
  id: string;
  campaignId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  messageId?: string;
  status: MessageStatus;
  draftCreatedAt?: string;
  queuedAt?: string;
  sendStartedAt?: string;
  sentAt?: string;
  repliedAt?: string;
  error?: string;
  idempotencyKey?: string;
  updatedAt: string;
}

export interface MessageEventRecord {
  id: string;
  campaignId: string;
  messageId?: string;
  contactId?: string;
  type: EventType;
  detail?: string;
  createdAt: string;
}

export interface CampaignAnalytics {
  campaignId: string;
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
}

interface CampaignDb {
  campaigns: CampaignRecord[];
  messages: CampaignMessageRecord[];
  events: MessageEventRecord[];
}

const CAMPAIGN_KEY = 'email-drafter.campaign-db.v1';

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class CampaignStore {
  private loadDb(): CampaignDb {
    return safeParse<CampaignDb>(window.localStorage.getItem(CAMPAIGN_KEY), {
      campaigns: [],
      messages: [],
      events: [],
    });
  }

  private saveDb(db: CampaignDb): void {
    window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(db));
  }

  async createCampaign(input: {
    id?: string;
    name: string;
    templateId?: string;
    attachmentName?: string;
  }): Promise<CampaignRecord> {
    const db = this.loadDb();
    const campaign: CampaignRecord = {
      id: input.id || randomId('camp'),
      name: input.name,
      templateId: input.templateId,
      attachmentName: input.attachmentName,
      status: 'drafted',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.campaigns = [campaign, ...db.campaigns.filter(item => item.id !== campaign.id)];
    this.saveDb(db);
    return campaign;
  }

  async upsertMessages(messages: CampaignMessageRecord[]): Promise<void> {
    const db = this.loadDb();
    const map = new Map(db.messages.map(item => [item.id, item]));
    messages.forEach(item => {
      map.set(item.id, { ...item, updatedAt: nowIso() });
    });
    db.messages = Array.from(map.values());
    this.saveDb(db);
  }

  async createEvents(events: Omit<MessageEventRecord, 'id' | 'createdAt'>[]): Promise<void> {
    if (!events.length) return;
    const db = this.loadDb();
    const persisted = events.map(event => ({
      ...event,
      id: randomId('evt'),
      createdAt: nowIso(),
    }));
    db.events = [...persisted, ...db.events].slice(0, 10000);
    this.saveDb(db);
  }

  async listCampaigns(): Promise<CampaignRecord[]> {
    return this.loadDb().campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listMessages(campaignId: string): Promise<CampaignMessageRecord[]> {
    return this.loadDb().messages
      .filter(item => item.campaignId === campaignId)
      .sort((a, b) => a.contactName.localeCompare(b.contactName));
  }

  async listEvents(campaignId: string): Promise<MessageEventRecord[]> {
    return this.loadDb().events
      .filter(item => item.campaignId === campaignId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
    const db = this.loadDb();
    db.campaigns = db.campaigns.map(item =>
      item.id === campaignId ? { ...item, status, updatedAt: nowIso() } : item
    );
    this.saveDb(db);
  }

  async updateMessagesByMessageId(
    campaignId: string,
    updates: Array<{ messageId: string; status: MessageStatus; error?: string }>
  ): Promise<void> {
    if (!updates.length) return;
    const lookup = new Map(updates.map(item => [item.messageId, item]));
    const db = this.loadDb();
    const now = nowIso();
    db.messages = db.messages.map(item => {
      if (item.campaignId !== campaignId || !item.messageId) return item;
      const update = lookup.get(item.messageId);
      if (!update) return item;
      return {
        ...item,
        status: update.status,
        error: update.error,
        sendStartedAt: update.status === 'sending' ? now : item.sendStartedAt,
        sentAt: update.status === 'sent' ? now : item.sentAt,
        updatedAt: now,
      };
    });
    this.saveDb(db);
  }

  async setQueued(campaignId: string, messageIds: string[], idempotencyPrefix: string): Promise<void> {
    const ids = new Set(messageIds);
    const db = this.loadDb();
    const now = nowIso();
    db.messages = db.messages.map(item => {
      if (item.campaignId !== campaignId || !item.messageId || !ids.has(item.messageId)) return item;
      return {
        ...item,
        status: 'queued',
        queuedAt: now,
        idempotencyKey: `${idempotencyPrefix}:${item.messageId}`,
        updatedAt: now,
      };
    });
    this.saveDb(db);
  }

  async computeAnalytics(campaignId: string): Promise<CampaignAnalytics> {
    const messages = await this.listMessages(campaignId);
    const total = messages.length;
    const drafted = messages.filter(item => item.status === 'drafted').length;
    const queued = messages.filter(item => item.status === 'queued').length;
    const sending = messages.filter(item => item.status === 'sending').length;
    const sent = messages.filter(item => item.status === 'sent').length;
    const failed = messages.filter(item => item.status === 'failed').length;
    const replied = messages.filter(item => item.status === 'replied').length;
    const sendRate = total > 0 ? sent / total : 0;
    const replyRate = sent > 0 ? replied / sent : 0;

    const sendDurations = messages
      .filter(item => item.queuedAt && item.sentAt)
      .map(item => new Date(item.sentAt as string).getTime() - new Date(item.queuedAt as string).getTime())
      .filter(value => Number.isFinite(value) && value >= 0);

    const replyDurations = messages
      .filter(item => item.sentAt && item.repliedAt)
      .map(item => new Date(item.repliedAt as string).getTime() - new Date(item.sentAt as string).getTime())
      .filter(value => Number.isFinite(value) && value >= 0);

    const avgTimeToSendMs = sendDurations.length
      ? sendDurations.reduce((sum, value) => sum + value, 0) / sendDurations.length
      : 0;
    const avgTimeToReplyMs = replyDurations.length
      ? replyDurations.reduce((sum, value) => sum + value, 0) / replyDurations.length
      : 0;

    return {
      campaignId,
      total,
      drafted,
      queued,
      sending,
      sent,
      failed,
      replied,
      sendRate,
      replyRate,
      avgTimeToSendMs,
      avgTimeToReplyMs,
    };
  }

  async exportAuditCsv(campaignId: string): Promise<string> {
    const messages = await this.listMessages(campaignId);
    const header = [
      'campaignId',
      'contactId',
      'contactName',
      'contactEmail',
      'messageId',
      'status',
      'draftCreatedAt',
      'queuedAt',
      'sendStartedAt',
      'sentAt',
      'repliedAt',
      'error',
      'idempotencyKey',
    ];
    const rows = messages.map(item => [
      campaignId,
      item.contactId,
      item.contactName,
      item.contactEmail,
      item.messageId || '',
      item.status,
      item.draftCreatedAt || '',
      item.queuedAt || '',
      item.sendStartedAt || '',
      item.sentAt || '',
      item.repliedAt || '',
      item.error || '',
      item.idempotencyKey || '',
    ]);
    return [header, ...rows]
      .map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }
}

export const campaignStore = new CampaignStore();
