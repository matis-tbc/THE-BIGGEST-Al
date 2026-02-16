export interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

export function mergeTemplate(template: string, contact: Contact): string {
  let merged = template;
  
  // Replace all variables with contact data
  Object.keys(contact).forEach(key => {
    if (key !== 'id') {
      const value = contact[key] || '';
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      merged = merged.replace(regex, value);
    }
  });

  return merged;
}

export function parseTemplateSections(template: string): {
  subject?: string;
  to?: string;
  body: string;
} {
  const normalized = template.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
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
      if (key === 'subject') {
        subject = match[2] || '';
      } else {
        to = match[2] || '';
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

  const body = lines.slice(bodyStartIndex).join('\n').trimStart();
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

export function validateTemplate(template: string, contacts: Contact[]): {
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
  contacts.forEach(contact => {
    Object.keys(contact).forEach(key => {
      if (key !== 'id') {
        availableFields.add(key);
      }
    });
  });

  // Check for undefined variables
  templateVariables.forEach(variable => {
    if (!availableFields.has(variable)) {
      errors.push(`Variable "{{${variable}}}" is not available in contact data`);
    }
  });

  // Check for unused contact fields
  availableFields.forEach(field => {
    if (!templateVariables.includes(field)) {
      warnings.push(`Contact field "${field}" is not used in template`);
    }
  });

  // Check for required fields
  const requiredFields = ['name', 'email'];
  requiredFields.forEach(field => {
    if (!templateVariables.includes(field)) {
      warnings.push(`Consider using "{{${field}}}" in your template`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function generatePreview(template: string, contact: Contact): string {
  return mergeTemplate(template, contact);
}

export function sanitizeTemplate(template: string): string {
  // Remove potential security issues
  let sanitized = template;
  
  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove on* event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  return sanitized;
}
