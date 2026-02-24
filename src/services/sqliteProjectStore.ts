import { ProjectStore, StoredTemplate, StoredTemplateVersion, StoredProjectSnapshot } from './projectStore';
import { getDatabase } from './database';

export class SQLiteProjectStore implements ProjectStore {
  private db = getDatabase();

  async listTemplates(): Promise<StoredTemplate[]> {
    try {
      const rows = this.db.query(
        'SELECT * FROM templates ORDER BY updated_at DESC'
      );
      
      return rows.map(row => this.mapTemplateRow(row));
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to list templates:', error);
      return [];
    }
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

    try {
      this.db.execute(
        `INSERT OR REPLACE INTO templates (id, name, content, variables, category, tags, created_at, updated_at, versions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          persisted.id,
          persisted.name,
          persisted.content,
          JSON.stringify(persisted.variables),
          persisted.category || null,
          JSON.stringify(persisted.tags || []),
          persisted.createdAt,
          persisted.updatedAt,
          JSON.stringify(persisted.versions)
        ]
      );

      return persisted;
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to save template:', error);
      throw error;
    }
  }

  async deleteTemplate(templateId: string): Promise<void> {
    try {
      this.db.execute('DELETE FROM templates WHERE id = ?', [templateId]);
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to delete template:', error);
      throw error;
    }
  }

  async createTemplateVersion(templateId: string, content: string): Promise<StoredTemplate | null> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template) return null;

      const version: StoredTemplateVersion = {
        id: `ver-${Date.now()}`,
        createdAt: new Date().toISOString(),
        content,
      };

      const updatedVersions = [version, ...template.versions].slice(0, 25); // Keep last 25 versions
      const updatedTemplate: StoredTemplate = {
        ...template,
        versions: updatedVersions,
        updatedAt: new Date().toISOString(),
      };

      await this.saveTemplate(updatedTemplate);
      return updatedTemplate;
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to create template version:', error);
      return null;
    }
  }

  async restoreTemplateVersion(templateId: string, versionId: string): Promise<StoredTemplate | null> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template) return null;
      
      const version = template.versions.find(item => item.id === versionId);
      if (!version) return null;

      const updatedTemplate: StoredTemplate = {
        ...template,
        content: version.content,
        updatedAt: new Date().toISOString(),
      };

      await this.saveTemplate(updatedTemplate);
      return updatedTemplate;
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to restore template version:', error);
      return null;
    }
  }

  async saveProject(snapshot: StoredProjectSnapshot): Promise<void> {
    try {
      // For now, we'll store projects in a simple JSON column
      // In a more advanced implementation, we'd normalize this data
      const projectsTableExists = this.db.tableExists('projects');
      
      if (!projectsTableExists) {
        this.db.execute(`
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }

      this.db.execute(
        `INSERT OR REPLACE INTO projects (id, name, data, updated_at)
         VALUES (?, ?, ?, ?)`,
        [
          snapshot.id,
          snapshot.name,
          JSON.stringify(snapshot),
          new Date().toISOString()
        ]
      );
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to save project:', error);
      // Don't throw for project saves since they're less critical
    }
  }

  async loadProject(projectId: string): Promise<StoredProjectSnapshot | null> {
    try {
      const rows = this.db.query(
        'SELECT data FROM projects WHERE id = ?',
        [projectId]
      );
      
      if (rows.length === 0) return null;
      
      return JSON.parse(rows[0].data);
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to load project:', error);
      return null;
    }
  }

  async listProjects(): Promise<StoredProjectSnapshot[]> {
    try {
      const rows = this.db.query(
        'SELECT data FROM projects ORDER BY updated_at DESC'
      );
      
      return rows.map(row => JSON.parse(row.data));
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to list projects:', error);
      return [];
    }
  }

  // Helper methods
  private async getTemplate(id: string): Promise<StoredTemplate | null> {
    try {
      const rows = this.db.query(
        'SELECT * FROM templates WHERE id = ?',
        [id]
      );
      
      if (rows.length === 0) return null;
      
      return this.mapTemplateRow(rows[0]);
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to get template:', error);
      return null;
    }
  }

  private mapTemplateRow(row: any): StoredTemplate {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      variables: this.parseJson(row.variables, []),
      category: row.category || undefined,
      tags: this.parseJson(row.tags, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      versions: this.parseJson(row.versions, [])
    };
  }

  private parseJson<T>(jsonString: string, defaultValue: T): T {
    if (!jsonString) return defaultValue;
    try {
      return JSON.parse(jsonString);
    } catch {
      return defaultValue;
    }
  }

  // Additional utility methods for SQLite store
  async getTemplateCount(): Promise<number> {
    try {
      const result = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM templates');
      return result[0]?.count || 0;
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to get template count:', error);
      return 0;
    }
  }

  async searchTemplates(searchTerm: string): Promise<StoredTemplate[]> {
    try {
      const rows = this.db.query(
        `SELECT * FROM templates
         WHERE name LIKE ? OR content LIKE ? OR category LIKE ?
         ORDER BY updated_at DESC`,
        [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
      );
      
      return rows.map(row => this.mapTemplateRow(row));
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to search templates:', error);
      return [];
    }
  }

  async exportTemplate(templateId: string): Promise<string> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        template: {
          ...template,
          // Remove internal fields
          createdAt: undefined,
          updatedAt: undefined,
          versions: undefined
        }
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to export template:', error);
      throw error;
    }
  }

  async importTemplate(jsonData: string): Promise<StoredTemplate> {
    try {
      const data = JSON.parse(jsonData);
      
      // Validate the import data
      if (!data.template || !data.template.id || !data.template.name || !data.template.content) {
        throw new Error('Invalid template format');
      }

      const templateData = data.template;
      const now = new Date().toISOString();
      
      const template: StoredTemplate = {
        id: templateData.id || `template-${Date.now()}`,
        name: templateData.name,
        content: templateData.content,
        variables: templateData.variables || [],
        category: templateData.category,
        tags: templateData.tags || [],
        createdAt: now,
        updatedAt: now,
        versions: []
      };

      return await this.saveTemplate(template);
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to import template:', error);
      throw error;
    }
  }

  async getTemplatesByCategory(category: string): Promise<StoredTemplate[]> {
    try {
      const rows = this.db.query(
        'SELECT * FROM templates WHERE category = ? ORDER BY updated_at DESC',
        [category]
      );
      
      return rows.map(row => this.mapTemplateRow(row));
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to get templates by category:', error);
      return [];
    }
  }

  async getTemplatesByTag(tag: string): Promise<StoredTemplate[]> {
    try {
      // Since tags are stored as JSON array, we need to search within the JSON
      const rows = this.db.query(
        'SELECT * FROM templates WHERE tags LIKE ? ORDER BY updated_at DESC',
        [`%"${tag}"%`]
      );
      
      return rows.map(row => this.mapTemplateRow(row));
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to get templates by tag:', error);
      return [];
    }
  }

  async getAllCategories(): Promise<string[]> {
    try {
      const rows = this.db.query<{category: string}>(
        'SELECT DISTINCT category FROM templates WHERE category IS NOT NULL AND category != "" ORDER BY category'
      );
      
      return rows.map(row => row.category).filter(Boolean);
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to get categories:', error);
      return [];
    }
  }

  async getAllTags(): Promise<string[]> {
    try {
      const rows = this.db.query<{tags: string}>(
        'SELECT tags FROM templates WHERE tags IS NOT NULL AND tags != "[]"'
      );
      
      const allTags = new Set<string>();
      rows.forEach(row => {
        try {
          const tags = JSON.parse(row.tags) as string[];
          tags.forEach(tag => allTags.add(tag));
        } catch {
          // Ignore invalid JSON
        }
      });
      
      return Array.from(allTags).sort();
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to get tags:', error);
      return [];
    }
  }

  async cleanupOldVersions(templateId: string, keepCount: number = 10): Promise<void> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template || template.versions.length <= keepCount) return;

      const updatedVersions = template.versions.slice(0, keepCount);
      const updatedTemplate: StoredTemplate = {
        ...template,
        versions: updatedVersions,
        updatedAt: new Date().toISOString(),
      };

      await this.saveTemplate(updatedTemplate);
    } catch (error) {
      console.error('[SQLiteProjectStore] Failed to cleanup old versions:', error);
    }
  }
}

// Create and export a singleton instance
export const sqliteProjectStore = new SQLiteProjectStore();