import { validateEmail } from "./csvParser";

export interface Contact {
  id: string;
  name: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined;
}

export function trimAllFields(contacts: Contact[]): Contact[] {
  return contacts.map((contact) => {
    const updated: Contact = { ...contact };
    Object.keys(updated).forEach((key) => {
      if (key === "id" || key === "templateId") return; // preserve null/undefined
      const val = updated[key];
      if (typeof val === "string") updated[key] = val.trim();
    });
    return updated;
  });
}

export function dedupeByEmail(contacts: Contact[]): Contact[] {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const emailKey = (contact.email || "").toLowerCase();
    if (!emailKey) return true;
    if (seen.has(emailKey)) return false;
    seen.add(emailKey);
    return true;
  });
}

export function filterValidEmails(contacts: Contact[]): Contact[] {
  return contacts.filter((contact) => validateEmail(contact.email));
}

export function extractFirstNames(contacts: Contact[]): Contact[] {
  return contacts.map((contact) => {
    const rawName = (contact.name || "").trim();
    if (!rawName) return contact;
    const firstName = rawName.split(/\s+/)[0];

    const updated: Contact = { ...contact, name: firstName };
    const rec = updated as Record<string, string | null | undefined>;
    Object.keys(rec).forEach((key) => {
      const lk = key.toLowerCase().replace(/[^a-z]/g, "");
      if ((lk === "name" || lk === "firstname" || lk === "fullname") && key !== "id") {
        const val = ((rec[key] as string) || "").trim();
        if (val) rec[key] = val.split(/\s+/)[0];
      }
    });

    return updated;
  });
}
