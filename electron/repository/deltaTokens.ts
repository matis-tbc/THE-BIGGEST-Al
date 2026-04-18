import { getDb } from "../db";

const ROTATE_AFTER_MS = 28 * 24 * 60 * 60 * 1000;

export function getDeltaToken(identityEmail: string, folder: string): string | null {
  const row = getDb()
    .prepare(
      "SELECT delta_link, updated_at FROM delta_tokens WHERE identity_email = ? AND folder = ?",
    )
    .get(identityEmail.toLowerCase(), folder) as
    | { delta_link: string; updated_at: string }
    | undefined;
  if (!row) return null;
  const age = Date.now() - new Date(row.updated_at).getTime();
  if (!Number.isNaN(age) && age > ROTATE_AFTER_MS) {
    clearDeltaToken(identityEmail, folder);
    return null;
  }
  return row.delta_link ?? null;
}

export function setDeltaToken(identityEmail: string, folder: string, deltaLink: string): void {
  getDb()
    .prepare(`
    INSERT INTO delta_tokens (identity_email, folder, delta_link, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(identity_email, folder) DO UPDATE SET
      delta_link = excluded.delta_link,
      updated_at = excluded.updated_at
  `)
    .run(identityEmail.toLowerCase(), folder, deltaLink, new Date().toISOString());
}

export function clearDeltaToken(identityEmail: string, folder: string): void {
  getDb()
    .prepare("DELETE FROM delta_tokens WHERE identity_email = ? AND folder = ?")
    .run(identityEmail.toLowerCase(), folder);
}
