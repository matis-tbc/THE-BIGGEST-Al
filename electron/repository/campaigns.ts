import { getDb } from '../db';

export interface CampaignAggregate {
  campaign_id: string | null;
  campaign_name: string | null;
  identity_email: string | null;
  total: number;
  submitted: number;
  delivered: number;
  failed: number;
  bounced: number;
  replies: number;
  last_activity: string | null;
}

export function listCampaignAggregates(filter?: { identityEmail?: string; sinceIso?: string }): CampaignAggregate[] {
  const db = getDb();
  const where: string[] = [];
  const params: any = {};
  if (filter?.identityEmail) { where.push('r.identity_email = @identityEmail'); params.identityEmail = filter.identityEmail.toLowerCase(); }
  if (filter?.sinceIso) { where.push('(r.submitted_at IS NULL OR r.submitted_at >= @sinceIso)'); params.sinceIso = filter.sinceIso; }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const sql = `
    SELECT
      r.campaign_id,
      MAX(r.campaign_name) AS campaign_name,
      MAX(r.identity_email) AS identity_email,
      COUNT(*) AS total,
      SUM(CASE WHEN r.status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
      SUM(CASE WHEN r.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
      SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN r.status = 'bounced' THEN 1 ELSE 0 END) AS bounced,
      (SELECT COUNT(DISTINCT rep.conversation_id) FROM replies rep WHERE rep.conversation_id IN (
        SELECT conversation_id FROM recipients r2 WHERE r2.campaign_id IS r.campaign_id AND r2.identity_email = r.identity_email
      )) AS replies,
      MAX(r.submitted_at) AS last_activity
    FROM recipients r
    ${clause}
    GROUP BY r.campaign_id, r.identity_email
    ORDER BY last_activity DESC
  `;
  return db.prepare(sql).all(params) as CampaignAggregate[];
}

export interface ActivityEvent {
  type: 'send' | 'reply';
  at: string;
  identity_email: string;
  to_email?: string;
  from_address?: string;
  subject?: string;
  status?: string;
  campaign_name?: string;
  classification?: string;
  id: string;
}

export function recentActivity(filter?: { identityEmail?: string; limit?: number }): ActivityEvent[] {
  const db = getDb();
  const limit = filter?.limit ?? 50;
  const params: any = { limit };
  const idFilter = filter?.identityEmail ? 'AND identity_email = @identityEmail' : '';
  if (filter?.identityEmail) params.identityEmail = filter.identityEmail.toLowerCase();

  const sends = db.prepare(`
    SELECT 'send' AS type, id, submitted_at AS at, identity_email, to_email, subject, status, campaign_name
    FROM recipients
    WHERE submitted_at IS NOT NULL ${idFilter}
    ORDER BY submitted_at DESC
    LIMIT @limit
  `).all(params) as any[];

  const replies = db.prepare(`
    SELECT 'reply' AS type, id, received_at AS at, identity_email, from_address, subject, classification
    FROM replies
    WHERE 1 = 1 ${idFilter}
    ORDER BY received_at DESC
    LIMIT @limit
  `).all(params) as any[];

  const combined = [...sends, ...replies]
    .filter((e) => !!e.at)
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, limit);
  return combined as ActivityEvent[];
}

export interface TimelinePoint { bucket: string; sends: number; replies: number; }

export function sendsRepliesTimeline(filter?: { identityEmail?: string; days?: number }): TimelinePoint[] {
  const db = getDb();
  const days = filter?.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const idFilter = filter?.identityEmail ? 'AND identity_email = @identityEmail' : '';
  const params: any = { since };
  if (filter?.identityEmail) params.identityEmail = filter.identityEmail.toLowerCase();

  const sends = db.prepare(`
    SELECT DATE(submitted_at) AS bucket, COUNT(*) AS n FROM recipients
    WHERE submitted_at IS NOT NULL AND submitted_at >= @since ${idFilter}
    GROUP BY DATE(submitted_at)
  `).all(params) as { bucket: string; n: number }[];

  const replies = db.prepare(`
    SELECT DATE(received_at) AS bucket, COUNT(*) AS n FROM replies
    WHERE received_at >= @since ${idFilter}
    GROUP BY DATE(received_at)
  `).all(params) as { bucket: string; n: number }[];

  const map = new Map<string, TimelinePoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { bucket: key, sends: 0, replies: 0 });
  }
  for (const s of sends) { const p = map.get(s.bucket); if (p) p.sends = s.n; }
  for (const r of replies) { const p = map.get(r.bucket); if (p) p.replies = r.n; }
  return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}
