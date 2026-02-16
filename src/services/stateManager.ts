import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';

interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string;
}

interface ProcessingResult {
  contactId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  messageId?: string;
  error?: string;
}

interface Operation {
  id: string;
  name: string;
  totalContacts: number;
  completedContacts: number;
  failedContacts: number;
  status: 'running' | 'completed' | 'failed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
  templateId?: string;
  attachmentName?: string;
}

export class StateManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    // Store database in user's app data directory
    const appDataPath = process.platform === 'win32' 
      ? path.join(os.homedir(), 'AppData', 'Roaming', 'email-drafter')
      : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'email-drafter')
      : path.join(os.homedir(), '.config', 'email-drafter');
    
    this.dbPath = path.join(appDataPath, 'operations.db');
  }

  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      const fs = require('fs');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      this.db = new Database(this.dbPath);
      await this.createTables();
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Operations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        total_contacts INTEGER NOT NULL,
        completed_contacts INTEGER DEFAULT 0,
        failed_contacts INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        template_id TEXT,
        attachment_name TEXT
      )
    `);

    // Contact results table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contact_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        status TEXT NOT NULL,
        message_id TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (operation_id) REFERENCES operations (id)
      )
    `);

    // Templates table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async createOperation(
    operationId: string,
    name: string,
    contacts: Contact[],
    templateId?: string,
    attachmentName?: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create operation record
    this.db.prepare(`
      INSERT INTO operations (id, name, total_contacts, template_id, attachment_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(operationId, name, contacts.length, templateId, attachmentName);

    // Create contact result records
    const insertContact = this.db.prepare(`
      INSERT INTO contact_results (operation_id, contact_id, contact_name, contact_email, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);

    const insertMany = this.db.transaction((contacts: Contact[]) => {
      for (const contact of contacts) {
        insertContact.run(operationId, contact.id, contact.name, contact.email);
      }
    });

    insertMany(contacts);
  }

  async updateContactResult(
    operationId: string,
    contactId: string,
    status: 'processing' | 'completed' | 'failed',
    messageId?: string,
    error?: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare(`
      UPDATE contact_results 
      SET status = ?, message_id = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE operation_id = ? AND contact_id = ?
    `).run(status, messageId, error, operationId, contactId);

    // Update operation statistics
    await this.updateOperationStats(operationId);
  }

  private async updateOperationStats(operationId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get current counts
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM contact_results 
      WHERE operation_id = ?
    `).get(operationId);

    // Update operation
    this.db.prepare(`
      UPDATE operations 
      SET completed_contacts = ?, failed_contacts = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stats.completed, stats.failed, operationId);

    // Update operation status
    const newStatus = stats.completed + stats.failed >= stats.total ? 'completed' : 'running';
    this.db.prepare(`
      UPDATE operations 
      SET status = ?
      WHERE id = ?
    `).run(newStatus, operationId);
  }

  async getOperation(operationId: string): Promise<Operation | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare(`
      SELECT * FROM operations WHERE id = ?
    `).get(operationId);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      totalContacts: row.total_contacts,
      completedContacts: row.completed_contacts,
      failedContacts: row.failed_contacts,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      templateId: row.template_id,
      attachmentName: row.attachment_name
    };
  }

  async getContactResults(operationId: string): Promise<ProcessingResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(`
      SELECT contact_id, status, message_id, error_message
      FROM contact_results 
      WHERE operation_id = ?
      ORDER BY created_at
    `).all(operationId);

    return rows.map(row => ({
      contactId: row.contact_id,
      status: row.status,
      messageId: row.message_id,
      error: row.error_message
    }));
  }

  async getAllOperations(): Promise<Operation[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(`
      SELECT * FROM operations 
      ORDER BY created_at DESC
    `).all();

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      totalContacts: row.total_contacts,
      completedContacts: row.completed_contacts,
      failedContacts: row.failed_contacts,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      templateId: row.template_id,
      attachmentName: row.attachment_name
    }));
  }

  async saveTemplate(templateId: string, name: string, content: string, variables: string[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare(`
      INSERT OR REPLACE INTO templates (id, name, content, variables)
      VALUES (?, ?, ?, ?)
    `).run(templateId, name, content, JSON.stringify(variables));
  }

  async getTemplate(templateId: string): Promise<{id: string, name: string, content: string, variables: string[]} | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare(`
      SELECT * FROM templates WHERE id = ?
    `).get(templateId);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      content: row.content,
      variables: JSON.parse(row.variables)
    };
  }

  async getAllTemplates(): Promise<Array<{id: string, name: string, content: string, variables: string[]}>> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(`
      SELECT * FROM templates ORDER BY created_at DESC
    `).all();

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      content: row.content,
      variables: JSON.parse(row.variables)
    }));
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
