import type { Contact } from "../App";

export interface GeneratedCompany {
  id: string;
  name: string;
  website: string;
  reasoning: string;
  estimatedSize?: string;
  industry?: string;
  suggestedContactTitles?: string[];
  relevanceScore?: number;
  addedAt: string;
  searchQuery: string;
}

export interface CampaignRun {
  id: string;
  timestamp: string;
  templateId: string | null;
  attachmentName: string | null;
  contactCount: number;
  successCount: number;
  failCount: number;
}

export type CampaignKind = "outreach" | "follow_up" | "announcement";

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
  companies: GeneratedCompany[];
  contacts: Contact[];
  templateId: string | null;
  attachmentColumnName?: string | null;
  /**
   * Campaign kind controls which flow gates apply:
   * - outreach (default): cold-email flow with AI discovery + subject-line guards
   * - follow_up: known contacts, no AI discovery, softer validation, schedule-first
   * - announcement: one-off to a known list (thank-yous, updates); same gates as follow_up
   * Missing or undefined is treated as "outreach" by `getCampaignKind()`.
   */
  kind?: CampaignKind;
  runs: CampaignRun[];
}

/**
 * Normalize a Campaign's kind. Treats missing/unknown values as "outreach" so
 * pre-kind campaigns keep behaving the same way.
 */
export function getCampaignKind(c: Pick<Campaign, "kind"> | null | undefined): CampaignKind {
  const k = c?.kind;
  if (k === "follow_up" || k === "announcement") return k;
  return "outreach";
}

const CAMPAIGN_KEY = "email-drafter.campaigns.v1";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

class LocalCampaignStore {
  private load(): Campaign[] {
    return safeParse<Campaign[]>(window.localStorage.getItem(CAMPAIGN_KEY), []);
  }

  private save(campaigns: Campaign[]): void {
    window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaigns));
  }

  listCampaigns(): Campaign[] {
    return this.load().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getCampaign(id: string): Campaign | null {
    return this.load().find((c) => c.id === id) || null;
  }

  saveCampaign(campaign: Campaign): Campaign {
    const campaigns = this.load();
    const next = campaigns.filter((c) => c.id !== campaign.id);
    next.push({ ...campaign, updatedAt: new Date().toISOString() });
    this.save(next);
    return campaign;
  }

  deleteCampaign(id: string): void {
    const campaigns = this.load();
    this.save(campaigns.filter((c) => c.id !== id));
  }

  addCompanies(id: string, companies: GeneratedCompany[]): Campaign | null {
    const campaign = this.getCampaign(id);
    if (!campaign) return null;
    const existingNames = new Set(campaign.companies.map((c) => c.name.toLowerCase()));
    const newCompanies = companies.filter((c) => !existingNames.has(c.name.toLowerCase()));
    campaign.companies = [...campaign.companies, ...newCompanies];
    campaign.updatedAt = new Date().toISOString();
    return this.saveCampaign(campaign);
  }

  setContacts(id: string, contacts: Contact[]): Campaign | null {
    const campaign = this.getCampaign(id);
    if (!campaign) return null;
    campaign.contacts = contacts;
    campaign.updatedAt = new Date().toISOString();
    return this.saveCampaign(campaign);
  }

  setTemplateId(id: string, templateId: string): Campaign | null {
    const campaign = this.getCampaign(id);
    if (!campaign) return null;
    campaign.templateId = templateId;
    campaign.updatedAt = new Date().toISOString();
    return this.saveCampaign(campaign);
  }

  addRun(id: string, run: CampaignRun): Campaign | null {
    const campaign = this.getCampaign(id);
    if (!campaign) return null;
    campaign.runs = [run, ...campaign.runs];
    campaign.updatedAt = new Date().toISOString();
    return this.saveCampaign(campaign);
  }

  updateCampaign(
    id: string,
    partial: Partial<Pick<Campaign, "name" | "description" | "status">>,
  ): Campaign | null {
    const campaign = this.getCampaign(id);
    if (!campaign) return null;
    Object.assign(campaign, partial);
    campaign.updatedAt = new Date().toISOString();
    return this.saveCampaign(campaign);
  }
}

export const campaignStore = new LocalCampaignStore();
