import { detectDomainPattern } from "../utils/emailPatterns";

export interface DomainPattern {
  domain: string;
  patternId: string;
  patternLabel: string;
  confidence: number;
  knownCount: number;
  lastUpdated: string;
}

export interface DomainInfo {
  companyName: string;
  domain: string;
  mxValid: boolean | null;
  lastChecked: string;
}

interface PatternStore {
  patterns: DomainPattern[];
  domains: DomainInfo[];
}

const STORAGE_KEY = "email-drafter.patterns.v1";

function load(): PatternStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data, reset
  }
  return { patterns: [], domains: [] };
}

function save(store: PatternStore): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getPattern(domain: string): DomainPattern | null {
  const store = load();
  return (
    store.patterns.find(
      (p) => p.domain.toLowerCase() === domain.toLowerCase(),
    ) || null
  );
}

export function savePattern(domain: string, pattern: DomainPattern): void {
  const store = load();
  const idx = store.patterns.findIndex(
    (p) => p.domain.toLowerCase() === domain.toLowerCase(),
  );
  if (idx >= 0) {
    store.patterns[idx] = pattern;
  } else {
    store.patterns.push(pattern);
  }
  save(store);
}

export function listPatterns(): DomainPattern[] {
  return load().patterns.sort((a, b) => b.knownCount - a.knownCount);
}

export function getDomain(companyName: string): DomainInfo | null {
  const store = load();
  const lower = companyName.toLowerCase().trim();
  return (
    store.domains.find((d) => d.companyName.toLowerCase() === lower) || null
  );
}

export function saveDomain(info: DomainInfo): void {
  const store = load();
  const lower = info.companyName.toLowerCase().trim();
  const idx = store.domains.findIndex(
    (d) => d.companyName.toLowerCase() === lower,
  );
  if (idx >= 0) {
    store.domains[idx] = info;
  } else {
    store.domains.push(info);
  }
  save(store);
}

export function listDomains(): DomainInfo[] {
  return load().domains.sort((a, b) =>
    a.companyName.localeCompare(b.companyName),
  );
}

// Bulk analyze contacts and update stored patterns.
// Called after every import to accumulate knowledge.
export function learnFromContacts(
  contacts: { name: string; email: string }[],
): { updated: number; newDomains: number } {
  // Group by domain
  const byDomain = new Map<string, { name: string; email: string }[]>();
  for (const c of contacts) {
    const domain = c.email.split("@")[1]?.toLowerCase();
    if (!domain) continue;
    const list = byDomain.get(domain);
    if (list) list.push(c);
    else byDomain.set(domain, [c]);
  }

  let updated = 0;
  let newDomains = 0;

  for (const [domain, domainContacts] of byDomain) {
    if (domainContacts.length < 1) continue;

    const match = detectDomainPattern(domainContacts);
    if (!match) continue;

    const existing = getPattern(domain);

    // Only update if we have more data or higher confidence
    if (
      !existing ||
      domainContacts.length > existing.knownCount ||
      match.confidence > existing.confidence
    ) {
      savePattern(domain, {
        domain,
        patternId: match.patternId,
        patternLabel: match.patternLabel,
        confidence: match.confidence,
        knownCount: domainContacts.length,
        lastUpdated: new Date().toISOString(),
      });
      updated++;
      if (!existing) newDomains++;
    }

    // Also learn company-domain mapping from contact data
    // Extract company name if available in the contact objects
    const sampleContact = domainContacts[0] as Record<string, any>;
    const companyName =
      sampleContact.Company || sampleContact.company || null;
    if (companyName && typeof companyName === "string") {
      const existingDomain = getDomain(companyName);
      if (!existingDomain) {
        saveDomain({
          companyName,
          domain,
          mxValid: null,
          lastChecked: new Date().toISOString(),
        });
      }
    }
  }

  return { updated, newDomains };
}

// Get known contacts for a domain from pattern store
// (for use as training data when the original contacts aren't loaded)
export function getKnownContactsForDomain(
  domain: string,
): { name: string; email: string }[] | null {
  // The pattern store doesn't store individual contacts (privacy),
  // just the detected pattern. For guessing, the pattern is sufficient.
  return null;
}
