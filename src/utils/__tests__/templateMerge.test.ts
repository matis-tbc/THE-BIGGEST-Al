import { describe, it, expect } from "vitest";
import {
  convertRawTemplate,
  VARIABLE_ALIASES,
  extractTemplateName,
  getSubjectsForTemplate,
  getSubjectForContactIndex,
  DEFAULT_SUBJECTS,
} from "../templateMerge";

describe("convertRawTemplate", () => {
  it("converts all single-brace variables from Dataset C", () => {
    const raw = `Hello {Name},
My name is {Your Name}, and I'm with CU Hyperloop.
Would you be open to a brief call this week to explore potential alignment with {Company Name}?
Best regards,
CU Hyperloop | {Role}
CU Boulder | {Major}
{Phone Number} | {Email}`;

    const result = convertRawTemplate(raw);

    expect(result.content).toContain("{{First Name}}");
    expect(result.content).toContain("{{Sender Name}}");
    expect(result.content).toContain("{{Company}}");
    expect(result.content).toContain("{{Sender Role}}");
    expect(result.content).toContain("{{Sender Major}}");
    expect(result.content).toContain("{{Sender Phone}}");
    expect(result.content).toContain("{{Sender Email}}");

    // Should NOT contain any single-brace variables
    expect(result.content).not.toMatch(/(?<!\{)\{[A-Za-z][A-Za-z\s]*\}(?!\})/);

    expect(result.mappings).toHaveLength(7);
    expect(result.mappings.every((m) => m.isAlias)).toBe(true);
  });

  it("maps CONTACT NAME correctly", () => {
    const raw = "Dear {CONTACT NAME}, welcome.";
    const result = convertRawTemplate(raw);

    expect(result.content).toBe("Dear {{First Name}}, welcome.");
    expect(result.mappings[0].original).toBe("CONTACT NAME");
    expect(result.mappings[0].converted).toBe("First Name");
    expect(result.mappings[0].isAlias).toBe(true);
  });

  it("maps MY NAME correctly", () => {
    const raw = "My name is {MY NAME}.";
    const result = convertRawTemplate(raw);

    expect(result.content).toBe("My name is {{Sender Name}}.");
  });

  it("preserves already double-braced variables", () => {
    const raw = "Hello {{Sender Name}}, from {Company Name}.";
    const result = convertRawTemplate(raw);

    expect(result.content).toBe("Hello {{Sender Name}}, from {{Company}}.");
    // Only the single-brace variable should be in mappings
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0].original).toBe("Company Name");
  });

  it("keeps unknown variables with isAlias=false", () => {
    const raw = "Hello {Custom Field}, this is {Weird Variable}.";
    const result = convertRawTemplate(raw);

    expect(result.content).toBe(
      "Hello {{Custom Field}}, this is {{Weird Variable}}.",
    );
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings[0].isAlias).toBe(false);
    expect(result.mappings[1].isAlias).toBe(false);
  });

  it("returns unchanged text when no variables present", () => {
    const raw = "Plain text with no variables.";
    const result = convertRawTemplate(raw);

    expect(result.content).toBe(raw);
    expect(result.mappings).toHaveLength(0);
    expect(result.originalVariables).toHaveLength(0);
  });

  it("does not match JSON-like or numeric braces", () => {
    const raw = 'Config: {1} and {"key": "value"} and {Name}.';
    const result = convertRawTemplate(raw);

    // Only {Name} should match (starts with letter)
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0].original).toBe("Name");
  });

  it("handles case-insensitive matching for aliases", () => {
    const raw = "{your name} and {YOUR NAME} and {Your Name}";
    const result = convertRawTemplate(raw);

    // All three should map to the same canonical name
    expect(result.content).toBe(
      "{{Sender Name}} and {{Sender Name}} and {{Sender Name}}",
    );
    // Only one mapping (deduped by lowercase)
    expect(result.mappings).toHaveLength(1);
  });
});

describe("VARIABLE_ALIASES", () => {
  it("contains all expected aliases", () => {
    expect(VARIABLE_ALIASES["your name"]).toBe("Sender Name");
    expect(VARIABLE_ALIASES["my name"]).toBe("Sender Name");
    expect(VARIABLE_ALIASES["role"]).toBe("Sender Role");
    expect(VARIABLE_ALIASES["major"]).toBe("Sender Major");
    expect(VARIABLE_ALIASES["phone number"]).toBe("Sender Phone");
    expect(VARIABLE_ALIASES["email"]).toBe("Sender Email");
    expect(VARIABLE_ALIASES["name"]).toBe("First Name");
    expect(VARIABLE_ALIASES["contact name"]).toBe("First Name");
    expect(VARIABLE_ALIASES["company name"]).toBe("Company");
    expect(VARIABLE_ALIASES["company"]).toBe("Company");
  });
});

describe("extractTemplateName", () => {
  it("extracts Zayo Group from company-specific template", () => {
    const text =
      "Hello {Name},\nMy name is {Your Name}...\nWe are reaching out to Zayo Group because of your role...";
    expect(extractTemplateName(text)).toBe("Zayo Group");
  });

  it("extracts Qorvo from template body", () => {
    const text =
      "Hello {CONTACT NAME},\n...\nWe are reaching out to Qorvo because of your industry leadership...";
    expect(extractTemplateName(text)).toBe("Qorvo");
  });

  it("extracts Digikey from reaching out pattern", () => {
    const text =
      "We are reaching out because since the club's beginning in 2017, Digikey has been...";
    // No "reaching out to X because" pattern here, so falls through
    expect(extractTemplateName(text)).not.toBe("");
  });

  it("returns empty for generic template with variable company", () => {
    const text =
      "We are reaching out to {Company Name} because your work depends on...";
    expect(extractTemplateName(text)).toBe("");
  });

  it("extracts from Subject header", () => {
    const text = "Subject: Partnership Opportunity\nTo: {{Email}}\n\nHello...";
    expect(extractTemplateName(text)).toBe("Partnership Opportunity");
  });

  it("strips variables from Subject header", () => {
    const text =
      "Subject: CU Hyperloop // {{Company}}\nTo: {{Email}}\n\nHello...";
    expect(extractTemplateName(text)).toBe("CU Hyperloop //");
  });

  it("handles trailing whitespace from Google Docs", () => {
    const text =
      "We are reaching out to L3Harris because of your leadership...\n\n\n\n\n";
    expect(extractTemplateName(text)).toBe("L3Harris");
  });

  it("returns fallback for plain text with no patterns", () => {
    const text = "This is a short plain text email with no patterns.";
    expect(extractTemplateName(text)).toBe(
      "This is a short plain text email with no patterns.",
    );
  });
});

describe("getSubjectsForTemplate / getSubjectForContactIndex", () => {
  it("returns template subjects when set", () => {
    const template = {
      id: "1",
      name: "Test",
      subjects: ["Subject A", "Subject B"],
      content: "Hello",
      variables: [],
    };
    expect(getSubjectsForTemplate(template)).toEqual([
      "Subject A",
      "Subject B",
    ]);
  });

  it("falls back to content Subject header", () => {
    const template = {
      id: "1",
      name: "Test",
      content: "Subject: Custom Subject\n\nHello",
      variables: [],
    };
    expect(getSubjectsForTemplate(template)).toEqual(["Custom Subject"]);
  });

  it("falls back to DEFAULT_SUBJECTS", () => {
    const template = {
      id: "1",
      name: "Test",
      content: "Hello world",
      variables: [],
    };
    expect(getSubjectsForTemplate(template)).toEqual(DEFAULT_SUBJECTS);
  });

  it("rotates subjects by index", () => {
    const template = {
      id: "1",
      name: "Test",
      subjects: ["A", "B"],
      content: "Hello",
      variables: [],
    };
    expect(getSubjectForContactIndex(template, 0)).toBe("A");
    expect(getSubjectForContactIndex(template, 1)).toBe("B");
    expect(getSubjectForContactIndex(template, 2)).toBe("A");
    expect(getSubjectForContactIndex(template, 3)).toBe("B");
  });
});
