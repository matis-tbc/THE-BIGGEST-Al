import {
  type CompanyResult,
  persistCompanies,
  readSearchCache,
  writeSearchCache,
} from "./repository/companies";

interface CompanySearchResponse {
  companies: CompanyResult[];
  cached?: boolean;
}

interface SearchFilters {
  industry?: string;
  size?: string;
  location?: string;
  excludeNames?: string[];
  campaignDescription?: string;
  refinement?: string;
}

export class CompanyGeneratorService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";
    if (!this.apiKey) {
      console.warn("ANTHROPIC_API_KEY is not set in the environment variables.");
    }
  }

  async search(query: string, filters?: SearchFilters): Promise<CompanySearchResponse> {
    if (!this.apiKey) {
      throw new Error(
        "Anthropic API key is missing. Please add ANTHROPIC_API_KEY to your .env file.",
      );
    }

    const excludeNames = filters?.excludeNames ?? [];
    const cacheInput = { query, filters };
    const cached = readSearchCache(cacheInput, excludeNames);
    if (cached) {
      return { companies: cached, cached: true };
    }

    let filterText = "";
    if (filters) {
      const parts: string[] = [];
      if (filters.industry) parts.push(`Industry: ${filters.industry}`);
      if (filters.size) parts.push(`Company size: ${filters.size}`);
      if (filters.location) parts.push(`Location: ${filters.location}`);
      if (parts.length > 0) {
        filterText = `\n\nAdditional filters:\n${parts.join("\n")}`;
      }
    }

    let excludeText = "";
    if (filters?.excludeNames && filters.excludeNames.length > 0) {
      excludeText = `\n\nDo NOT include these companies (already found): ${filters.excludeNames.join(", ")}`;
    }

    let campaignContext = "";
    if (filters?.campaignDescription) {
      campaignContext = `\n\nCampaign context: ${filters.campaignDescription}`;
    }

    let refinementText = "";
    if (filters?.refinement) {
      refinementText = `\n\nUser refinement instruction: ${filters.refinement}`;
    }

    const prompt = `You are a business research assistant for CU Hyperloop, an engineering student team at the University of Colorado Boulder that designs and builds hyperloop pods for competition. The team seeks corporate sponsors and partners who can provide products, services, discounts, or monetary sponsorship.

Search query: "${query}"${filterText}${campaignContext}${excludeText}${refinementText}

Find 10-15 real companies that match this query. Consider both:
- Companies that sell relevant products/services the team could use
- Companies that might sponsor an engineering student team (brand visibility, recruitment pipeline, engineering alignment)

For each company, provide:
1. name: The real company name
2. website: Their website URL
3. reasoning: Brief explanation of why they match
4. estimatedSize: Approximate employee count range (e.g. "50-200 employees", "1000+ employees")
5. industry: Primary industry category
6. suggestedContactTitles: Array of 2-3 job titles to target for outreach (e.g. ["VP of Sponsorships", "Marketing Director"])
7. relevanceScore: 1-5 rating of how relevant this company is to the query (5 = perfect match)

Respond ONLY with a JSON object in this exact format, no other text:
{"companies": [{"name": "Company Name", "website": "https://example.com", "reasoning": "Brief explanation", "estimatedSize": "100-500 employees", "industry": "Manufacturing", "suggestedContactTitles": ["VP Marketing", "Sponsorship Manager"], "relevanceScore": 4}]}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as any;
      throw new Error(
        `Anthropic API Error: ${response.status} - ${errorData?.error?.message || response.statusText}`,
      );
    }

    const data = (await response.json()) as any;
    const text = data.content?.[0]?.text || "";

    const finalize = (parsed: CompanySearchResponse): CompanySearchResponse => {
      try {
        writeSearchCache(cacheInput, parsed.companies);
        persistCompanies(parsed.companies);
      } catch (err) {
        console.warn("company cache/persist failed:", err);
      }
      return parsed;
    };

    try {
      const parsed = JSON.parse(text) as CompanySearchResponse;
      if (!parsed.companies || !Array.isArray(parsed.companies)) {
        throw new Error("Invalid response format");
      }
      return finalize(parsed);
    } catch {
      // Try to extract JSON from the response text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as CompanySearchResponse;
        if (parsed.companies && Array.isArray(parsed.companies)) {
          return finalize(parsed);
        }
      }
      throw new Error("Failed to parse company search results from AI response.");
    }
  }
}
