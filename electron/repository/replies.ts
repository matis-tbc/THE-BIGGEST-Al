import { getDb } from '../db';
import { findByConversationId } from './recipients';

export interface ReplyRow {
  id: string;
  recipient_id: string | null;
  conversation_id: string;
  identity_email: string;
  from_address: string | null;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  raw_body: string | null;
  received_at: string;
  classification: string | null;
  classification_confidence: number | null;
  classification_summary: string | null;
  classified_at: string | null;
  seen: number;
}

export interface InsertReplyInput {
  id: string;
  conversationId: string;
  identityEmail: string;
  fromAddress?: string | null;
  fromName?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  rawBody?: string | null;
  receivedAt: string;
}

export function insertReplyIfNew(input: InsertReplyInput): ReplyRow | null {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM replies WHERE id = ?').get(input.id);
  if (exists) return null;
  const recipient = findByConversationId(input.conversationId);
  db.prepare(`
    INSERT INTO replies (
      id, recipient_id, conversation_id, identity_email, from_address, from_name,
      subject, body_preview, raw_body, received_at, seen
    ) VALUES (
      @id, @recipientId, @conversationId, @identityEmail, @fromAddress, @fromName,
      @subject, @bodyPreview, @rawBody, @receivedAt, 0
    )
  `).run({
    id: input.id,
    recipientId: recipient?.id ?? null,
    conversationId: input.conversationId,
    identityEmail: input.identityEmail.toLowerCase(),
    fromAddress: input.fromAddress ?? null,
    fromName: input.fromName ?? null,
    subject: input.subject ?? null,
    bodyPreview: input.bodyPreview ?? null,
    rawBody: input.rawBody ?? null,
    receivedAt: input.receivedAt,
  });
  return db.prepare('SELECT * FROM replies WHERE id = ?').get(input.id) as ReplyRow;
}

export function listReplies(filter?: { identityEmail?: string }): ReplyRow[] {
  const where: string[] = [];
  const params: any = {};
  if (filter?.identityEmail) { where.push('identity_email = @identityEmail'); params.identityEmail = filter.identityEmail.toLowerCase(); }
  const sql = `SELECT * FROM replies ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY received_at DESC`;
  return getDb().prepare(sql).all(params) as ReplyRow[];
}

export function markSeen(id: string): void {
  getDb().prepare('UPDATE replies SET seen = 1 WHERE id = ?').run(id);
}

export function markAllSeen(identityEmail?: string): void {
  if (identityEmail) {
    getDb().prepare('UPDATE replies SET seen = 1 WHERE identity_email = ?').run(identityEmail.toLowerCase());
  } else {
    getDb().prepare('UPDATE replies SET seen = 1').run();
  }
}
