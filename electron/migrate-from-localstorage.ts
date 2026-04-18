import { getMeta, setMeta } from './db';
import { upsertRecipient } from './repository/recipients';
import { insertReplyIfNew } from './repository/replies';
import { setDeltaToken } from './repository/deltaTokens';

const MIGRATED_KEY = 'migrated_from_localstorage_v1';

interface LegacyTrackedRecipient {
  conversationId: string;
  recipientEmail: string;
  recipientName?: string;
  campaignId?: string;
  campaignName?: string;
  runId: string;
  messageId: string;
  sentAt: string;
  identityEmail?: string;
}

interface LegacyTrackedReply {
  id: string;
  conversationId: string;
  recipientEmail: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  seen: boolean;
  identityEmail?: string;
}

export interface LegacyDump {
  tracked: LegacyTrackedRecipient[];
  replies: LegacyTrackedReply[];
  deltaLinks: Record<string, string>;
}

export function isMigrated(): boolean {
  return getMeta(MIGRATED_KEY) === 'true';
}

export function runMigration(dump: LegacyDump): { imported: { recipients: number; replies: number; deltaTokens: number } } {
  let r = 0;
  for (const t of dump.tracked) {
    if (!t.conversationId || !t.recipientEmail) continue;
    const identity = (t.identityEmail || 'unknown@unknown').toLowerCase();
    upsertRecipient({
      id: t.messageId || `${t.runId}:${t.conversationId}`,
      runId: t.runId || 'legacy',
      campaignId: t.campaignId ?? null,
      campaignName: t.campaignName ?? null,
      identityEmail: identity,
      toEmail: t.recipientEmail,
      toName: t.recipientName ?? null,
      graphMessageId: t.messageId ?? null,
      conversationId: t.conversationId,
      submittedAt: t.sentAt ?? null,
      status: 'submitted',
    });
    r++;
  }
  let rep = 0;
  for (const reply of dump.replies) {
    const identity = (reply.identityEmail || 'unknown@unknown').toLowerCase();
    const inserted = insertReplyIfNew({
      id: reply.id,
      conversationId: reply.conversationId,
      identityEmail: identity,
      fromAddress: reply.fromAddress,
      fromName: reply.fromName,
      subject: reply.subject,
      bodyPreview: reply.bodyPreview,
      receivedAt: reply.receivedAt,
    });
    if (inserted) rep++;
  }
  let dt = 0;
  for (const [identity, link] of Object.entries(dump.deltaLinks || {})) {
    if (!link) continue;
    setDeltaToken(identity, 'Inbox', link);
    dt++;
  }
  setMeta(MIGRATED_KEY, 'true');
  return { imported: { recipients: r, replies: rep, deltaTokens: dt } };
}
