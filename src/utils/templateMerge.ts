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
export const VARIABLE_ALIASES: Record<string, string> = {
  // Sender fields (signature block)
  "your name": "Sender Name",
  "my name": "Sender Name",
  "role": "Sender Role",
  "major": "Sender Major",
  "phone number": "Sender Phone",
  "email": "Sender Email",
  // Contact fields
  "name": "First Name",
  "contact name": "First Name",
  "first name": "First Name",
  "contact first name": "First Name",
  // Company
  "company name": "Company",
  "company": "Company",
};

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

  // Match {single brace} variables but NOT {{double brace}} ones
  const singleBraceRegex = /(?<!\{)\{([A-Za-z][A-Za-z\s]*)\}(?!\})/g;
  let match;

  while ((match = singleBraceRegex.exec(rawText)) !== null) {
    const original = match[1].trim();
    const lowerOriginal = original.toLowerCase();
    if (seen.has(lowerOriginal)) continue;
    seen.add(lowerOriginal);
    originalVariables.push(original);

    const canonical = VARIABLE_ALIASES[lowerOriginal];
    mappings.push({
      original,
      converted: canonical || original,
      isAlias: !!canonical,
    });
  }

  // Replace all {single brace} with {{canonical}} names
  let converted = rawText;
  for (const mapping of mappings) {
    const regex = new RegExp(
      `(?<!\\{)\\{\\s*${escapeRegex(mapping.original)}\\s*\\}(?!\\})`,
      "gi",
    );
    converted = converted.replace(regex, `{{${mapping.converted}}}`);
  }

  return { content: converted, mappings, originalVariables };
}

export function mergeTemplate(template: string, contact: Contact): string {
  let merged = template;

  // Map legacy variable names to standardized sender references silently
  const getMappedValue = (key: string): string => {
    if (contact[key] !== undefined) return contact[key] as string;

    const lowerKey = key.toLowerCase();

    // Check for case-insensitive exact match in contact keys
    const foundKey = Object.keys(contact).find(
      (k) => k.toLowerCase() === lowerKey,
    );
    if (foundKey && contact[foundKey] !== undefined)
      return contact[foundKey] as string;

    // Fallback Aliases
    if (lowerKey === "your name" || lowerKey === "my name")
      return (contact["Sender Name"] as string) || "";
    if (lowerKey === "contact name") return (contact["name"] as string) || "";
    if (lowerKey === "role") return (contact["Sender Role"] as string) || "";
    if (lowerKey === "major") return (contact["Sender Major"] as string) || "";
    if (lowerKey === "phone number")
      return (contact["Sender Phone"] as string) || "";
    if (lowerKey === "company name")
      return (contact["Company"] as string) || "";

    // Derived Aliases
    if (lowerKey === "first name" || lowerKey === "contact first name") {
      const fullName = (contact["name"] as string) || "";
      return fullName.split(" ")[0] || "";
    }

    return "";
  };

  // Replace all variables with contact data taking aliases into account
  const templateVariables = extractVariables(template);
  templateVariables.forEach((variable) => {
    const value = getMappedValue(variable);
    const regex = new RegExp(`\\{\\{${variable}\\}\\}`, "g");
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

  // Check for undefined variables taking aliases into account
  templateVariables.forEach((variable) => {
    const lowerVar = variable.toLowerCase();

    // Case-insensitive direct match
    const hasDirectField = Array.from(availableFields).some(
      (f) => f.toLowerCase() === lowerVar,
    );

    const hasAlias =
      ((lowerVar === "your name" || lowerVar === "my name") &&
        availableFields.has("Sender Name")) ||
      (lowerVar === "contact name" && availableFields.has("name")) ||
      ((lowerVar === "first name" || lowerVar === "contact first name") &&
        availableFields.has("name")) ||
      (lowerVar === "role" && availableFields.has("Sender Role")) ||
      (lowerVar === "major" && availableFields.has("Sender Major")) ||
      (lowerVar === "phone number" && availableFields.has("Sender Phone")) ||
      (lowerVar === "company name" &&
        Array.from(availableFields).some((f) => f.toLowerCase() === "company"));

    if (!hasDirectField && !hasAlias) {
      errors.push(
        `Variable "{{${variable}}}" is not available in contact data`,
      );
    }
  });

  // Check for variables that resolve to empty after merge
  if (contacts.length > 0) {
    const sampleContact = contacts[0];
    templateVariables.forEach((variable) => {
      const lowerVar = variable.toLowerCase();
      // Skip variables we know resolve via aliases or derivation
      const knownAliases = [
        "first name", "contact first name", "your name", "my name",
        "contact name", "role", "major", "phone number", "company name",
        "sender name", "sender role", "sender major", "sender phone", "sender email",
      ];
      if (knownAliases.includes(lowerVar)) return;

      const directKey = Object.keys(sampleContact).find(
        (k) => k.toLowerCase() === lowerVar,
      );
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

export function formatEmailBodyHtml(body: string): string {
  // Normalize Windows/textarea line endings strictly to \n
  let htmlBody = body.replace(/\r\n/g, "\n");

  // 1. Convert plain line breaks into literal <br> HTML elements for Microsoft Graph API
  // First convert paragraph spaces (\n\n) to double breaks, then singles to single breaks.
  htmlBody = htmlBody.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");

  // 2. Wrap the signature in Gold and Grey inline HTML using a Regex Pattern
  // Since we just converted \n to <br>, we must match the signature against <br> tags.
  const signatureRegex =
    /^(.*?)<br>CU Hyperloop\s*\|\s*(.*?)<br>CU Boulder\s*\|\s*(.*?)<br>(.*?\|.*?)$/gm;
  htmlBody = htmlBody.replace(
    signatureRegex,
    (_match, name, role, major, contactDetails) => {
      return `<div style="font-family: Arial, sans-serif; line-height: 1.2; margin-top: 12px; margin-bottom: 0;">
  <span style="font-size: 15px;">${name.trim()}</span><br>
  <span style="font-size: 14px;"><strong style="color: #CFB87C;">CU Hyperloop</strong> <span style="color: #6B7280;">| ${role.trim()}</span></span><br>
  <span style="font-size: 14px;"><strong style="color: #CFB87C;">CU Boulder</strong> <span style="color: #6B7280;">| ${major.trim()}</span></span><br>
  <span style="font-size: 14px; color: #6B7280;">${contactDetails.trim()}</span>
</div>`;
    },
  );

  return htmlBody;
}

export function generatePreview(template: string, contact: Contact): string {
  return mergeTemplate(template, contact);
}

export function sanitizeTemplate(template: string): string {
  // Remove potential security issues
  let sanitized = template;

  // Remove script tags
  sanitized = sanitized.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, "");

  // Remove on* event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");

  return sanitized;
}
