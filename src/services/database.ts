import path from 'path';
import fs from 'fs';

// Type declarations for better-sqlite3
interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface SqliteStatement {
  all(...params: any[]): any[];
  run(...params: any[]): SqliteRunResult;
  get(...params: any[]): any;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  backup(destination: SqliteDatabase): void;
  close(): void;
  pragma(sql: string, options?: { simple?: boolean }): any;
}

// Dynamically import better-sqlite3 to avoid type issues
let BetterSqlite3: any;

try {
  BetterSqlite3 = require('better-sqlite3');
} catch (error) {
  console.error('Failed to load better-sqlite3:', error);
  throw error;
}

export interface QueryResult<T = any> {
  rows: T[];
  changes: number;
  lastInsertRowid: number | bigint;
}

export class DatabaseService {
  private db: SqliteDatabase;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Determine database path
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      // Default path in user data directory
      const userDataPath = process.env.ELECTRON_USER_DATA || 
                          (process.env.HOME ? path.join(process.env.HOME, '.emaildrafter') : './data');
      this.dbPath = path.join(userDataPath, 'emaildrafter.db');
    }
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`[Database] Initializing database at: ${this.dbPath}`);
    this.db = new BetterSqlite3(this.dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    
    // Create schema
    this.createSchema();
  }

  private createSchema(): void {
    const schema = `
      -- Templates table
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT,
        category TEXT,
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        versions TEXT DEFAULT '[]'
      );

      -- Campaigns table
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        template_id TEXT,
        attachment_name TEXT,
        status TEXT DEFAULT 'drafted',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Campaign messages
      CREATE TABLE IF NOT EXISTS campaign_messages (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        message_id TEXT,
        status TEXT DEFAULT 'drafted',
        draft_created_at TIMESTAMP,
        queued_at TIMESTAMP,
        send_started_at TIMESTAMP,
        sent_at TIMESTAMP,
        replied_at TIMESTAMP,
        error TEXT,
        idempotency_key TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );

      -- Message events
      CREATE TABLE IF NOT EXISTS message_events (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        message_id TEXT,
        contact_id TEXT,
        type TEXT NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );

      -- Contacts table (for future use)
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT,
        department TEXT,
        custom_fields TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign_id ON campaign_messages(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_messages_status ON campaign_messages(status);
      CREATE INDEX IF NOT EXISTS idx_message_events_campaign_id ON message_events(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    `;

    try {
      this.db.exec(schema);
      console.log('[Database] Schema initialized successfully');
    } catch (error) {
      console.error('[Database] Schema initialization failed:', error);
      throw error;
    }
  }

  // Public API methods
  query<T = any>(sql: string, params: any[] = []): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return params.length > 0 ? stmt.all(...params) : stmt.all();
    } catch (error) {
      console.error('[Database] Query error:', error, sql, params);
      throw error;
    }
  }

  execute(sql: string, params: any[] = []): SqliteRunResult {
    try {
      const stmt = this.db.prepare(sql);
      return params.length > 0 ? stmt.run(...params) : stmt.run();
    } catch (error) {
      console.error('[Database] Execute error:', error, sql, params);
      throw error;
    }
  }

  transaction<T>(fn: () => T): T {
    try {
      const transaction = this.db.transaction(fn);
      return transaction();
    } catch (error) {
      console.error('[Database] Transaction error:', error);
      throw error;
    }
  }

  backup(destinationPath: string): void {
    try {
      const backupDb = new BetterSqlite3(destinationPath);
      this.db.backup(backupDb);
      backupDb.close();
      console.log(`[Database] Backup created at: ${destinationPath}`);
    } catch (error) {
      console.error('[Database] Backup failed:', error);
      throw error;
    }
  }

  vacuum(): void {
    try {
      this.db.exec('VACUUM');
      console.log('[Database] Vacuum completed');
    } catch (error) {
      console.error('[Database] Vacuum failed:', error);
    }
  }

  close(): void {
    try {
      this.db.close();
      console.log('[Database] Connection closed');
    } catch (error) {
      console.error('[Database] Close error:', error);
    }
  }

  getDatabasePath(): string {
    return this.dbPath;
  }

  // Utility methods
  tableExists(tableName: string): boolean {
    try {
      const result = this.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName]
      );
      return result.length > 0;
    } catch (error) {
      console.error('[Database] Table exists check failed:', error);
      return false;
    }
  }

  getTableRowCount(tableName: string): number {
    try {
      const result = this.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${tableName}`
      );
      return result[0]?.count || 0;
    } catch (error) {
      console.error('[Database] Row count check failed:', error);
      return 0;
    }
  }
}

// Singleton instance for easy access
let databaseInstance: DatabaseService | null = null;

export function getDatabase(dbPath?: string): DatabaseService {
  if (!databaseInstance) {
    databaseInstance = new DatabaseService(dbPath);
  }
  return databaseInstance;
}

export function resetDatabaseInstance(): void {
  if (databaseInstance) {
    databaseInstance.close();
  }
  databaseInstance = null;
}