# SQLite Migration Strategy - Step-by-Step Implementation

## Migration Overview

**Goal**: Migrate from LocalStorage to SQLite without data loss or downtime
**Approach**: Dual-write during migration, then cutover
**Timeline**: 4 weeks with safety checks at each phase

## Phase 1: Foundation Setup (Week 1)

### Step 1.1: Create Database Service
Create `src/services/database.ts`:

```typescript
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export class DatabaseService {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    // Determine database path based on environment
    const userDataPath = app?.getPath('userData') || process.cwd();
    this.dbPath = path.join(userDataPath, 'emaildrafter.db');
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
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

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign_id ON campaign_messages(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_messages_status ON campaign_messages(status);
      CREATE INDEX IF NOT EXISTS idx_message_events_campaign_id ON message_events(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates(updated_at DESC);
    `;

    this.db.exec(schema);
  }

  // Public API methods
  query<T = any>(sql: string, params: any[] = []): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return params.length > 0 ? stmt.all(...params) : stmt.all();
    } catch (error) {
      console.error('Database query error:', error, sql, params);
      throw error;
    }
  }

  execute(sql: string, params: any[] = []): Database.RunResult {
    try {
      const stmt = this.db.prepare(sql);
      return params.length > 0 ? stmt.run(...params) : stmt.run();
    } catch (error) {
      console.error('Database execute error:', error, sql, params);
      throw error;
    }
  }

  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  backup(destinationPath: string): void {
    const backupDb = new Database(destinationPath);
    this.db.backup(backupDb);
    backupDb.close();
  }

  close(): void {
    this.db.close();
  }

  getDatabasePath(): string {
    return this.dbPath;
  }
}

// Singleton instance
let databaseInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!databaseInstance) {
    databaseInstance = new DatabaseService();
  }
  return databaseInstance;
}
```

### Step 1.2: Create Migration Service
Create `src/services/migrationService.ts`:

```typescript
import { getDatabase } from './database';
import { projectStore } from './projectStore';
import { campaignStore } from './campaignStore';

export class MigrationService {
  private db = getDatabase();

  async migrateFromLocalStorage(): Promise<MigrationResult> {
    const result: MigrationResult = {
      templates: { count: 0, errors: [] },
      campaigns: { count: 0, errors: [] },
      messages: { count: 0, errors: [] },
      events: { count: 0, errors: [] },
    };

    try {
      // Start transaction
      this.db.transaction(() => {
        // Migrate templates
        result.templates = this.migrateTemplates();
        
        // Migrate campaigns and related data
        result.campaigns = this.migrateCampaigns();
        
        // Note: Current LocalStorage doesn't store messages/events separately
        // They're stored within campaign data structure
      });

      return result;
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  private migrateTemplates(): MigrationItemResult {
    const templates = window.localStorage.getItem('email-drafter.templates.v1');
    if (!templates) return { count: 0, errors: [] };

    const parsed = JSON.parse(templates);
    let count = 0;
    const errors: string[] = [];

    parsed.forEach((template: any) => {
      try {
        this.db.execute(
          `INSERT OR REPLACE INTO templates (id, name, content, variables, created_at, updated_at, versions)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            template.id,
            template.name,
            template.content,
            JSON.stringify(template.variables || []),
            template.createdAt || new Date().toISOString(),
            template.updatedAt || new Date().toISOString(),
            JSON.stringify(template.versions || [])
          ]
        );
        count++;
      } catch (error) {
        errors.push(`Template ${template.id}: ${error.message}`);
      }
    });

    return { count, errors };
  }

  private migrateCampaigns(): MigrationItemResult {
    const campaigns = window.localStorage.getItem('email-drafter.campaign-db.v1');
    if (!campaigns) return { count: 0, errors: [] };

    const parsed = JSON.parse(campaigns);
    let count = 0;
    const errors: string[] = [];

    // Migrate campaigns
    if (parsed.campaigns) {
      parsed.campaigns.forEach((campaign: any) => {
        try {
          this.db.execute(
            `INSERT OR REPLACE INTO campaigns (id, name, template_id, attachment_name, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              campaign.id,
              campaign.name,
              campaign.templateId,
              campaign.attachmentName,
              campaign.status || 'drafted',
              campaign.createdAt || new Date().toISOString(),
              campaign.updatedAt || new Date().toISOString()
            ]
          );
          count++;
        } catch (error) {
          errors.push(`Campaign ${campaign.id}: ${error.message}`);
        }
      });
    }

    // Migrate messages
    if (parsed.messages) {
      parsed.messages.forEach((message: any) => {
        try {
          this.db.execute(
            `INSERT OR REPLACE INTO campaign_messages 
             (id, campaign_id, contact_id, contact_name, contact_email, message_id, status, 
              draft_created_at, queued_at, send_started_at, sent_at, replied_at, error, idempotency_key, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              message.id,
              message.campaignId,
              message.contactId,
              message.contactName,
              message.contactEmail,
              message.messageId,
              message.status,
              message.draftCreatedAt,
              message.queuedAt,
              message.sendStartedAt,
              message.sentAt,
              message.repliedAt,
              message.error,
              message.idempotencyKey,
              message.updatedAt || new Date().toISOString()
            ]
          );
        } catch (error) {
          errors.push(`Message ${message.id}: ${error.message}`);
        }
      });
    }

    // Migrate events
    if (parsed.events) {
      parsed.events.forEach((event: any) => {
        try {
          this.db.execute(
            `INSERT OR REPLACE INTO message_events (id, campaign_id, message_id, contact_id, type, detail, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              event.id,
              event.campaignId,
              event.messageId,
              event.contactId,
              event.type,
              event.detail,
              event.createdAt || new Date().toISOString()
            ]
          );
        } catch (error) {
          errors.push(`Event ${event.id}: ${error.message}`);
        }
      });
    }

    return { count, errors };
  }

  async validateMigration(): Promise<ValidationResult> {
    const result: ValidationResult = {
      templates: { localStorage: 0, sqlite: 0, match: false },
      campaigns: { localStorage: 0, sqlite: 0, match: false },
      messages: { localStorage: 0, sqlite: 0, match: false },
      events: { localStorage: 0, sqlite: 0, match: false },
    };

    // Validate templates
    const templatesLS = window.localStorage.getItem('email-drafter.templates.v1');
    if (templatesLS) {
      result.templates.localStorage = JSON.parse(templatesLS).length;
    }
    const templatesSQL = this.db.query('SELECT COUNT(*) as count FROM templates');
    result.templates.sqlite = templatesSQL[0]?.count || 0;
    result.templates.match = result.templates.localStorage === result.templates.sqlite;

    // Validate campaigns
    const campaignsLS = window.localStorage.getItem('email-drafter.campaign-db.v1');
    if (campaignsLS) {
      const parsed = JSON.parse(campaignsLS);
      result.campaigns.localStorage = parsed.campaigns?.length || 0;
      result.messages.localStorage = parsed.messages?.length || 0;
      result.events.localStorage = parsed.events?.length || 0;
    }

    const campaignsSQL = this.db.query('SELECT COUNT(*) as count FROM campaigns');
    result.campaigns.sqlite = campaignsSQL[0]?.count || 0;
    result.campaigns.match = result.campaigns.localStorage === result.campaigns.sqlite;

    const messagesSQL = this.db.query('SELECT COUNT(*) as count FROM campaign_messages');
    result.messages.sqlite = messagesSQL[0]?.count || 0;
    result.messages.match = result.messages.localStorage === result.messages.sqlite;

    const eventsSQL = this.db.query('SELECT COUNT(*) as count FROM message_events');
    result.events.sqlite = eventsSQL[0]?.count || 0;
    result.events.match = result.events.localStorage === result.events.sqlite;

    return result;
  }
}

interface MigrationResult {
  templates: MigrationItemResult;
  campaigns: MigrationItemResult;
  messages: MigrationItemResult;
  events: MigrationItemResult;
}

interface MigrationItemResult {
  count: number;
  errors: string[];
}

interface ValidationResult {
  templates: ValidationItem;
  campaigns: ValidationItem;
  messages: ValidationItem;
  events: ValidationItem;
}

interface ValidationItem {
  localStorage: number;
  sqlite: number;
  match: boolean;
}
```

## Phase 2: Dual-Write Stores (Week 2)

### Step 2.1: Create SQLite Project Store
Create `src/services/sqliteProjectStore.ts`:

```typescript
import { ProjectStore, StoredTemplate, StoredProjectSnapshot } from './projectStore';
import { getDatabase } from './database';

export class SQLiteProjectStore implements ProjectStore {
  private db = getDatabase();

  async listTemplates(): Promise<StoredTemplate[]> {
    const rows = this.db.query(
      'SELECT * FROM templates ORDER BY updated_at DESC'
    );
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      content: row.content,
      variables: JSON.parse(row.variables || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      versions: JSON.parse(row.versions || '[]')
    }));
  }

  async saveTemplate(template: Omit<StoredTemplate, 'createdAt' | 'updatedAt'> & 
    Partial<Pick<StoredTemplate, 'createdAt' | 'updatedAt'>>): Promise<StoredTemplate> {
    
    const now = new Date().toISOString();
    const existing = await this.getTemplate(template.id);
    
    const persisted: StoredTemplate = {
      ...template,
      createdAt: existing?.createdAt || template.createdAt || now,
      updatedAt: now,
      versions: template.versions || existing?.versions || [],
    };

    this.db.execute(
      `INSERT OR REPLACE INTO templates (id, name, content, variables, created_at, updated_at, versions)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        persisted.id,
        persisted.name,
        persisted.content,
        JSON.stringify(persisted.variables),
        persisted.createdAt,
        persisted.updatedAt,
        JSON.stringify(persisted.versions)
      ]
    );

    return persisted;
  }

  private async getTemplate(id: string): Promise<StoredTemplate | null> {
    const rows = this.db.query(
      'SELECT * FROM templates WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) return null;
    
    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      variables: JSON.parse(row.variables || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      versions: JSON.parse(row.versions || '[]')
    };
  }

  // Implement other ProjectStore interface methods...
  // deleteTemplate, createTemplateVersion, restoreTemplateVersion, etc.

  async saveProject(snapshot: StoredProjectSnapshot): Promise<void> {
    // Store in SQLite (projects table would need to be added to schema)
    // For now, we'll just implement the interface
    console.log('SQLite project save:', snapshot.id);
  }

  async loadProject(projectId: string): Promise<StoredProjectSnapshot | null> {
    // Implement SQLite loading
    return null;
  }

  async listProjects(): Promise<StoredProjectSnapshot[]> {
    // Implement SQLite query
    return [];
  }
}
```

### Step 2.2: Create Dual-Write Adapter
Create `src/services/dualWriteProjectStore.ts`:

```typescript
import { ProjectStore, StoredTemplate, StoredProjectSnapshot } from './projectStore';
import { LocalProjectStore } from './projectStore';
import { SQLiteProjectStore } from './sqliteProjectStore';

export class DualWriteProjectStore implements ProjectStore {
  private localStorageStore: LocalProjectStore;
  private sqliteStore: SQLiteProjectStore;
  private useSQLite: boolean = false;

  constructor() {
    this.localStorageStore = new LocalProjectStore();
    this.sqliteStore = new SQLiteProjectStore();
  }

  enableSQLite(): void {
    this.useSQLite = true;
  }

  disableSQLite(): void {
    this.useSQLite = false;
  }

  async listTemplates(): Promise<StoredTemplate[]> {
    if (this.useSQLite) {
      return this.sqliteStore.listTemplates();
    }
    return this.localStorageStore.listTemplates();
  }

  async saveTemplate(template: Omit<StoredTemplate, 'createdAt' | 'updatedAt'> & 
    Partial<Pick<StoredTemplate, 'createdAt' | 'updatedAt'>>): Promise<StoredTemplate> {
    
    // Write to both stores
    const [localResult, sqliteResult] = await Promise.all([
      this.localStorageStore.saveTemplate(template),
      this.sqliteStore.saveTemplate(template).catch(error => {
        console.error('SQLite save failed, continuing with LocalStorage:', error);
        return null;
      })
    ]);

    // Return the successful result (prefer SQLite if available)
    return sqliteResult || localResult;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await Promise.all([
      this.localStorageStore.deleteTemplate(templateId),
      this.sqliteStore.deleteTemplate(templateId).catch(error => {
        console.error('SQLite delete failed:', error);
      })
    ]);
  }

  // Implement other methods with dual-write pattern...
}
```

### Step 2.3: Update Application to Use Dual-Write Store
Update `src/services/projectStore.ts`:

```typescript
// At the bottom of the file, replace the export with:
import { DualWriteProjectStore } from './dualWriteProjectStore';
export const projectStore: ProjectStore = new DualWriteProjectStore();
```

## Phase 3: Migration & Validation (Week 3)

### Step 3.1: Create Migration UI Component
Create `src/components/MigrationWizard.tsx`:

```typescript