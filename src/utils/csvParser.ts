export interface ParsedContact {
  name?: string;
  email: string;
  [key: string]: string | undefined;
}

export function parseCSV(csvText: string): ParsedContact[] {
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

    // Map all columns to contact object
    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      if (value) {
        const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanHeader.includes('name') && !contact.name) {
          contact.name = value;
        } else {
          contact[header] = value;
        }
      }
    });

    // Ensure we have a name field
    if (!contact.name) {
      contact.name = contact.email.split('@')[0] || contact.email;
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
