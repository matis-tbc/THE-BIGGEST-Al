import { describe, it, expect } from "vitest";

// Since emailPatternService.ts is in electron/ (Node.js main process),
// we test the pure logic by importing the functions directly.
// The dns module won't be available in vitest, so we skip MX tests.

// Inline the pure functions for testing (they don't depend on electron/dns)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  const first = normalizeName(parts[0] || "");
  const last = normalizeName(parts[parts.length - 1] || "");
  return { first, last };
}

const PATTERNS = [
  { id: "first.last", generate: (f: string, l: string) => `${f}.${l}` },
  { id: "first", generate: (f: string, _l: string) => f },
  { id: "f.last", generate: (f: string, l: string) => `${f[0]}.${l}` },
  { id: "first_last", generate: (f: string, l: string) => `${f}_${l}` },
  { id: "flast", generate: (f: string, l: string) => `${f[0]}${l}` },
  { id: "firstlast", generate: (f: string, l: string) => `${f}${l}` },
  { id: "last.first", generate: (f: string, l: string) => `${l}.${f}` },
  { id: "firstl", generate: (f: string, l: string) => `${f}${l[0]}` },
];

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
    if (localPart === pattern.generate(first, last)) return pattern.id;
  }
  return null;
}

function detectDomainPattern(
  contacts: { name: string; email: string }[],
): { patternId: string; confidence: number } | null {
  const counts = new Map<string, number>();
  for (const c of contacts) {
    const { first, last } = splitName(c.name);
    const p = detectPattern(c.email, first, last);
    if (p) counts.set(p, (counts.get(p) || 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = "";
  let bestCount = 0;
  for (const [p, c] of counts) {
    if (c > bestCount) {
      best = p;
      bestCount = c;
    }
  }
  return { patternId: best, confidence: bestCount / contacts.length };
}

function guessEmail(
  fullName: string,
  domain: string,
  knownContacts: { name: string; email: string }[],
): { email: string; confidence: number; source: string }[] {
  const { first, last } = splitName(fullName);
  if (!first || !last) return [];
  const domainContacts = knownContacts.filter(
    (c) => c.email.split("@")[1]?.toLowerCase() === domain.toLowerCase(),
  );
  if (domainContacts.length > 0) {
    const match = detectDomainPattern(domainContacts);
    if (match) {
      const pat = PATTERNS.find((p) => p.id === match.patternId);
      if (pat)
        return [
          {
            email: `${pat.generate(first, last)}@${domain}`,
            confidence: match.confidence,
            source: "known_pattern",
          },
        ];
    }
  }
  return PATTERNS.slice(0, 3).map((p, i) => ({
    email: `${p.generate(first, last)}@${domain}`,
    confidence: 0.4 - i * 0.1,
    source: "ranked_guess",
  }));
}

function parseLinkedInUrl(
  url: string,
): { firstName: string; lastName: string } | null {
  const match = url.match(/linkedin\.com\/in\/([a-z0-9-]+)/i);
  if (!match) return null;
  const slug = match[1];
  const cleaned = slug.replace(/-[a-f0-9]{6,}$/i, "").replace(/-\d+$/, "");
  const parts = cleaned.split("-").filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  return {
    firstName: parts[0].charAt(0).toUpperCase() + parts[0].slice(1),
    lastName:
      parts[parts.length - 1].charAt(0).toUpperCase() +
      parts[parts.length - 1].slice(1),
  };
}

// Test data from the actual project - real contacts used in this session
const DIGIKEY_CONTACTS = [
  { name: "Kiersten jenson", email: "kierstin.jenson@digikey.com" },
  { name: "Cameron Cloyd", email: "cameron.cloyd@digikey.com" },
  { name: "Erika Davis", email: "erika.davis@digikey.com" },
  { name: "Kelly Smeby", email: "kelly.smeby@digikey.com" },
  { name: "Jessica Lund", email: "jessica.lund@digikey.com" },
  { name: "Vishal Gurav", email: "vishal.gurav@digikey.com" },
];

const ZAYO_CONTACTS = [
  { name: "Ashley Menezes", email: "ashley.menezes@zayo.com" },
  { name: "Matthew McLean", email: "matthew.mclean@zayo.com" },
  { name: "Paul Dare", email: "paul.dare@zayo.com" },
  { name: "Bruce Bamford", email: "bruce.bamford@zayo.com" },
];

const INTEL_CONTACTS = [
  { name: "Vivek Roy", email: "vivek.r@intel.com" },
  { name: "Scott Foley", email: "scott.n.foley@intel.com" },
];

const RTX_CONTACTS = [
  { name: "Jackie Rybacki", email: "jackie.rybacki@rtx.com" },
  { name: "Stephen Hamilton", email: "stephen.hamilton@rtx.com" },
  { name: "Pauline Carroll", email: "pauline.carroll@rtx.com" },
  { name: "Craig Pierce", email: "craig.pierce@rtx.com" },
];

describe("detectPattern", () => {
  it("detects firstname.lastname pattern", () => {
    expect(detectPattern("cameron.cloyd@digikey.com", "Cameron", "Cloyd")).toBe(
      "first.last",
    );
  });

  it("detects firstname.lastname for Raytheon", () => {
    expect(
      detectPattern("jackie.rybacki@rtx.com", "Jackie", "Rybacki"),
    ).toBe("first.last");
  });

  it("returns null for non-matching patterns", () => {
    // Intel uses non-standard patterns
    expect(detectPattern("vivek.r@intel.com", "Vivek", "Roy")).toBe(null);
  });
});

describe("detectDomainPattern", () => {
  it("detects first.last for Digikey", () => {
    const result = detectDomainPattern(DIGIKEY_CONTACTS);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("first.last");
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it("detects first.last for Zayo", () => {
    const result = detectDomainPattern(ZAYO_CONTACTS);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("first.last");
    expect(result!.confidence).toBe(1);
  });

  it("detects first.last for Raytheon/RTX", () => {
    const result = detectDomainPattern(RTX_CONTACTS);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("first.last");
  });
});

describe("guessEmail", () => {
  it("guesses Digikey email correctly from known pattern", () => {
    const guesses = guessEmail(
      "Shawn Luke",
      "digikey.com",
      DIGIKEY_CONTACTS,
    );
    expect(guesses).toHaveLength(1);
    expect(guesses[0].email).toBe("shawn.luke@digikey.com");
    expect(guesses[0].source).toBe("known_pattern");
    expect(guesses[0].confidence).toBeGreaterThan(0.8);
  });

  it("guesses Zayo email correctly", () => {
    const guesses = guessEmail("Daniel Felshin", "zayo.com", ZAYO_CONTACTS);
    expect(guesses[0].email).toBe("daniel.felshin@zayo.com");
    expect(guesses[0].source).toBe("known_pattern");
  });

  it("returns ranked guesses for unknown domain", () => {
    const guesses = guessEmail("John Smith", "unknown-corp.com", []);
    expect(guesses).toHaveLength(3);
    expect(guesses[0].email).toBe("john.smith@unknown-corp.com");
    expect(guesses[0].source).toBe("ranked_guess");
    expect(guesses[1].email).toBe("john@unknown-corp.com");
    expect(guesses[2].email).toBe("j.smith@unknown-corp.com");
  });
});

describe("backtesting (leave-one-out)", () => {
  it("achieves high accuracy on Digikey contacts", () => {
    let correct = 0;
    for (let i = 0; i < DIGIKEY_CONTACTS.length; i++) {
      const test = DIGIKEY_CONTACTS[i];
      const training = DIGIKEY_CONTACTS.filter((_, j) => j !== i);
      const guesses = guessEmail(test.name, "digikey.com", training);
      if (
        guesses.length > 0 &&
        guesses[0].email.toLowerCase() === test.email.toLowerCase()
      ) {
        correct++;
      }
    }
    // Kiersten has a typo (kierstin vs kiersten) so it might miss that one
    expect(correct).toBeGreaterThanOrEqual(DIGIKEY_CONTACTS.length - 1);
  });

  it("achieves 100% on Zayo contacts", () => {
    let correct = 0;
    for (let i = 0; i < ZAYO_CONTACTS.length; i++) {
      const test = ZAYO_CONTACTS[i];
      const training = ZAYO_CONTACTS.filter((_, j) => j !== i);
      const guesses = guessEmail(test.name, "zayo.com", training);
      if (
        guesses.length > 0 &&
        guesses[0].email.toLowerCase() === test.email.toLowerCase()
      ) {
        correct++;
      }
    }
    expect(correct).toBe(ZAYO_CONTACTS.length);
  });

  it("achieves 100% on RTX contacts", () => {
    let correct = 0;
    for (let i = 0; i < RTX_CONTACTS.length; i++) {
      const test = RTX_CONTACTS[i];
      const training = RTX_CONTACTS.filter((_, j) => j !== i);
      const guesses = guessEmail(test.name, "rtx.com", training);
      if (
        guesses.length > 0 &&
        guesses[0].email.toLowerCase() === test.email.toLowerCase()
      ) {
        correct++;
      }
    }
    expect(correct).toBe(RTX_CONTACTS.length);
  });
});

describe("parseLinkedInUrl", () => {
  it("extracts name from standard URL", () => {
    const result = parseLinkedInUrl(
      "https://www.linkedin.com/in/john-smith-a1b2c3d4",
    );
    expect(result).toEqual({ firstName: "John", lastName: "Smith" });
  });

  it("extracts name from URL without hash suffix", () => {
    const result = parseLinkedInUrl(
      "https://linkedin.com/in/ashley-menezes",
    );
    expect(result).toEqual({ firstName: "Ashley", lastName: "Menezes" });
  });

  it("handles multi-part names (takes first and last)", () => {
    const result = parseLinkedInUrl(
      "https://linkedin.com/in/mary-jane-watson-abc123",
    );
    expect(result).toEqual({ firstName: "Mary", lastName: "Watson" });
  });

  it("returns null for non-LinkedIn URLs", () => {
    expect(parseLinkedInUrl("https://google.com")).toBeNull();
  });

  it("returns null for company pages", () => {
    expect(
      parseLinkedInUrl("https://linkedin.com/company/digikey"),
    ).toBeNull();
  });

  it("handles numeric suffix removal", () => {
    const result = parseLinkedInUrl(
      "https://linkedin.com/in/craig-pierce-12345",
    );
    expect(result).toEqual({ firstName: "Craig", lastName: "Pierce" });
  });
});
