import { anthropicMessage, getApiKey } from './anthropic';
import { getDb } from './db';

const MODEL = 'claude-haiku-4-5-20251001';

export type ReplyCategory =
  | 'interested'
  | 'not_interested'
  | 'auto_reply'
  | 'out_of_office'
  | 'bounce'
  | 'needs_followup'
  | 'other';

const ALLOWED: ReplyCategory[] = [
  'interested', 'not_interested', 'auto_reply', 'out_of_office',
  'bounce', 'needs_followup', 'other',
];

export interface ClassifyInput {
  id: string;
  fromAddress?: string | null;
  fromName?: string | null;
  subject?: string | null;
  body?: string | null;
}

export interface Classification {
  category: ReplyCategory;
  confidence: number;
  summary: string;
}

function buildPrompt(input: ClassifyInput): string {
  const sender = input.fromName ? `${input.fromName} <${input.fromAddress}>` : (input.fromAddress || '');
  const body = (input.body || '').slice(0, 8000);
  return [
    'Classify this email reply into ONE of:',
    '- interested | not_interested | auto_reply | out_of_office',
    '- bounce | needs_followup | other',
    '',
    'Return strict JSON: {"category": "...", "confidence": 0.0-1.0, "summary": "one short sentence"}.',
    '',
    `Sender: ${sender}`,
    `Subject: ${input.subject || ''}`,
    'Body:',
    body,
  ].join('\n');
}

function parseClassification(text: string): Classification | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]);
    const category = ALLOWED.includes(raw.category) ? raw.category as ReplyCategory : 'other';
    const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
    const summary = typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : '';
    return { category, confidence, summary };
  } catch {
    return null;
  }
}

export async function classifyReply(input: ClassifyInput): Promise<Classification | null> {
  if (!getApiKey()) return null;
  const text = await anthropicMessage({
    model: MODEL,
    maxTokens: 256,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  });
  return parseClassification(text);
}

export async function classifyAndPersist(replyId: string): Promise<Classification | null> {
  const db = getDb();
  const row = db.prepare('SELECT id, from_address, from_name, subject, body_preview, raw_body, classification FROM replies WHERE id = ?')
    .get(replyId) as any;
  if (!row) return null;
  if (row.classification) {
    return {
      category: row.classification,
      confidence: row.classification_confidence ?? 0,
      summary: row.classification_summary ?? '',
    };
  }
  const result = await classifyReply({
    id: row.id,
    fromAddress: row.from_address,
    fromName: row.from_name,
    subject: row.subject,
    body: row.raw_body || row.body_preview,
  });
  if (!result) return null;
  db.prepare(`
    UPDATE replies
    SET classification = ?, classification_confidence = ?, classification_summary = ?, classified_at = ?
    WHERE id = ?
  `).run(result.category, result.confidence, result.summary, new Date().toISOString(), replyId);
  return result;
}

export async function reclassify(replyId: string): Promise<Classification | null> {
  const db = getDb();
  db.prepare('UPDATE replies SET classification = NULL, classification_confidence = NULL, classification_summary = NULL, classified_at = NULL WHERE id = ?').run(replyId);
  return classifyAndPersist(replyId);
}
