const TRACKED_KEY = "emaildrafter:tracked-recipients";
const REPLIES_KEY = "emaildrafter:replies";
const DELTA_KEY = "emaildrafter:inbox-delta-link";
const MIGRATION_ATTEMPTED_KEY = "emaildrafter:migration-attempted";

export interface TrackedRecipient {
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

export interface TrackedReply {
  id: string;
  conversationId: string;
  recipientEmail: string;
  recipientName?: string;
  campaignName?: string;
  runId?: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  bodyPreview: string;
  rawBody?: string;
  receivedAt: string;
  seen: boolean;
  identityEmail?: string;
  classification?: string | null;
  classificationConfidence?: number | null;
  classificationSummary?: string | null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function api() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

function mapReplyRowToTracked(row: any): TrackedReply {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    recipientEmail: row.recipient_email || '',
    fromAddress: row.from_address || '',
    fromName: row.from_name || '',
    subject: row.subject || '',
    bodyPreview: row.body_preview || '',
    rawBody: row.raw_body || undefined,
    receivedAt: row.received_at,
    seen: !!row.seen,
    identityEmail: row.identity_email,
    classification: row.classification ?? null,
    classificationConfidence: row.classification_confidence ?? null,
    classificationSummary: row.classification_summary ?? null,
  };
}

export async function migrateFromLocalStorageOnce(): Promise<void> {
  const a = api();
  if (!a) return;
  if (sessionStorage.getItem(MIGRATION_ATTEMPTED_KEY) === 'true') return;
  sessionStorage.setItem(MIGRATION_ATTEMPTED_KEY, 'true');
  try {
    const already = await a.dbIsMigrated();
    if (already) return;
    const dump = {
      tracked: readJson<TrackedRecipient[]>(TRACKED_KEY, []),
      replies: readJson<TrackedReply[]>(REPLIES_KEY, []),
      deltaLinks: readJson<Record<string, string>>(DELTA_KEY, {}),
    };
    if (!dump.tracked.length && !dump.replies.length && !Object.keys(dump.deltaLinks).length) {
      await a.dbRunMigration(dump);
      return;
    }
    const result = await a.dbRunMigration(dump);
    if (result && !result.alreadyMigrated) {
      try {
        localStorage.removeItem(TRACKED_KEY);
        localStorage.removeItem(REPLIES_KEY);
        localStorage.removeItem(DELTA_KEY);
      } catch {}
    }
  } catch (err) {
    console.warn('localStorage migration failed:', err);
  }
}

export async function getReplies(identityEmail?: string): Promise<TrackedReply[]> {
  const a = api();
  if (!a) return [];
  const rows = await a.dbListReplies(identityEmail ? { identityEmail } : undefined);
  return rows.map(mapReplyRowToTracked);
}

export async function recordReplies(replies: TrackedReply[]): Promise<TrackedReply[]> {
  const a = api();
  if (!a) return [];
  if (replies.length === 0) return getReplies(replies[0]?.identityEmail);
  await a.dbRecordReplies(replies.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    identityEmail: r.identityEmail || '',
    fromAddress: r.fromAddress,
    fromName: r.fromName,
    subject: r.subject,
    bodyPreview: r.bodyPreview,
    rawBody: r.rawBody,
    receivedAt: r.receivedAt,
  })));
  return getReplies(replies[0]?.identityEmail);
}

export async function markReplySeen(id: string, identityEmail?: string): Promise<TrackedReply[]> {
  const a = api();
  if (!a) return [];
  await a.dbMarkReplySeen(id);
  return getReplies(identityEmail);
}

export async function markAllRepliesSeen(identityEmail?: string): Promise<TrackedReply[]> {
  const a = api();
  if (!a) return [];
  await a.dbMarkAllRepliesSeen(identityEmail);
  return getReplies(identityEmail);
}

export async function getDeltaLink(identityEmail: string | null): Promise<string | undefined> {
  const a = api();
  if (!a || !identityEmail) return undefined;
  const v = await a.dbGetDeltaToken(identityEmail, 'Inbox');
  return v ?? undefined;
}

export async function setDeltaLink(identityEmail: string | null, link: string | undefined): Promise<void> {
  const a = api();
  if (!a || !identityEmail) return;
  if (link) await a.dbSetDeltaToken(identityEmail, 'Inbox', link);
  else await a.dbClearDeltaToken(identityEmail, 'Inbox');
}

export async function getTrackedRecipientByConversation(conversationId: string, identityEmail?: string): Promise<{ recipientEmail: string; recipientName?: string; campaignName?: string; runId?: string; identityEmail?: string } | null> {
  const a = api();
  if (!a) return null;
  const rows = await a.dbListRecipients(identityEmail ? { identityEmail } : undefined);
  const hit = rows.find((r: any) => r.conversation_id === conversationId);
  if (!hit) return null;
  return {
    recipientEmail: hit.to_email,
    recipientName: hit.to_name || undefined,
    campaignName: hit.campaign_name || undefined,
    runId: hit.run_id,
    identityEmail: hit.identity_email,
  };
}
