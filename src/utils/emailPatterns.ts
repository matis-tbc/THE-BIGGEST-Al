// Pure email pattern logic - no Node.js dependencies.
// Imported by both Electron main process and React renderer/tests.

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

export { PATTERNS };

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

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (e.g., Rene -> rene)
    .replace(/[^a-z]/g, ""); // only letters
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName
    .trim()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v|esq\.?)$/i, "") // strip suffixes
    .split(/\s+/)
    .filter((p) => p.length > 0);

  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) {
    const normalized = normalizeName(parts[0]);
    return { first: normalized, last: normalized };
  }

  const first = normalizeName(parts[0]);
  // For hyphenated last names, normalize removes the hyphen (marysmith),
  // but keep the last token as-is for pattern matching
  const last = normalizeName(parts[parts.length - 1]);
  return { first, last };
}

// Extract middle initial if present (for patterns like scott.n.foley@intel.com)
function getMiddleInitial(fullName: string): string {
  const parts = fullName
    .trim()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v|esq\.?)$/i, "")
    .split(/\s+/);
  if (parts.length >= 3) {
    return normalizeName(parts[1])[0] || "";
  }
  return "";
}

export function detectPattern(
  email: string,
  firstName: string,
  lastName: string,
  middleInitial?: string,
): string | null {
  const localPart = email.split("@")[0].toLowerCase();
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);

  if (!first || !last) return null;

  // Check standard patterns first
  for (const pattern of PATTERNS) {
    const expected = pattern.generate(first, last);
    if (localPart === expected) return pattern.id;
  }

  // Check middle initial variants (first.m.last, firstmlast, etc.)
  const mid = middleInitial
    ? normalizeName(middleInitial)[0] || ""
    : "";
  if (mid) {
    if (localPart === `${first}.${mid}.${last}`) return "first.m.last";
    if (localPart === `${first}${mid}${last}`) return "firstmlast";
    if (localPart === `${first[0]}${mid}${last}`) return "fmlast";
  }

  return null;
}

export function detectDomainPattern(
  contacts: { name: string; email: string }[],
): PatternMatch | null {
  const patternCounts = new Map<string, number>();

  for (const contact of contacts) {
    const { first, last } = splitName(contact.name);
    const mid = getMiddleInitial(contact.name);
    const pattern = detectPattern(contact.email, first, last, mid);
    if (pattern) {
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }
  }

  if (patternCounts.size === 0) return null;

  let bestPattern = "";
  let bestCount = 0;
  for (const [pattern, count] of patternCounts) {
    if (count > bestCount) {
      bestPattern = pattern;
      bestCount = count;
    }
  }

  const patternDef = PATTERNS.find((p) => p.id === bestPattern);
  const label = patternDef?.label || bestPattern;

  return {
    patternId: bestPattern,
    patternLabel: label,
    confidence: bestCount / contacts.length,
    matchCount: bestCount,
    totalKnown: contacts.length,
  };
}

export function guessEmail(
  fullName: string,
  domain: string,
  knownContacts: { name: string; email: string }[],
): EmailGuess[] {
  const { first, last } = splitName(fullName);
  if (!first || !last) return [];

  const lowerDomain = domain.toLowerCase();
  const domainContacts = knownContacts.filter(
    (c) => c.email.split("@")[1]?.toLowerCase() === lowerDomain,
  );

  if (domainContacts.length > 0) {
    const match = detectDomainPattern(domainContacts);
    if (match) {
      const patternDef = PATTERNS.find((p) => p.id === match.patternId);
      if (patternDef) {
        const primary: EmailGuess = {
          email: `${patternDef.generate(first, last)}@${lowerDomain}`,
          patternId: match.patternId,
          patternLabel: match.patternLabel,
          confidence: match.confidence,
          source: "known_pattern",
        };

        // If confidence < 100%, also return the next best guess as fallback
        if (match.confidence < 1.0) {
          const alt = PATTERNS.find(
            (p) => p.id !== match.patternId,
          );
          if (alt) {
            return [
              primary,
              {
                email: `${alt.generate(first, last)}@${lowerDomain}`,
                patternId: alt.id,
                patternLabel: alt.label,
                confidence: 0.2,
                source: "ranked_guess",
              },
            ];
          }
        }
        return [primary];
      }
    }
  }

  // No known contacts: return top 3 ranked guesses
  return PATTERNS.slice(0, 3).map((pattern, i) => ({
    email: `${pattern.generate(first, last)}@${lowerDomain}`,
    patternId: pattern.id,
    patternLabel: pattern.label,
    confidence: Math.max(0.1, 0.4 - i * 0.1),
    source: "ranked_guess" as const,
  }));
}

export function guessEmailBatch(
  contacts: { name: string; company?: string }[],
  domain: string,
  knownContacts: { name: string; email: string }[],
): { name: string; guesses: EmailGuess[] }[] {
  return contacts.map((c) => ({
    name: c.name,
    guesses: guessEmail(c.name, domain, knownContacts),
  }));
}

export function backtestPatterns(
  contacts: { name: string; email: string }[],
): BacktestResult {
  // Group by domain once
  const byDomain = new Map<string, { name: string; email: string }[]>();
  for (const contact of contacts) {
    const domain = contact.email.split("@")[1]?.toLowerCase();
    if (!domain) continue;
    const list = byDomain.get(domain);
    if (list) list.push(contact);
    else byDomain.set(domain, [contact]);
  }

  let totalTestable = 0;
  let totalCorrect = 0;
  const perDomain: BacktestResult["perDomain"] = [];

  for (const [domain, domainContacts] of byDomain) {
    if (domainContacts.length < 2) continue;

    let domainCorrect = 0;
    let domainTestable = 0;

    for (let i = 0; i < domainContacts.length; i++) {
      const testContact = domainContacts[i];
      // Build training set without copying the full array each time
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

export function parseLinkedInUrl(
  url: string,
): { firstName: string; lastName: string } | null {
  // Strip query params and trailing slashes before matching
  const cleanUrl = url.split("?")[0].replace(/\/+$/, "");
  const match = cleanUrl.match(/linkedin\.com\/in\/([a-z0-9-]+)/i);
  if (!match) return null;

  const slug = match[1];
  // Remove trailing hash/id suffixes
  const cleaned = slug
    .replace(/-[a-f0-9]{6,}$/i, "")
    .replace(/-\d{4,}$/, "")
    .replace(/-\d+$/, "");
  const parts = cleaned.split("-").filter((p) => p.length > 0);

  if (parts.length < 2) return null;

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    firstName: capitalize(parts[0]),
    lastName: capitalize(parts[parts.length - 1]),
  };
}
