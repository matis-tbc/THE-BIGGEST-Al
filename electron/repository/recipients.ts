import { getDb } from '../db';

export interface RecipientRow {
  id: string;
  run_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  identity_email: string;
  to_email: string;
  to_name: string | null;
  subject: string | null;
  graph_message_id: string | null;
  internet_message_id: string | null;
  conversation_id: string | null;
  mode: string | null;
  scheduled_for: string | null;
  submitted_at: string | null;
  delivered_at: string | null;
  status: string;
  failure_reason: string | null;
}

export interface UpsertRecipientInput {
  id: string;
  runId: string;
  campaignId?: string | null;
  campaignName?: string | null;
  identityEmail: string;
  toEmail: string;
  toName?: string | null;
  subject?: string | null;
  graphMessageId?: string | null;
  internetMessageId?: string | null;
  conversationId?: string | null;
  mode?: string | null;
  scheduledFor?: string | null;
  submittedAt?: string | null;
  status: string;
  failureReason?: string | null;
}

export function upsertRecipient(r: UpsertRecipientInput): void {
  getDb().prepare(`
    INSERT INTO recipients (
      id, run_id, campaign_id, campaign_name, identity_email, to_email, to_name,
      subject, graph_message_id, internet_message_id, conversation_id,
      mode, scheduled_for, submitted_at, status, failure_reason
    ) VALUES (
      @id, @runId, @campaignId, @campaignName, @identityEmail, @toEmail, @toName,
      @subject, @graphMessageId, @internetMessageId, @conversationId,
      @mode, @scheduledFor, @submittedAt, @status, @failureReason
    )
    ON CONFLICT(id) DO UPDATE SET
      campaign_id = excluded.campaign_id,
      campaign_name = excluded.campaign_name,
      identity_email = excluded.identity_email,
      to_email = excluded.to_email,
      to_name = excluded.to_name,
      subject = excluded.subject,
      graph_message_id = COALESCE(excluded.graph_message_id, recipients.graph_message_id),
      internet_message_id = COALESCE(excluded.internet_message_id, recipients.internet_message_id),
      conversation_id = COALESCE(excluded.conversation_id, recipients.conversation_id),
      mode = COALESCE(excluded.mode, recipients.mode),
      scheduled_for = COALESCE(excluded.scheduled_for, recipients.scheduled_for),
      submitted_at = COALESCE(excluded.submitted_at, recipients.submitted_at),
      status = excluded.status,
      failure_reason = COALESCE(excluded.failure_reason, recipients.failure_reason)
  `).run({
    id: r.id,
    runId: r.runId,
    campaignId: r.campaignId ?? null,
    campaignName: r.campaignName ?? null,
    identityEmail: r.identityEmail,
    toEmail: r.toEmail,
    toName: r.toName ?? null,
    subject: r.subject ?? null,
    graphMessageId: r.graphMessageId ?? null,
    internetMessageId: r.internetMessageId ?? null,
    conversationId: r.conversationId ?? null,
    mode: r.mode ?? null,
    scheduledFor: r.scheduledFor ?? null,
    submittedAt: r.submittedAt ?? null,
    status: r.status,
    failureReason: r.failureReason ?? null,
  });
}

export function listRecipients(filter?: { identityEmail?: string; runId?: string; campaignId?: string }): RecipientRow[] {
  const where: string[] = [];
  const params: any = {};
  if (filter?.identityEmail) { where.push('identity_email = @identityEmail'); params.identityEmail = filter.identityEmail.toLowerCase(); }
  if (filter?.runId) { where.push('run_id = @runId'); params.runId = filter.runId; }
  if (filter?.campaignId) { where.push('campaign_id = @campaignId'); params.campaignId = filter.campaignId; }
  const sql = `SELECT * FROM recipients ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY submitted_at DESC`;
  return getDb().prepare(sql).all(params) as RecipientRow[];
}

export function findByConversationId(conversationId: string): RecipientRow | undefined {
  return getDb().prepare('SELECT * FROM recipients WHERE conversation_id = ? LIMIT 1').get(conversationId) as RecipientRow | undefined;
}

export function getRecipientTimeline(id: string): { recipient: RecipientRow | null; replies: any[] } {
  const recipient = getDb().prepare('SELECT * FROM recipients WHERE id = ?').get(id) as RecipientRow | undefined;
  if (!recipient) return { recipient: null, replies: [] };
  const replies = recipient.conversation_id
    ? getDb().prepare('SELECT * FROM replies WHERE conversation_id = ? ORDER BY received_at ASC').all(recipient.conversation_id)
    : [];
  return { recipient, replies };
}
