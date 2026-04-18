import { getDb } from "../db";

export interface Metrics {
  total: number;
  submitted: number;
  delivered: number;
  failed: number;
  bounced: number;
  replyCount: number;
  replyRate: number;
}

export function computeMetrics(filter?: { identityEmail?: string }): Metrics {
  const db = getDb();
  const where: string[] = [];
  const params: any = {};
  if (filter?.identityEmail) {
    where.push("identity_email = @identityEmail");
    params.identityEmail = filter.identityEmail.toLowerCase();
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const counts = db
    .prepare(`
    SELECT status, COUNT(*) as n FROM recipients ${clause} GROUP BY status
  `)
    .all(params) as { status: string; n: number }[];

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  const total = counts.reduce((a, c) => a + c.n, 0);

  const replyRow = db
    .prepare(`
    SELECT COUNT(DISTINCT conversation_id) as n FROM replies ${clause}
  `)
    .get(params) as { n: number };
  const replyCount = replyRow?.n ?? 0;

  return {
    total,
    submitted: byStatus.submitted ?? 0,
    delivered: byStatus.delivered ?? 0,
    failed: byStatus.failed ?? 0,
    bounced: byStatus.bounced ?? 0,
    replyCount,
    replyRate: total > 0 ? replyCount / total : 0,
  };
}
