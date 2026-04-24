import { validateEmail } from "./csvParser";

export interface Contact {
  id: string;
  name: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined;
}

export interface ValidationResult {
  errors: string[];
  validCount: number;
  duplicateCount: number;
}

/**
 * Split an email cell into individual addresses. Recipient cells may contain
 * comma / semicolon / whitespace-delimited lists — the dispatch pipeline uses
 * the first address as primary and drops duplicates. A row is considered
 * valid as long as AT LEAST ONE token parses as an email.
 */
function splitEmailList(raw: string): string[] {
  return (raw || "")
    .split(/[;,]+/)
    .flatMap((part) => part.split(/\s+/))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function validateContacts(contacts: Contact[]): ValidationResult {
  const errors: string[] = [];
  const emailSet = new Set<string>();
  let validCount = 0;
  let duplicateCount = 0;

  contacts.forEach((contact, index) => {
    const tokens = splitEmailList(contact.email || "");
    const validTokens = tokens.filter(validateEmail);
    const allValid = tokens.length > 0 && validTokens.length === tokens.length;
    const anyValid = validTokens.length > 0;

    if (!contact.email || !anyValid) {
      errors.push(`Row ${index + 2}: Invalid email "${contact.email}"`);
    } else {
      validCount++;
      if (!allValid) {
        const bad = tokens.filter((t) => !validateEmail(t));
        errors.push(`Row ${index + 2}: Some emails malformed (will be skipped): ${bad.join(", ")}`);
      }
    }

    // Dedupe on the primary (first) address — matches dispatch behavior.
    const primary = (validTokens[0] || "").toLowerCase();
    if (primary && emailSet.has(primary)) {
      errors.push(`Row ${index + 2}: Duplicate email "${primary}"`);
      duplicateCount++;
    }
    if (primary) emailSet.add(primary);
  });

  return { errors, validCount, duplicateCount };
}
