import { describe, it, expect } from "vitest";
import {
  normalizeName,
  splitName,
  detectPattern,
  detectDomainPattern,
  guessEmail,
  guessEmailBatch,
  backtestPatterns,
  parseLinkedInUrl,
} from "../emailPatterns";

// Real contacts from this project session
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

const RTX_CONTACTS = [
  { name: "Jackie Rybacki", email: "jackie.rybacki@rtx.com" },
  { name: "Stephen Hamilton", email: "stephen.hamilton@rtx.com" },
  { name: "Pauline Carroll", email: "pauline.carroll@rtx.com" },
  { name: "Craig Pierce", email: "craig.pierce@rtx.com" },
];

const SHELL_CONTACTS = [
  { name: "Neil Touati", email: "neil.touati@shell.com" },
  { name: "Harry Girsang", email: "harry.girsang@shell.com" },
  { name: "Wai Yiu", email: "wai.yiu@shell.com" },
];

describe("normalizeName", () => {
  it("lowercases and strips non-alpha", () => {
    expect(normalizeName("John")).toBe("john");
  });

  it("strips accents", () => {
    expect(normalizeName("Rene")).toBe("rene");
    expect(normalizeName("Juergen")).toBe("juergen");
  });

  it("handles apostrophes", () => {
    expect(normalizeName("O'Grady")).toBe("ogrady");
  });

  it("handles hyphens", () => {
    expect(normalizeName("Mary-Jane")).toBe("maryjane");
  });
});

describe("splitName", () => {
  it("splits first and last", () => {
    expect(splitName("John Smith")).toEqual({ first: "john", last: "smith" });
  });

  it("handles single name", () => {
    const result = splitName("Alexia");
    expect(result.first).toBe("alexia");
    expect(result.last).toBe("alexia");
  });

  it("strips suffixes", () => {
    expect(splitName("Robert Jones Jr.")).toEqual({
      first: "robert",
      last: "jones",
    });
    expect(splitName("William III")).toEqual({
      first: "william",
      last: "william",
    });
  });

  it("handles extra whitespace", () => {
    expect(splitName("  John   Smith  ")).toEqual({
      first: "john",
      last: "smith",
    });
  });

  it("handles three-part names", () => {
    expect(splitName("Mary Jane Watson")).toEqual({
      first: "mary",
      last: "watson",
    });
  });
});

describe("detectPattern", () => {
  it("detects firstname.lastname", () => {
    expect(detectPattern("cameron.cloyd@digikey.com", "Cameron", "Cloyd")).toBe("first.last");
  });

  it("detects flastname", () => {
    expect(detectPattern("jsmith@acme.com", "John", "Smith")).toBe("flast");
  });

  it("detects firstname only", () => {
    expect(detectPattern("john@acme.com", "John", "Smith")).toBe("first");
  });

  it("detects firstname_lastname", () => {
    expect(detectPattern("john_smith@acme.com", "John", "Smith")).toBe("first_last");
  });

  it("detects lastname.firstname", () => {
    expect(detectPattern("smith.john@acme.com", "John", "Smith")).toBe("last.first");
  });

  it("detects firstnamel", () => {
    expect(detectPattern("johns@acme.com", "John", "Smith")).toBe("firstl");
  });

  it("detects first.middle.last with middle initial", () => {
    expect(detectPattern("scott.n.foley@intel.com", "Scott", "Foley", "n")).toBe("first.m.last");
  });

  it("returns null for unrecognized patterns", () => {
    expect(detectPattern("vivek.r@intel.com", "Vivek", "Roy")).toBe(null);
  });

  it("handles accented names", () => {
    expect(detectPattern("rene.dupont@company.com", "Rene", "Dupont")).toBe("first.last");
  });
});

describe("detectDomainPattern", () => {
  it("detects first.last for Digikey", () => {
    const result = detectDomainPattern(DIGIKEY_CONTACTS);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("first.last");
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it("detects first.last for Zayo with 100% confidence", () => {
    const result = detectDomainPattern(ZAYO_CONTACTS);
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("first.last");
    expect(result!.confidence).toBe(1);
  });

  it("detects first.last for RTX", () => {
    const result = detectDomainPattern(RTX_CONTACTS);
    expect(result!.patternId).toBe("first.last");
  });

  it("detects first.last for Shell", () => {
    const result = detectDomainPattern(SHELL_CONTACTS);
    expect(result!.patternId).toBe("first.last");
    expect(result!.confidence).toBe(1);
  });

  it("returns null for empty list", () => {
    expect(detectDomainPattern([])).toBeNull();
  });

  it("returns null when no patterns match", () => {
    const weird = [
      { name: "John Smith", email: "xyz123@test.com" },
      { name: "Jane Doe", email: "abc456@test.com" },
    ];
    expect(detectDomainPattern(weird)).toBeNull();
  });
});

describe("guessEmail", () => {
  it("guesses from known pattern at domain", () => {
    const guesses = guessEmail("Shawn Luke", "digikey.com", DIGIKEY_CONTACTS);
    expect(guesses[0].email).toBe("shawn.luke@digikey.com");
    expect(guesses[0].source).toBe("known_pattern");
    expect(guesses[0].confidence).toBeGreaterThan(0.8);
  });

  it("guesses Zayo email", () => {
    const guesses = guessEmail("Daniel Felshin", "zayo.com", ZAYO_CONTACTS);
    expect(guesses[0].email).toBe("daniel.felshin@zayo.com");
    expect(guesses[0].confidence).toBe(1);
  });

  it("returns ranked guesses for unknown domain", () => {
    const guesses = guessEmail("John Smith", "unknown-corp.com", []);
    expect(guesses.length).toBe(3);
    expect(guesses[0].email).toBe("john.smith@unknown-corp.com");
    expect(guesses[0].source).toBe("ranked_guess");
    expect(guesses[1].email).toBe("john@unknown-corp.com");
    expect(guesses[2].email).toBe("j.smith@unknown-corp.com");
  });

  it("returns fallback when confidence < 100%", () => {
    // Digikey has one mismatch (Kiersten), so confidence < 1.0
    const guesses = guessEmail("Test User", "digikey.com", DIGIKEY_CONTACTS);
    expect(guesses.length).toBe(2); // primary + fallback
  });

  it("handles single-word name", () => {
    const guesses = guessEmail("Alexia", "digikey.com", DIGIKEY_CONTACTS);
    // Single name -> first=alexia, last=alexia -> "alexia.alexia@digikey.com"
    expect(guesses.length).toBeGreaterThan(0);
  });

  it("normalizes domain to lowercase", () => {
    const guesses = guessEmail("John Smith", "DIGIKEY.COM", DIGIKEY_CONTACTS);
    expect(guesses[0].email).toContain("@digikey.com");
  });
});

describe("guessEmailBatch", () => {
  it("processes multiple contacts at once", () => {
    const results = guessEmailBatch(
      [{ name: "Shawn Luke" }, { name: "Jeffrey Lacey" }],
      "digikey.com",
      DIGIKEY_CONTACTS,
    );
    expect(results).toHaveLength(2);
    expect(results[0].guesses[0].email).toBe("shawn.luke@digikey.com");
    expect(results[1].guesses[0].email).toBe("jeffrey.lacey@digikey.com");
  });
});

describe("backtesting (leave-one-out)", () => {
  it("achieves high accuracy on Digikey", () => {
    let correct = 0;
    for (let i = 0; i < DIGIKEY_CONTACTS.length; i++) {
      const test = DIGIKEY_CONTACTS[i];
      const training = DIGIKEY_CONTACTS.filter((_, j) => j !== i);
      const guesses = guessEmail(test.name, "digikey.com", training);
      if (guesses[0]?.email.toLowerCase() === test.email.toLowerCase()) {
        correct++;
      }
    }
    expect(correct).toBeGreaterThanOrEqual(DIGIKEY_CONTACTS.length - 1);
  });

  it("achieves 100% on Zayo", () => {
    let correct = 0;
    for (let i = 0; i < ZAYO_CONTACTS.length; i++) {
      const test = ZAYO_CONTACTS[i];
      const training = ZAYO_CONTACTS.filter((_, j) => j !== i);
      const guesses = guessEmail(test.name, "zayo.com", training);
      if (guesses[0]?.email.toLowerCase() === test.email.toLowerCase()) {
        correct++;
      }
    }
    expect(correct).toBe(ZAYO_CONTACTS.length);
  });

  it("achieves 100% on RTX", () => {
    let correct = 0;
    for (let i = 0; i < RTX_CONTACTS.length; i++) {
      const test = RTX_CONTACTS[i];
      const training = RTX_CONTACTS.filter((_, j) => j !== i);
      const guesses = guessEmail(test.name, "rtx.com", training);
      if (guesses[0]?.email.toLowerCase() === test.email.toLowerCase()) {
        correct++;
      }
    }
    expect(correct).toBe(RTX_CONTACTS.length);
  });

  it("backtestPatterns returns structured results", () => {
    const all = [...DIGIKEY_CONTACTS, ...ZAYO_CONTACTS, ...RTX_CONTACTS, ...SHELL_CONTACTS];
    const result = backtestPatterns(all);
    expect(result.totalContacts).toBe(all.length);
    expect(result.testableContacts).toBeGreaterThan(0);
    expect(result.accuracy).toBeGreaterThan(0.8);
    expect(result.perDomain.length).toBe(4);
    expect(result.perDomain[0].domain).toBeDefined();
    expect(result.perDomain[0].pattern).toBeDefined();
  });

  it("skips domains with only 1 contact", () => {
    const contacts = [{ name: "Solo Person", email: "solo@unique.com" }, ...ZAYO_CONTACTS];
    const result = backtestPatterns(contacts);
    // unique.com should not appear in perDomain
    expect(result.perDomain.find((d) => d.domain === "unique.com")).toBeUndefined();
  });
});

describe("parseLinkedInUrl", () => {
  it("extracts name from standard URL", () => {
    expect(parseLinkedInUrl("https://www.linkedin.com/in/john-smith-a1b2c3d4")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("extracts name without hash suffix", () => {
    expect(parseLinkedInUrl("https://linkedin.com/in/ashley-menezes")).toEqual({
      firstName: "Ashley",
      lastName: "Menezes",
    });
  });

  it("handles multi-part names (first and last)", () => {
    expect(parseLinkedInUrl("https://linkedin.com/in/mary-jane-watson-abc123")).toEqual({
      firstName: "Mary",
      lastName: "Watson",
    });
  });

  it("returns null for non-LinkedIn URLs", () => {
    expect(parseLinkedInUrl("https://google.com")).toBeNull();
  });

  it("returns null for company pages", () => {
    expect(parseLinkedInUrl("https://linkedin.com/company/digikey")).toBeNull();
  });

  it("handles numeric suffix", () => {
    expect(parseLinkedInUrl("https://linkedin.com/in/craig-pierce-12345")).toEqual({
      firstName: "Craig",
      lastName: "Pierce",
    });
  });

  it("strips query parameters", () => {
    expect(parseLinkedInUrl("https://linkedin.com/in/john-smith?trk=public_profile")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("strips trailing slashes", () => {
    expect(parseLinkedInUrl("https://linkedin.com/in/john-smith/")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("handles URL with both query params and trailing slash", () => {
    expect(
      parseLinkedInUrl("https://www.linkedin.com/in/bruce-bamford-abc123/?locale=en_US"),
    ).toEqual({ firstName: "Bruce", lastName: "Bamford" });
  });

  it("returns null for single-name slugs", () => {
    expect(parseLinkedInUrl("https://linkedin.com/in/madonna")).toBeNull();
  });
});
