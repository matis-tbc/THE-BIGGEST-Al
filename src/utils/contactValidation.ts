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

export function validateContacts(contacts: Contact[]): ValidationResult {
  const errors: string[] = [];
  const emailSet = new Set<string>();
  let validCount = 0;
  let duplicateCount = 0;

  contacts.forEach((contact, index) => {
    if (!contact.email || !validateEmail(contact.email)) {
      errors.push(`Row ${index + 2}: Invalid email "${contact.email}"`);
    } else {
      validCount++;
    }
    if (contact.email && emailSet.has(contact.email.toLowerCase())) {
      errors.push(`Row ${index + 2}: Duplicate email "${contact.email}"`);
      duplicateCount++;
    }
    emailSet.add((contact.email || "").toLowerCase());
  });

  return { errors, validCount, duplicateCount };
}
