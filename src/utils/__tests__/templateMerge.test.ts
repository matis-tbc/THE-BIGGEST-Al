import { describe, it, expect } from "vitest";
import {
  convertRawTemplate,
  VARIABLE_ALIASES,
  extractTemplateName,
  getSubjectsForTemplate,
  getSubjectForContactIndex,
  DEFAULT_SUBJECTS,
  SIGNATURE_TEMPLATE,
  hasSignaturePresent,
  mergeTemplate,
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

    expect(result.content).toBe("Hello {{Custom Field}}, this is {{Weird Variable}}.");
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
    expect(result.content).toBe("{{Sender Name}} and {{Sender Name}} and {{Sender Name}}");
    // Only one mapping (deduped by lowercase)
    expect(result.mappings).toHaveLength(1);
  });
});

describe("VARIABLE_ALIASES", () => {
  it("contains sender/signature aliases", () => {
    expect(VARIABLE_ALIASES["your name"]).toBe("Sender Name");
    expect(VARIABLE_ALIASES["my name"]).toBe("Sender Name");
    expect(VARIABLE_ALIASES.role).toBe("Sender Role");
    expect(VARIABLE_ALIASES.major).toBe("Sender Major");
    expect(VARIABLE_ALIASES["phone number"]).toBe("Sender Phone");
    expect(VARIABLE_ALIASES.signature).toBe("Signature");
  });

  it("contains contact aliases with canonical targets", () => {
    // {Email} at paste time = sender email (signature-block convention).
    // Use {Recipient Email} explicitly for the contact's address.
    expect(VARIABLE_ALIASES.email).toBe("Sender Email");
    expect(VARIABLE_ALIASES["recipient email"]).toBe("Email");
    // {Name} defaults to first-name semantics for greetings. Use {Full Name}
    // when you explicitly want the full contact.name field.
    expect(VARIABLE_ALIASES.name).toBe("First Name");
    expect(VARIABLE_ALIASES["full name"]).toBe("Name");
    expect(VARIABLE_ALIASES["first name"]).toBe("First Name");
    expect(VARIABLE_ALIASES["contact first name"]).toBe("First Name");
    expect(VARIABLE_ALIASES["last name"]).toBe("Last Name");
    expect(VARIABLE_ALIASES["company name"]).toBe("Company");
    expect(VARIABLE_ALIASES.company).toBe("Company");
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
    const text = "We are reaching out to {Company Name} because your work depends on...";
    expect(extractTemplateName(text)).toBe("");
  });

  it("extracts from Subject header", () => {
    const text = "Subject: Partnership Opportunity\nTo: {{Email}}\n\nHello...";
    expect(extractTemplateName(text)).toBe("Partnership Opportunity");
  });

  it("strips variables from Subject header", () => {
    const text = "Subject: CU Hyperloop // {{Company}}\nTo: {{Email}}\n\nHello...";
    expect(extractTemplateName(text)).toBe("CU Hyperloop //");
  });

  it("handles trailing whitespace from Google Docs", () => {
    const text = "We are reaching out to L3Harris because of your leadership...\n\n\n\n\n";
    expect(extractTemplateName(text)).toBe("L3Harris");
  });

  it("returns fallback for plain text with no patterns", () => {
    const text = "This is a short plain text email with no patterns.";
    expect(extractTemplateName(text)).toBe("This is a short plain text email with no patterns.");
  });
});

describe("canonical variable resolution", () => {
  const sampleContact = {
    id: "c1",
    name: "Brady Darby",
    email: "brady@mach.com",
    first_name: "Brady",
    company: "Mach",
    "Sender Name": "Owen",
    "Sender Role": "President",
    "Sender Phone": "303-555-0100",
    "Sender Email": "owen@colorado.edu",
  };

  it("resolves {{first_name}} from a first_name CSV column", () => {
    expect(mergeTemplate("Hi {{first_name}}", sampleContact)).toBe("Hi Brady");
  });

  it("resolves {{First Name}} from the same first_name field", () => {
    expect(mergeTemplate("Hi {{First Name}}", sampleContact)).toBe("Hi Brady");
  });

  it("resolves {{FirstName}} (no space)", () => {
    expect(mergeTemplate("Hi {{FirstName}}", sampleContact)).toBe("Hi Brady");
  });

  it("resolves {{Name}} to the full contact name", () => {
    expect(mergeTemplate("Hi {{Name}}", sampleContact)).toBe("Hi Brady Darby");
  });

  it("resolves {{Email}} to the contact email", () => {
    expect(mergeTemplate("Reply to {{Email}}", sampleContact)).toBe("Reply to brady@mach.com");
  });

  it("resolves {{Company}} and {{Company Name}} identically", () => {
    expect(mergeTemplate("{{Company}}", sampleContact)).toBe("Mach");
    expect(mergeTemplate("{{Company Name}}", sampleContact)).toBe("Mach");
    expect(mergeTemplate("{{company_name}}", sampleContact)).toBe("Mach");
    expect(mergeTemplate("{{company}}", sampleContact)).toBe("Mach");
  });

  it("derives first name from contact.name when no first_name column", () => {
    const noFirstName = { id: "c2", name: "Jane Doe", email: "j@x.com" };
    expect(mergeTemplate("{{First Name}}", noFirstName)).toBe("Jane");
    expect(mergeTemplate("{{first_name}}", noFirstName)).toBe("Jane");
  });

  it("derives last name from contact.name when no last_name column", () => {
    expect(mergeTemplate("{{Last Name}}", sampleContact)).toBe("Darby");
    expect(mergeTemplate("{{last_name}}", sampleContact)).toBe("Darby");
  });

  it("resolves sender fields via snake_case or spaced form", () => {
    expect(mergeTemplate("{{sender_name}}", sampleContact)).toBe("Owen");
    expect(mergeTemplate("{{Sender Name}}", sampleContact)).toBe("Owen");
    expect(mergeTemplate("{{sender_role}}", sampleContact)).toBe("President");
  });

  it("paste converter handles {first_name} → {{First Name}}", () => {
    const result = convertRawTemplate("Hi {first_name},");
    expect(result.content).toBe("Hi {{First Name}},");
    expect(result.mappings[0].isAlias).toBe(true);
  });

  it("paste converter handles {company_name} and {sender_email}", () => {
    const result = convertRawTemplate("{company_name} / {sender_email}");
    expect(result.content).toBe("{{Company}} / {{Sender Email}}");
    expect(result.mappings.every((m) => m.isAlias)).toBe(true);
  });

  it("tolerates singular / plural typos (Companies, Emails)", () => {
    expect(mergeTemplate("{{Companies}}", sampleContact)).toBe("Mach");
    expect(mergeTemplate("{{Emails}}", sampleContact)).toBe("brady@mach.com");
  });
});

describe("{{Signature}} expansion", () => {
  const sampleContact = {
    id: "c1",
    name: "Brady",
    email: "brady@mach.com",
    "Sender Name": "Owen",
    "Sender Role": "President",
    "Sender Phone": "303-555-0100",
    "Sender Email": "owen@colorado.edu",
  };

  it("expands {{Signature}} to the composed block with per-contact sender fields", () => {
    const template = "{{Signature}}";
    const merged = mergeTemplate(template, sampleContact);
    expect(merged).toContain("Owen");
    expect(merged).toContain("CU Hyperloop | President");
    expect(merged).toContain("303-555-0100 | owen@colorado.edu");
    expect(merged).not.toContain("{{Signature}}");
  });

  it("leaves sender subfields empty when contact lacks them", () => {
    const bareContact = {
      id: "c2",
      name: "Jane",
      email: "jane@x.com",
    };
    const merged = mergeTemplate("{{Signature}}", bareContact);
    // Block structure still present, but the per-field values are empty
    expect(merged).not.toContain("{{Signature}}");
    expect(merged).toContain("Best,");
    expect(merged).toContain("CU Hyperloop | ");
    expect(merged).toContain("CU Boulder | ");
  });

  it("handles case-insensitive {{signature}} and {{ Signature }}", () => {
    const merged = mergeTemplate("{{signature}}", sampleContact);
    expect(merged).toContain("Owen");
    const merged2 = mergeTemplate("{{ Signature }}", sampleContact);
    expect(merged2).toContain("Owen");
  });

  it("SIGNATURE_TEMPLATE matches the declared format", () => {
    expect(SIGNATURE_TEMPLATE).toContain("Best,");
    expect(SIGNATURE_TEMPLATE).toContain("{{Sender Name}}");
    expect(SIGNATURE_TEMPLATE).toContain("CU Hyperloop | {{Sender Role}}");
    expect(SIGNATURE_TEMPLATE).toContain("CU Boulder | {{Sender Major}}");
    expect(SIGNATURE_TEMPLATE).toContain("{{Sender Phone}} | {{Sender Email}}");
  });
});

describe("hasSignaturePresent", () => {
  it("detects {{Signature}} variable", () => {
    expect(hasSignaturePresent("Best,\n{{Signature}}")).toBe(true);
    expect(hasSignaturePresent("hi {{ signature }} bye")).toBe(true);
  });

  it("detects {{Sender Name}}", () => {
    expect(hasSignaturePresent("Best,\n{{Sender Name}}\nRole, CU Hyperloop")).toBe(true);
  });

  it("detects {{Sender Role}} / Phone / Email / Major", () => {
    expect(hasSignaturePresent("{{Sender Role}}")).toBe(true);
    expect(hasSignaturePresent("{{Sender Phone}}")).toBe(true);
    expect(hasSignaturePresent("{{Sender Email}}")).toBe(true);
    expect(hasSignaturePresent("{{Sender Major}}")).toBe(true);
  });

  it("returns false when no signature markers present", () => {
    expect(hasSignaturePresent("Hi {{First Name}}, hope you're well.")).toBe(false);
    expect(hasSignaturePresent("Plain text with no variables.")).toBe(false);
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
    expect(getSubjectsForTemplate(template)).toEqual(["Subject A", "Subject B"]);
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
