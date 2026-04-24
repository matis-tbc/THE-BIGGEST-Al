export interface Contact {
  id: string;
  name: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined;
}

export interface Template {
  id: string;
  name: string;
  subjects?: string[];
  content: string;
  variables: string[];
}

// Canonical variable name mappings for template conversion.
// Maps lowercase raw variable names to their canonical {{double brace}} form.
// Used by convertRawTemplate when the user pastes a template with {single}
// variables. Underscores / hyphens are collapsed to spaces before lookup so
// {first_name} and {first-name} both route to "First Name".
export const VARIABLE_ALIASES: Record<string, string> = {
  // Sender fields (signature block)
  "your name": "Sender Name",
  "my name": "Sender Name",
  "sender name": "Sender Name",
  "sender role": "Sender Role",
  "sender phone": "Sender Phone",
  "sender email": "Sender Email",
  "sender major": "Sender Major",
  role: "Sender Role",
  major: "Sender Major",
  "phone number": "Sender Phone",
  phone: "Sender Phone",
  signature: "Signature",
  // Contact fields — {Name} in a greeting almost always means first-name, so
  // keep that as the convenience default. Use {Full Name} / {{Name}} when you
  // want the full field.
  name: "First Name",
  "contact name": "First Name",
  "first name": "First Name",
  "contact first name": "First Name",
  "full name": "Name",
  "last name": "Last Name",
  // {Email} at paste time defaults to Sender Email because that's where it
  // historically appeared (signature blocks). Use {Recipient Email} or write
  // {{Email}} / {{email}} directly if you want the contact's address.
  email: "Sender Email",
  "contact email": "Email",
  "recipient email": "Email",
  // Company
  "company name": "Company",
  company: "Company",
};

// Composed signature block. Expands at merge time into the individual sender
// fields so existing per-contact resolution keeps working. The structure
// here matches the pattern that `formatEmailBodyHtml` detects + wraps in the
// CU Hyperloop gold styling — keep the "Best," on its own line directly
// above the name (no blank line between) and the "CU Hyperloop | ..." /
// "CU Boulder | ..." lines EXACTLY in this shape or the styled rendering
// won't trigger.
export const SIGNATURE_TEMPLATE = [
  "Best,",
  "",
  "{{Sender Name}}",
  "CU Hyperloop | {{Sender Role}}",
  "CU Boulder | {{Sender Major}}",
  "{{Sender Phone}} | {{Sender Email}}",
].join("\n");

// True when a template body already embeds its own sign-off / signature.
// Used by the Paste Template flow to decide whether to offer auto-append.
export function hasSignaturePresent(content: string): boolean {
  if (/\{\{\s*Signature\s*\}\}/i.test(content)) return true;
  if (/\{\{\s*Sender\s+Name\s*\}\}/i.test(content)) return true;
  if (/\{\{\s*Sender\s+(Role|Phone|Email|Major)\s*\}\}/i.test(content)) return true;
  return false;
}

export interface VariableMapping {
  original: string;
  converted: string;
  isAlias: boolean;
}

export interface ConvertedTemplate {
  content: string;
  mappings: VariableMapping[];
  originalVariables: string[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function convertRawTemplate(rawText: string): ConvertedTemplate {
  const mappings: VariableMapping[] = [];
  const originalVariables: string[] = [];
  const seen = new Set<string>();

  // Match {single brace} variables but NOT {{double brace}} ones. Accept
  // underscores and hyphens inside the name so `{first_name}` and
  // `{first-name}` both match, not just `{first name}`.
  const singleBraceRegex = /(?<!\{)\{([A-Za-z][A-Za-z0-9\s_-]*)\}(?!\})/g;
  let match;

  while ((match = singleBraceRegex.exec(rawText)) !== null) {
    const original = match[1].trim();
    const lowerOriginal = original.toLowerCase();
    if (seen.has(lowerOriginal)) continue;
    seen.add(lowerOriginal);
    originalVariables.push(original);

    // Normalize underscores / hyphens / extra spaces to single spaces for
    // alias lookup. `first_name`, `first-name`, and `first   name` all route
    // to the same canonical target.
    const aliasKey = lowerOriginal.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    const canonical = VARIABLE_ALIASES[aliasKey];
    mappings.push({
      original,
      converted: canonical || original,
      isAlias: !!canonical,
    });
  }

  // Replace all {single brace} with {{canonical}} names
  let converted = rawText;
  for (const mapping of mappings) {
    const regex = new RegExp(`(?<!\\{)\\{\\s*${escapeRegex(mapping.original)}\\s*\\}(?!\\})`, "gi");
    converted = converted.replace(regex, `{{${mapping.converted}}}`);
  }

  return { content: converted, mappings, originalVariables };
}

export function extractTemplateName(content: string): string {
  // Try "reaching out to <CompanyName> because" pattern
  const reachingOut = content.match(
    /reaching out to ([A-Z0-9{][A-Za-z0-9\s&.,'{}-]+?)(?:\s+because)/i,
  );
  if (reachingOut) {
    const name = reachingOut[1].trim();
    // If it's a variable reference (single or double brace), this is a generic template
    if (/^\{/.test(name)) return "";
    return name;
  }
  // Try Subject header
  const subjectMatch = content.match(/^Subject:\s*(.+)$/im);
  if (subjectMatch) {
    const stripped = subjectMatch[1]
      .replace(/\{\{[^}]+\}\}/g, "")
      .replace(/\{[^}]+\}/g, "")
      .trim();
    if (stripped.length > 2) return stripped;
  }
  // Fallback: first meaningful line (skip "Hello", "Dear", etc.)
  const lines = content.trim().split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(hello|dear|hi|hey|subject:|to:)/i.test(trimmed)) continue;
    if (trimmed.length <= 50) return trimmed;
    return `${trimmed.slice(0, 40)}...`;
  }
  return "";
}

// Normalize a variable key for alias lookup: lowercase, strip underscores,
// collapse whitespace, and tolerate singular/plural typos (Companies →
// Company, Emails → Email, Names → Name). This normalization happens ONLY
// for the alias table — exact/case-insensitive contact-key lookup still runs
// first, so CSVs can define any custom field name without getting rewritten.
function normalizeKey(key: string): string {
  const base = key.toLowerCase().replace(/[_\s-]+/g, "");
  // Handle common English plurals: "ies" → "y" (companies → company),
  // then trailing "s" (emails → email).
  if (base.endsWith("ies") && base.length > 3) return `${base.slice(0, -3)}y`;
  if (base.endsWith("s") && base.length > 1) return base.slice(0, -1);
  return base;
}

// Single canonical map: normalized-lookup-key → (contact, fullName) => value.
// Each entry returns the resolved string for the variable or "" if not found.
type CanonicalResolver = (contact: Contact) => string;
const CANONICAL_RESOLVERS: Record<string, CanonicalResolver> = {
  // Full name — "Brady Darby"
  name: (c) => (c.name as string) || "",
  fullname: (c) => (c.name as string) || "",
  contactname: (c) => (c.name as string) || "",
  // First name — derive from first_name column if present, else split contact.name
  firstname: (c) => {
    if (typeof c.first_name === "string" && c.first_name.trim()) return c.first_name.trim();
    if (typeof c["First Name"] === "string" && (c["First Name"] as string).trim())
      return (c["First Name"] as string).trim();
    const full = (c.name as string) || "";
    return full.split(/\s+/)[0] || "";
  },
  contactfirstname: (c) => CANONICAL_RESOLVERS.firstname(c),
  // Smart multi-recipient greeting. Build-time CSV generation (see
  // build_emaildrafter_csv.py) computes this and writes it to the `greeting`
  // column. If the CSV is missing that column, fall back to first name.
  greeting: (c) => {
    if (typeof c.greeting === "string" && c.greeting.trim()) return c.greeting.trim();
    return CANONICAL_RESOLVERS.firstname(c);
  },
  // Last name — prefer last_name column, else split
  lastname: (c) => {
    if (typeof c.last_name === "string" && c.last_name.trim()) return c.last_name.trim();
    if (typeof c["Last Name"] === "string" && (c["Last Name"] as string).trim())
      return (c["Last Name"] as string).trim();
    const full = ((c.name as string) || "").trim();
    const parts = full.split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : "";
  },
  // Email
  email: (c) => (c.email as string) || "",
  contactemail: (c) => (c.email as string) || "",
  // Company
  company: (c) => {
    if (typeof c.Company === "string" && c.Company.trim()) return c.Company;
    if (typeof c.company === "string" && c.company.trim()) return c.company;
    return "";
  },
  companyname: (c) => CANONICAL_RESOLVERS.company(c),
  // Sender fields — direct lookup on the "Sender X" keys that ContactImport
  // populates from the MemberManager profile matched via the CSV Member column.
  sendername: (c) => (c["Sender Name"] as string) || "",
  senderrole: (c) => (c["Sender Role"] as string) || "",
  senderphone: (c) => (c["Sender Phone"] as string) || "",
  senderemail: (c) => (c["Sender Email"] as string) || "",
  sendermajor: (c) => (c["Sender Major"] as string) || "",
  // Legacy aliases kept for template compatibility
  yourname: (c) => CANONICAL_RESOLVERS.sendername(c),
  myname: (c) => CANONICAL_RESOLVERS.sendername(c),
  role: (c) => CANONICAL_RESOLVERS.senderrole(c),
  major: (c) => CANONICAL_RESOLVERS.sendermajor(c),
  phonenumber: (c) => CANONICAL_RESOLVERS.senderphone(c),
};

export function mergeTemplate(template: string, contact: Contact): string {
  // Pre-expand {{Signature}} into the composed sender-field block before the
  // per-variable substitution loop runs. This keeps signature formatting in
  // one place and lets per-contact sender fields flow through unchanged.
  let merged = template.replace(/\{\{\s*Signature\s*\}\}/gi, SIGNATURE_TEMPLATE);

  // Resolve a variable to its contact value. Resolution order:
  //   1. Exact direct key match (user-defined CSV columns win — most flexible).
  //   2. Case-insensitive exact match against contact keys.
  //   3. Canonical resolver via normalized lookup (handles first_name, Email,
  //      Company Name, etc. all routing to the same field).
  const getMappedValue = (key: string): string => {
    if (contact[key] !== undefined && contact[key] !== null && contact[key] !== "") {
      return contact[key] as string;
    }

    const foundKey = Object.keys(contact).find((k) => k.toLowerCase() === key.toLowerCase());
    if (foundKey && contact[foundKey] !== undefined && contact[foundKey] !== null) {
      const v = contact[foundKey];
      if (v !== "") return v as string;
    }

    const normalized = normalizeKey(key);
    const resolver = CANONICAL_RESOLVERS[normalized];
    if (resolver) return resolver(contact);

    return "";
  };

  // Replace all variables with contact data taking aliases into account.
  // Use the post-signature-expansion content so sender subfields inside the
  // expanded signature block are picked up and resolved.
  const templateVariables = extractVariables(merged);
  templateVariables.forEach((variable) => {
    const value = getMappedValue(variable);
    const regex = new RegExp(`\\{\\{${escapeRegex(variable)}\\}\\}`, "g");
    merged = merged.replace(regex, value);
  });

  return merged;
}

export function parseTemplateSections(template: string): {
  subject?: string;
  to?: string;
  body: string;
} {
  const normalized = template.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let subject: string | undefined;
  let to: string | undefined;
  let sawHeader = false;
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (sawHeader) {
        bodyStartIndex = i + 1;
        break;
      }
      continue;
    }

    const match = trimmed.match(/^(subject|to|recipients)\s*:\s*(.*)$/i);
    if (match) {
      sawHeader = true;
      const key = match[1].toLowerCase();
      if (key === "subject") {
        subject = match[2] || "";
      } else {
        to = match[2] || "";
      }
      continue;
    }

    if (sawHeader) {
      bodyStartIndex = i;
      break;
    }

    // First non-empty line isn't a header. Treat entire template as body.
    return { body: normalized.trimEnd() };
  }

  if (!sawHeader) {
    return { body: normalized.trimEnd() };
  }

  const body = lines.slice(bodyStartIndex).join("\n").trimStart();
  return { subject, to, body };
}

export function extractVariables(template: string): string[] {
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const variables = new Set<string>();
  let match;

  while ((match = variableRegex.exec(template)) !== null) {
    variables.add(match[1].trim());
  }

  return Array.from(variables);
}

export function validateTemplate(
  template: string,
  contacts: Contact[],
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract variables from template
  const templateVariables = extractVariables(template);

  // Get all available contact fields
  const availableFields = new Set<string>();
  contacts.forEach((contact) => {
    Object.keys(contact).forEach((key) => {
      if (key !== "id") {
        availableFields.add(key);
      }
    });
  });

  // Check for undefined variables. A variable is valid if any of:
  //   1. A case-insensitive matching field exists on contacts.
  //   2. It's the Signature block (resolves via sender fields).
  //   3. Its normalized form maps to a canonical resolver.
  templateVariables.forEach((variable) => {
    const lowerVar = variable.toLowerCase();

    const hasDirectField = Array.from(availableFields).some((f) => f.toLowerCase() === lowerVar);

    // {{Signature}} is always valid — it expands at merge time. Missing
    // sender fields just render empty (acceptable during editing). Preflight
    // surfaces Member-match failures separately via `unmatchedMembers`.
    const isSignature = lowerVar === "signature";

    const normalized = normalizeKey(variable);
    const hasCanonical = normalized in CANONICAL_RESOLVERS;

    if (!hasDirectField && !hasCanonical && !isSignature) {
      errors.push(`Variable "{{${variable}}}" is not available in contact data`);
    }
  });

  // Check for custom/unknown variables that resolve to empty after merge.
  // Skip any variable whose normalized form is a canonical alias (those will
  // derive from contact.name or sender fields and may legitimately be empty
  // during editing).
  if (contacts.length > 0) {
    const sampleContact = contacts[0];
    templateVariables.forEach((variable) => {
      const lowerVar = variable.toLowerCase();
      const normalized = normalizeKey(variable);
      if (lowerVar === "signature" || normalized in CANONICAL_RESOLVERS) return;

      const directKey = Object.keys(sampleContact).find((k) => k.toLowerCase() === lowerVar);
      if (directKey && !sampleContact[directKey]) {
        warnings.push(
          `"{{${variable}}}" is empty for ${sampleContact.name || sampleContact.email}`,
        );
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export const DEFAULT_SUBJECTS = [
  "CU Hyperloop // {{Company}}",
  "Partnership Opportunity - CU Hyperloop",
];

export function getSubjectsForTemplate(template: Template): string[] {
  if (template.subjects && template.subjects.length > 0) return template.subjects;
  const parsed = parseTemplateSections(template.content);
  if (parsed.subject) return [parsed.subject];
  return DEFAULT_SUBJECTS;
}

export function getSubjectForContactIndex(template: Template, index: number): string {
  const subjects = getSubjectsForTemplate(template);
  return subjects[index % subjects.length];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatEmailBodyHtml(body: string): string {
  // Normalize Windows/textarea line endings strictly to \n
  let htmlBody = body.replace(/\r\n/g, "\n");

  // 1. Convert plain line breaks into literal <br> HTML elements for Microsoft Graph API
  // First convert paragraph spaces (\n\n) to double breaks, then singles to single breaks.
  htmlBody = htmlBody.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");

  // 2. Wrap the signature in gold-accent HTML. Anchor on "<br><br>Best,<br>"
  // so only the signature block gets matched (preserves "Best," as visible
  // plain text above the styled lines). No blank line between "Best," and
  // the name — they sit tight. Lazy `[^<]+?` captures keep each line clean.
  const signatureRegex =
    /(<br><br>Best,<br>(?:<br>)?)([^<]+?)<br>CU Hyperloop\s*\|\s*([^<]+?)<br>CU Boulder\s*\|\s*([^<]+?)<br>([^<]+?\|[^<]+?)$/;
  htmlBody = htmlBody.replace(signatureRegex, (_match, lead, name, role, major, contactDetails) => {
    // Signature inherits the surrounding email font. Only gold accents stay
    // locked in. margin-top: 0 keeps "Best," flush with the name.
    return `${lead}<div style="line-height: 1.35; margin-top: 0; margin-bottom: 0;">
  <span>${escapeHtml(name.trim())}</span><br>
  <span><strong style="color: #CFB87C;">CU Hyperloop</strong> | ${escapeHtml(role.trim())}</span><br>
  <span><strong style="color: #CFB87C;">CU Boulder</strong> | ${escapeHtml(major.trim())}</span><br>
  <span>${escapeHtml(contactDetails.trim())}</span>
</div>`;
  });

  return htmlBody;
}

export function generatePreview(template: string, contact: Contact): string {
  return mergeTemplate(template, contact);
}

export function sanitizeTemplate(template: string): string {
  // Remove potential security issues
  let sanitized = template;

  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, "");

  // Remove on* event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");

  return sanitized;
}
