import { describe, it, expect } from "vitest";
import { convertRawTemplate, VARIABLE_ALIASES } from "../templateMerge";

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
