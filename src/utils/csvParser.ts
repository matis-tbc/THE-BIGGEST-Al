import { teamStore } from '../services/teamStore';

export interface ParsedContact {
  name?: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined; // Adjust for strict undefined checks
}

export async function parseCSV(csvText: string): Promise<ParsedContact[]> {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  const emailIndex = headers.findIndex(h =>
    h.toLowerCase().includes('email') || h.toLowerCase().includes('e-mail')
  );

  if (emailIndex === -1) {
    throw new Error('CSV must contain an email column');
  }

  // Fetch Team Profiles mapped for injection
  const teamMembers = await teamStore.listMembers();

  // Parse data rows
  const contacts: ParsedContact[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    if (values.length !== headers.length) {
      console.warn(`Row ${i + 1}: Column count mismatch (${values.length} vs ${headers.length})`);
      continue;
    }

    const contact: ParsedContact = {
      email: values[emailIndex]?.trim() || ''
    };

    let memberName = "";

    // Map all columns to contact object
    headers.forEach((headerOrig, index) => {
      let header = headerOrig.trim();
      const value = values[index]?.trim();
      if (!value) return;

      const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Normalize basic Contact fields
      if (cleanHeader === 'member') {
        memberName = value; // Capture the sender for profile resolution
      } else if (cleanHeader.includes('name') && !contact.name) {
        contact.name = value;
      }

      // We always preserve the raw data under its literal column name so {{Header}} merges work
      contact[header] = value;
    });

    // Ensure we have a basic name field for the contact
    if (!contact.name) {
      contact.name = contact.email.split('@')[0] || contact.email;
    }

    // Inject Dynamic Signature fields if the CSV defined a "Member"
    if (memberName) {
      // Find a case-insensitive match for the team member
      const searchName = memberName.toLowerCase();
      const memberProf = teamMembers.find(m => {
        const mName = m.name.toLowerCase();
        return mName === searchName || mName.includes(searchName) || searchName.includes(mName);
      });
      if (memberProf) {
        contact['Sender Name'] = memberProf.name;
        contact['Sender Role'] = memberProf.role;
        contact['Sender Major'] = memberProf.major;
        contact['Sender Phone'] = memberProf.phone;
        contact['Sender Email'] = memberProf.email;
      } else {
        // Fallback to literal text if no profile matched so tags don't just hang
        contact['Sender Name'] = memberName;
        contact['Sender Role'] = "{Setup role in Team Manager}";
        contact['Sender Major'] = "{Setup major in Team Manager}";
        contact['Sender Phone'] = "{Setup phone in Team Manager}";
        contact['Sender Email'] = "{Setup email in Team Manager}";
      }
    }

    contacts.push(contact);
  }

  return contacts;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }

    i++;
  }

  result.push(current.trim());
  return result;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function sanitizeCSVValue(value: string): string {
  // Remove potential formula injection
  if (value.startsWith('=') || value.startsWith('+') || value.startsWith('-') || value.startsWith('@')) {
    return `'${value}`;
  }
  return value;
}
