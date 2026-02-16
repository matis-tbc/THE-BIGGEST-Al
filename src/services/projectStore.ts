export interface StoredTemplateVersion {
  id: string;
  createdAt: string;
  content: string;
}

export interface StoredTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
  versions: StoredTemplateVersion[];
}

export interface StoredProjectSnapshot {
  id: string;
  name: string;
  contacts: Array<Record<string, string>>;
  templateId?: string;
  attachmentName?: string;
  updatedAt: string;
}

export interface ProjectStore {
  listTemplates(): Promise<StoredTemplate[]>;
  saveTemplate(template: Omit<StoredTemplate, 'createdAt' | 'updatedAt'> & Partial<Pick<StoredTemplate, 'createdAt' | 'updatedAt'>>): Promise<StoredTemplate>;
  deleteTemplate(templateId: string): Promise<void>;
  createTemplateVersion(templateId: string, content: string): Promise<StoredTemplate | null>;
  restoreTemplateVersion(templateId: string, versionId: string): Promise<StoredTemplate | null>;

  saveProject(snapshot: StoredProjectSnapshot): Promise<void>;
  loadProject(projectId: string): Promise<StoredProjectSnapshot | null>;
  listProjects(): Promise<StoredProjectSnapshot[]>;
}

const TEMPLATE_KEY = 'email-drafter.templates.v1';
const PROJECT_KEY = 'email-drafter.projects.v1';

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class LocalProjectStore implements ProjectStore {
  async listTemplates(): Promise<StoredTemplate[]> {
    const templates = safeParse<StoredTemplate[]>(window.localStorage.getItem(TEMPLATE_KEY), []);
    return templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveTemplate(template: Omit<StoredTemplate, 'createdAt' | 'updatedAt'> & Partial<Pick<StoredTemplate, 'createdAt' | 'updatedAt'>>): Promise<StoredTemplate> {
    const templates = await this.listTemplates();
    const now = new Date().toISOString();
    const existing = templates.find(t => t.id === template.id);

    const persisted: StoredTemplate = {
      ...template,
      createdAt: existing?.createdAt || template.createdAt || now,
      updatedAt: now,
      versions: template.versions || existing?.versions || [],
    };

    const next = templates.filter(t => t.id !== persisted.id);
    next.push(persisted);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    return persisted;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const templates = await this.listTemplates();
    const next = templates.filter(template => template.id !== templateId);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  }

  async createTemplateVersion(templateId: string, content: string): Promise<StoredTemplate | null> {
    const templates = await this.listTemplates();
    const match = templates.find(template => template.id === templateId);
    if (!match) return null;

    const version: StoredTemplateVersion = {
      id: `ver-${Date.now()}`,
      createdAt: new Date().toISOString(),
      content,
    };

    const nextTemplate: StoredTemplate = {
      ...match,
      versions: [version, ...match.versions].slice(0, 25),
      updatedAt: new Date().toISOString(),
    };

    const next = templates.filter(template => template.id !== templateId);
    next.push(nextTemplate);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    return nextTemplate;
  }

  async restoreTemplateVersion(templateId: string, versionId: string): Promise<StoredTemplate | null> {
    const templates = await this.listTemplates();
    const match = templates.find(template => template.id === templateId);
    if (!match) return null;
    const version = match.versions.find(item => item.id === versionId);
    if (!version) return null;

    const nextTemplate: StoredTemplate = {
      ...match,
      content: version.content,
      updatedAt: new Date().toISOString(),
    };

    const next = templates.filter(template => template.id !== templateId);
    next.push(nextTemplate);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    return nextTemplate;
  }

  async saveProject(snapshot: StoredProjectSnapshot): Promise<void> {
    const projects = await this.listProjects();
    const next = projects.filter(project => project.id !== snapshot.id);
    next.push({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
  }

  async loadProject(projectId: string): Promise<StoredProjectSnapshot | null> {
    const projects = await this.listProjects();
    return projects.find(project => project.id === projectId) || null;
  }

  async listProjects(): Promise<StoredProjectSnapshot[]> {
    const projects = safeParse<StoredProjectSnapshot[]>(window.localStorage.getItem(PROJECT_KEY), []);
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export const projectStore: ProjectStore = new LocalProjectStore();
