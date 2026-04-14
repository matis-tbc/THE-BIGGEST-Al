import * as dns from "dns";

// Common corporate email patterns, ordered by prevalence
const PATTERNS = [
  {
    id: "first.last",
    label: "firstname.lastname",
    generate: (first: string, last: string) => `${first}.${last}`,
  },
  {
    id: "first",
    label: "firstname",
    generate: (first: string, _last: string) => first,
  },
  {
    id: "f.last",
    label: "f.lastname",
    generate: (first: string, last: string) => `${first[0]}.${last}`,
  },
  {
    id: "first_last",
    label: "firstname_lastname",
    generate: (first: string, last: string) => `${first}_${last}`,
  },
  {
    id: "flast",
    label: "flastname",
    generate: (first: string, last: string) => `${first[0]}${last}`,
  },
  {
    id: "firstlast",
    label: "firstnamelastname",
    generate: (first: string, last: string) => `${first}${last}`,
  },
  {
    id: "last.first",
    label: "lastname.firstname",
    generate: (first: string, last: string) => `${last}.${first}`,
  },
  {
    id: "firstl",
    label: "firstnamel",
    generate: (first: string, last: string) => `${first}${last[0]}`,
  },
];

export interface PatternMatch {
  patternId: string;
  patternLabel: string;
  confidence: number;
  matchCount: number;
  totalKnown: number;
}

export interface EmailGuess {
  email: string;
  patternId: string;
  patternLabel: string;
  confidence: number;
  source: "known_pattern" | "ranked_guess";
}

export interface MxResult {
  valid: boolean;
  domain: string;
  exchanges: string[];
  cached: boolean;
}

export interface BacktestResult {
  totalContacts: number;
  testableContacts: number;
  correctGuesses: number;
  accuracy: number;
  perDomain: {
    domain: string;
    pattern: string;
    contacts: number;
    accuracy: number;
  }[];
}

// Normalize a name for email pattern matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z]/g, ""); // only letters
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  const first = normalizeName(parts[0] || "");
  const last = normalizeName(parts[parts.length - 1] || "");
  return { first, last };
}

// Detect which pattern a known email uses
function detectPattern(
  email: string,
  firstName: string,
  lastName: string,
): string | null {
  const localPart = email.split("@")[0].toLowerCase();
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);

  if (!first || !last) return null;

  for (const pattern of PATTERNS) {
    const expected = pattern.generate(first, last);
    if (localPart === expected) return pattern.id;
  }

  return null;
}

// Detect the dominant pattern for a domain from known contacts
export function detectDomainPattern(
  contacts: { name: string; email: string }[],
): PatternMatch | null {
  const patternCounts = new Map<string, number>();

  for (const contact of contacts) {
    const { first, last } = splitName(contact.name);
    const pattern = detectPattern(contact.email, first, last);
    if (pattern) {
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }
  }

  if (patternCounts.size === 0) return null;

  // Find most common pattern
  let bestPattern = "";
  let bestCount = 0;
  for (const [pattern, count] of patternCounts) {
    if (count > bestCount) {
      bestPattern = pattern;
      bestCount = count;
    }
  }

  const patternDef = PATTERNS.find((p) => p.id === bestPattern);
  if (!patternDef) return null;

  return {
    patternId: bestPattern,
    patternLabel: patternDef.label,
    confidence: bestCount / contacts.length,
    matchCount: bestCount,
    totalKnown: contacts.length,
  };
}

// Generate email guesses for a name at a domain
export function guessEmail(
  fullName: string,
  domain: string,
  knownContacts: { name: string; email: string }[],
): EmailGuess[] {
  const { first, last } = splitName(fullName);
  if (!first || !last) return [];

  // Filter known contacts to this domain
  const domainContacts = knownContacts.filter(
    (c) => c.email.split("@")[1]?.toLowerCase() === domain.toLowerCase(),
  );

  // If we have known contacts, use the detected pattern
  if (domainContacts.length > 0) {
    const match = detectDomainPattern(domainContacts);
    if (match) {
      const patternDef = PATTERNS.find((p) => p.id === match.patternId);
      if (patternDef) {
        return [
          {
            email: `${patternDef.generate(first, last)}@${domain.toLowerCase()}`,
            patternId: match.patternId,
            patternLabel: match.patternLabel,
            confidence: match.confidence,
            source: "known_pattern",
          },
        ];
      }
    }
  }

  // No known contacts: return top 3 ranked guesses
  return PATTERNS.slice(0, 3).map((pattern, i) => ({
    email: `${pattern.generate(first, last)}@${domain.toLowerCase()}`,
    patternId: pattern.id,
    patternLabel: pattern.label,
    confidence: Math.max(0.1, 0.4 - i * 0.1), // 40%, 30%, 20%
    source: "ranked_guess" as const,
  }));
}

// Leave-one-out backtesting
export function backtestPatterns(
  contacts: { name: string; email: string }[],
): BacktestResult {
  // Group by domain
  const byDomain = new Map<string, { name: string; email: string }[]>();
  for (const contact of contacts) {
    const domain = contact.email.split("@")[1]?.toLowerCase();
    if (!domain) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(contact);
  }

  let totalTestable = 0;
  let totalCorrect = 0;
  const perDomain: BacktestResult["perDomain"] = [];

  for (const [domain, domainContacts] of byDomain) {
    if (domainContacts.length < 2) continue; // Need 2+ to test

    let domainCorrect = 0;
    let domainTestable = 0;

    for (let i = 0; i < domainContacts.length; i++) {
      const testContact = domainContacts[i];
      const trainingSet = domainContacts.filter((_, j) => j !== i);

      const guesses = guessEmail(testContact.name, domain, trainingSet);
      if (guesses.length > 0) {
        domainTestable++;
        totalTestable++;
        if (
          guesses[0].email.toLowerCase() === testContact.email.toLowerCase()
        ) {
          domainCorrect++;
          totalCorrect++;
        }
      }
    }

    const match = detectDomainPattern(domainContacts);
    perDomain.push({
      domain,
      pattern: match?.patternLabel || "unknown",
      contacts: domainContacts.length,
      accuracy: domainTestable > 0 ? domainCorrect / domainTestable : 0,
    });
  }

  perDomain.sort((a, b) => b.contacts - a.contacts);

  return {
    totalContacts: contacts.length,
    testableContacts: totalTestable,
    correctGuesses: totalCorrect,
    accuracy: totalTestable > 0 ? totalCorrect / totalTestable : 0,
    perDomain,
  };
}

// Parse LinkedIn URL to extract name
export function parseLinkedInUrl(
  url: string,
): { firstName: string; lastName: string } | null {
  const match = url.match(
    /linkedin\.com\/in\/([a-z0-9-]+)/i,
  );
  if (!match) return null;

  const slug = match[1];
  // Remove trailing hash/id suffix (e.g., "john-smith-a1b2c3" -> "john-smith")
  const cleaned = slug.replace(/-[a-f0-9]{6,}$/i, "").replace(/-\d+$/,"");
  const parts = cleaned.split("-").filter((p) => p.length > 0);

  if (parts.length < 2) return null;

  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const lastName =
    parts[parts.length - 1].charAt(0).toUpperCase() +
    parts[parts.length - 1].slice(1);

  return { firstName, lastName };
}

// MX record verification with caching
const mxCache = new Map<string, MxResult>();

export async function verifyMx(domain: string): Promise<MxResult> {
  const lowerDomain = domain.toLowerCase();

  if (mxCache.has(lowerDomain)) {
    return { ...mxCache.get(lowerDomain)!, cached: true };
  }

  try {
    const records = await dns.promises.resolveMx(lowerDomain);
    const result: MxResult = {
      valid: records.length > 0,
      domain: lowerDomain,
      exchanges: records.map((r) => r.exchange),
      cached: false,
    };
    mxCache.set(lowerDomain, result);
    return result;
  } catch {
    const result: MxResult = {
      valid: false,
      domain: lowerDomain,
      exchanges: [],
      cached: false,
    };
    mxCache.set(lowerDomain, result);
    return result;
  }
}
