export interface StoredTemplateVersion {
  id: string;
  createdAt: string;
  content: string;
}

export interface StoredTemplate {
  id: string;
  name: string;
  subjects?: string[];
  content: string;
  variables: string[];
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  versions: StoredTemplateVersion[];
  /** How many dispatched runs successfully used this template. */
  useCount?: number;
  /** ISO timestamp of the last successful dispatch that used this template. */
  lastUsedAt?: string;
}

export interface StoredProjectSnapshot {
  id: string;
  name: string;
  contacts: Array<Record<string, string | null | undefined>>;
  templateId?: string;
  attachmentName?: string;
  updatedAt: string;
}

export interface ProjectStore {
  listTemplates(): Promise<StoredTemplate[]>;
  saveTemplate(
    template: Omit<StoredTemplate, "createdAt" | "updatedAt"> &
      Partial<Pick<StoredTemplate, "createdAt" | "updatedAt">>,
  ): Promise<StoredTemplate>;
  deleteTemplate(templateId: string): Promise<void>;
  createTemplateVersion(templateId: string, content: string): Promise<StoredTemplate | null>;
  restoreTemplateVersion(templateId: string, versionId: string): Promise<StoredTemplate | null>;
  recordTemplateUse(templateId: string): Promise<void>;

  saveProject(snapshot: StoredProjectSnapshot): Promise<void>;
  loadProject(projectId: string): Promise<StoredProjectSnapshot | null>;
  listProjects(): Promise<StoredProjectSnapshot[]>;
}

const TEMPLATE_KEY = "email-drafter.templates.v1";
const PROJECT_KEY = "email-drafter.projects.v1";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

import { defaultTemplates } from "../utils/defaultTemplates";
import { SPONSOR_THANK_YOU_TEMPLATES } from "../utils/sponsorThankYouTemplates";
import { extractVariables } from "../utils/templateMerge";

// Bump this suffix whenever the sponsor-template contents change. On next
// load, the seed step drops any templates with a matching sponsor-2026-*
// ID and re-writes them with the latest canonical content.
const SPONSOR_SEED_FLAG = "email-drafter.sponsor-thank-you-seeded.v6";

// Rebuild the `variables` array from the template content so it always
// matches the canonical forms used in the body. Stored arrays drifted over
// time (legacy "CONTACT NAME", "MY NAME" strings that didn't match new
// {{First Name}}, {{Sender Name}}). This normalization is idempotent.
function normalizeTemplateVariables<T extends { content: string; variables?: string[] }>(
  template: T,
): T & { variables: string[] } {
  return { ...template, variables: extractVariables(template.content) };
}

export class LocalProjectStore implements ProjectStore {
  async listTemplates(): Promise<StoredTemplate[]> {
    let templates = safeParse<StoredTemplate[]>(window.localStorage.getItem(TEMPLATE_KEY), []);

    // Auto-seed on first launch. The first-run notice flag is only written on
    // this branch (NOT on subsequent reads) so Template Manager can show a
    // one-time banner explaining where these templates came from.
    if (!window.localStorage.getItem("seeded_v11")) {
      templates = defaultTemplates as StoredTemplate[];
      window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
      window.localStorage.setItem("seeded_v11", "true");
      window.localStorage.setItem("email-drafter.show-first-run-notice", "pending");
    }

    // Actively filter out the duplicates that have "Monetary Outreach -" prefix
    templates = templates.filter((t) => !t.name.startsWith("Monetary Outreach -"));

    // Seed for the 2025-2026 sponsor thank-you templates. Runs once per
    // version of the seed flag — so bumping SPONSOR_SEED_FLAG to a new
    // suffix re-runs this block and picks up template-content changes.
    //
    // Strategy:
    //   1. Drop any existing templates with a sponsor-2026-* ID (those are
    //      ours, so safe to replace with the latest canonical content).
    //   2. Leave user-created templates alone, even if the name matches.
    //   3. Append the 4 canonical sponsor templates.
    if (!window.localStorage.getItem(SPONSOR_SEED_FLAG)) {
      const cleaned = templates.filter((t) => !t.id?.startsWith("sponsor-2026-"));
      templates = [...cleaned, ...SPONSOR_THANK_YOU_TEMPLATES];
      window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
      window.localStorage.setItem(SPONSOR_SEED_FLAG, "true");
    }

    // Normalize variables so UI surfaces (chip picker, validation) reflect
    // what the template actually references.
    templates = templates.map((t) => normalizeTemplateVariables(t));

    return templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveTemplate(
    template: Omit<StoredTemplate, "createdAt" | "updatedAt"> &
      Partial<Pick<StoredTemplate, "createdAt" | "updatedAt">>,
  ): Promise<StoredTemplate> {
    const templates = await this.listTemplates();
    const now = new Date().toISOString();
    const existing = templates.find((t) => t.id === template.id);

    const persisted: StoredTemplate = normalizeTemplateVariables({
      ...template,
      createdAt: existing?.createdAt || template.createdAt || now,
      updatedAt: now,
      versions: template.versions || existing?.versions || [],
    });

    const next = templates.filter((t) => t.id !== persisted.id);
    next.push(persisted);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    return persisted;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const templates = await this.listTemplates();
    const next = templates.filter((template) => template.id !== templateId);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  }

  async createTemplateVersion(templateId: string, content: string): Promise<StoredTemplate | null> {
    const templates = await this.listTemplates();
    const match = templates.find((template) => template.id === templateId);
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

    const next = templates.filter((template) => template.id !== templateId);
    next.push(nextTemplate);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    return nextTemplate;
  }

  async recordTemplateUse(templateId: string): Promise<void> {
    if (!templateId) return;
    const templates = await this.listTemplates();
    const match = templates.find((t) => t.id === templateId);
    if (!match) return;
    const next: StoredTemplate = {
      ...match,
      useCount: (match.useCount ?? 0) + 1,
      lastUsedAt: new Date().toISOString(),
    };
    const rest = templates.filter((t) => t.id !== templateId);
    rest.push(next);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(rest));
  }

  async restoreTemplateVersion(
    templateId: string,
    versionId: string,
  ): Promise<StoredTemplate | null> {
    const templates = await this.listTemplates();
    const match = templates.find((template) => template.id === templateId);
    if (!match) return null;
    const version = match.versions.find((item) => item.id === versionId);
    if (!version) return null;

    const nextTemplate: StoredTemplate = {
      ...match,
      content: version.content,
      updatedAt: new Date().toISOString(),
    };

    const next = templates.filter((template) => template.id !== templateId);
    next.push(nextTemplate);
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    return nextTemplate;
  }

  async saveProject(snapshot: StoredProjectSnapshot): Promise<void> {
    const projects = await this.listProjects();
    const next = projects.filter((project) => project.id !== snapshot.id);
    next.push({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
  }

  async loadProject(projectId: string): Promise<StoredProjectSnapshot | null> {
    const projects = await this.listProjects();
    return projects.find((project) => project.id === projectId) || null;
  }

  async listProjects(): Promise<StoredProjectSnapshot[]> {
    const projects = safeParse<StoredProjectSnapshot[]>(
      window.localStorage.getItem(PROJECT_KEY),
      [],
    );
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export const projectStore: ProjectStore = new LocalProjectStore();
