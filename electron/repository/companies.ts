import { createHash, randomUUID } from "node:crypto";
import { getDb } from "../db";

export interface CompanyResult {
  name: string;
  website: string;
  reasoning: string;
  estimatedSize?: string;
  industry?: string;
  suggestedContactTitles?: string[];
  relevanceScore?: number;
}

export interface CachedSearchInput {
  query: string;
  filters?: {
    industry?: string;
    size?: string;
    location?: string;
    campaignDescription?: string;
    refinement?: string;
  };
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_USABLE_CACHE_HITS = 5;

export function hashSearchKey(input: CachedSearchInput): string {
  // excludeNames is intentionally NOT part of the key. We filter them out client-side
  // against cached results so repeated "find more" calls hit the same cache entry.
  const canonical = JSON.stringify({
    q: input.query.trim().toLowerCase(),
    f: {
      industry: input.filters?.industry?.trim().toLowerCase() || "",
      size: input.filters?.size?.trim().toLowerCase() || "",
      location: input.filters?.location?.trim().toLowerCase() || "",
      campaignDescription: input.filters?.campaignDescription?.trim().toLowerCase() || "",
      refinement: input.filters?.refinement?.trim().toLowerCase() || "",
    },
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function readSearchCache(
  input: CachedSearchInput,
  excludeNames: string[],
): CompanyResult[] | null {
  const db = getDb();
  const key = hashSearchKey(input);
  const row = db
    .prepare("SELECT response_json, created_at FROM company_searches WHERE query_hash = ?")
    .get(key) as { response_json: string; created_at: string } | undefined;
  if (!row) return null;
  const age = Date.now() - Date.parse(row.created_at);
  if (Number.isFinite(age) && age > CACHE_TTL_MS) return null;

  try {
    const cached = JSON.parse(row.response_json) as CompanyResult[];
    const excludeLower = new Set(excludeNames.map((n) => n.toLowerCase()));
    const filtered = cached.filter((c) => !excludeLower.has(c.name.toLowerCase()));
    return filtered.length >= MIN_USABLE_CACHE_HITS ? filtered : null;
  } catch {
    return null;
  }
}

export function writeSearchCache(input: CachedSearchInput, results: CompanyResult[]): void {
  const db = getDb();
  const key = hashSearchKey(input);
  db.prepare(`
    INSERT INTO company_searches (query_hash, query_json, response_json, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(query_hash) DO UPDATE SET
      response_json = excluded.response_json,
      created_at    = excluded.created_at
  `).run(key, JSON.stringify(input), JSON.stringify(results), new Date().toISOString());
}

export function persistCompanies(results: CompanyResult[], source = "llm"): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO companies (
      id, name, website, industry, estimated_size,
      reasoning, suggested_titles_json, relevance_score,
      first_seen_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO NOTHING
  `);
  const now = new Date().toISOString();
  const tx = db.transaction((rows: CompanyResult[]) => {
    for (const r of rows) {
      try {
        stmt.run(
          randomUUID(),
          r.name,
          r.website ?? null,
          r.industry ?? null,
          r.estimatedSize ?? null,
          r.reasoning ?? null,
          r.suggestedContactTitles ? JSON.stringify(r.suggestedContactTitles) : null,
          r.relevanceScore ?? null,
          now,
          source,
        );
      } catch {
        // Unique violation on LOWER(name) — already seen; skip.
      }
    }
  });
  tx(results);
}

export function listCompanies(limit = 200): CompanyResult[] {
  const rows = getDb()
    .prepare(`
      SELECT name, website, industry, estimated_size, reasoning,
             suggested_titles_json, relevance_score
      FROM companies
      ORDER BY first_seen_at DESC
      LIMIT ?
    `)
    .all(limit) as any[];
  return rows.map((r) => ({
    name: r.name,
    website: r.website || "",
    industry: r.industry || undefined,
    estimatedSize: r.estimated_size || undefined,
    reasoning: r.reasoning || "",
    suggestedContactTitles: r.suggested_titles_json ? JSON.parse(r.suggested_titles_json) : [],
    relevanceScore: r.relevance_score ?? undefined,
  }));
}
