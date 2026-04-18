import path from 'path';
import Database from 'better-sqlite3';

let dbInstance: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recipients (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  campaign_id     TEXT,
  campaign_name   TEXT,
  identity_email  TEXT NOT NULL,
  to_email        TEXT NOT NULL,
  to_name         TEXT,
  subject         TEXT,
  graph_message_id     TEXT,
  internet_message_id  TEXT,
  conversation_id      TEXT,
  mode            TEXT,
  scheduled_for   TEXT,
  submitted_at    TEXT,
  delivered_at    TEXT,
  status          TEXT NOT NULL,
  failure_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_recipients_conv ON recipients(conversation_id);
CREATE INDEX IF NOT EXISTS idx_recipients_run ON recipients(run_id);
CREATE INDEX IF NOT EXISTS idx_recipients_identity ON recipients(identity_email);

CREATE TABLE IF NOT EXISTS replies (
  id                        TEXT PRIMARY KEY,
  recipient_id              TEXT REFERENCES recipients(id),
  conversation_id           TEXT NOT NULL,
  identity_email            TEXT NOT NULL,
  from_address              TEXT,
  from_name                 TEXT,
  subject                   TEXT,
  body_preview              TEXT,
  raw_body                  TEXT,
  received_at               TEXT NOT NULL,
  classification            TEXT,
  classification_confidence REAL,
  classification_summary    TEXT,
  classified_at             TEXT,
  seen                      INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_replies_conv ON replies(conversation_id);
CREATE INDEX IF NOT EXISTS idx_replies_received ON replies(received_at);

CREATE TABLE IF NOT EXISTS delta_tokens (
  identity_email TEXT NOT NULL,
  folder         TEXT NOT NULL,
  delta_link     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (identity_email, folder)
);

CREATE TABLE IF NOT EXISTS runs (
  id              TEXT PRIMARY KEY,
  campaign_id     TEXT,
  campaign_name   TEXT,
  identity_email  TEXT,
  mode            TEXT,
  stagger_seconds INTEGER,
  scheduled_for   TEXT,
  submitted_count INTEGER,
  failed_count    INTEGER,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

export function initDb(userDataDir: string): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = path.join(userDataDir, 'emaildrafter.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  dbInstance = db;
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) throw new Error('DB not initialized - call initDb(userDataDir) first');
  return dbInstance;
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
