import { getDb } from "../db";

export interface RunRow {
  id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  identity_email: string | null;
  mode: string | null;
  stagger_seconds: number | null;
  scheduled_for: string | null;
  submitted_count: number | null;
  failed_count: number | null;
  created_at: string;
}

export interface CreateRunInput {
  id: string;
  campaignId?: string | null;
  campaignName?: string | null;
  identityEmail?: string | null;
  mode?: string | null;
  staggerSeconds?: number | null;
  scheduledFor?: string | null;
  createdAt: string;
}

export function createRun(input: CreateRunInput): void {
  getDb()
    .prepare(`
    INSERT INTO runs (id, campaign_id, campaign_name, identity_email, mode, stagger_seconds, scheduled_for, submitted_count, failed_count, created_at)
    VALUES (@id, @campaignId, @campaignName, @identityEmail, @mode, @staggerSeconds, @scheduledFor, 0, 0, @createdAt)
    ON CONFLICT(id) DO NOTHING
  `)
    .run({
      id: input.id,
      campaignId: input.campaignId ?? null,
      campaignName: input.campaignName ?? null,
      identityEmail: input.identityEmail ?? null,
      mode: input.mode ?? null,
      staggerSeconds: input.staggerSeconds ?? null,
      scheduledFor: input.scheduledFor ?? null,
      createdAt: input.createdAt,
    });
}

export function finalizeRun(id: string, submitted: number, failed: number): void {
  getDb()
    .prepare("UPDATE runs SET submitted_count = ?, failed_count = ? WHERE id = ?")
    .run(submitted, failed, id);
}

export function listRuns(filter?: { identityEmail?: string }): RunRow[] {
  const where: string[] = [];
  const params: any = {};
  if (filter?.identityEmail) {
    where.push("identity_email = @identityEmail");
    params.identityEmail = filter.identityEmail.toLowerCase();
  }
  const sql = `SELECT * FROM runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  return getDb().prepare(sql).all(params) as RunRow[];
}
