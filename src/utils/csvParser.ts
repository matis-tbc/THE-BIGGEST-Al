import { getMemberIdentifier, teamStore } from "../services/teamStore";

export interface ParsedContact {
  name?: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined; // Adjust for strict undefined checks
}

export interface ColumnInference {
  index: number;
  inferredType: string;
  confidence: number;
  suggestedHeader: string;
  sampleValues: string[];
}

export function isHeaderRow(cells: string[]): boolean {
  // If any cell contains @, it's data not headers
  if (cells.some((c) => c.includes("@"))) return false;

  // If most cells are short and look like column names
  const headerLike = cells.filter((c) => {
    const trimmed = c.trim();
    if (!trimmed) return true; // Empty cells are neutral
    return trimmed.length < 30 && /^[a-zA-Z\s_\-/]+$/.test(trimmed);
  });

  return headerLike.length > cells.length * 0.6;
}

export function inferColumnTypes(rows: string[][]): ColumnInference[] {
  if (rows.length === 0) return [];

  const colCount = Math.max(...rows.map((r) => r.length));
  const results: ColumnInference[] = [];

  // Transpose: get all values per column
  const columns: string[][] = [];
  for (let col = 0; col < colCount; col++) {
    columns.push(rows.map((r) => (r[col] || "").trim()));
  }

  const usedTypes = new Set<string>();

  for (let col = 0; col < colCount; col++) {
    const values = columns[col];
    const nonEmpty = values.filter((v) => v.length > 0);
    const fillRate = nonEmpty.length / values.length;
    const sampleValues = [...new Set(nonEmpty)].slice(0, 3);

    let inferredType = "unknown";
    let confidence = 0;
    let suggestedHeader = `Column ${col + 1}`;

    // 1. blank: mostly empty
    if (fillRate < 0.2) {
      inferredType = "blank";
      confidence = 1;
      suggestedHeader = "";
    }
    // 2. email: most values contain @
    else if (nonEmpty.filter((v) => v.includes("@")).length > nonEmpty.length * 0.8) {
      inferredType = "email";
      confidence = 0.95;
      suggestedHeader = "email";
    }
    // 2b. attachment_path: values look like file paths or end in common file extensions
    else if (
      !usedTypes.has("attachmentPath") &&
      nonEmpty.filter((v) => /[/\\].+\.[A-Za-z0-9]{2,5}$|^~[/\\]|^[A-Za-z]:[/\\]/.test(v)).length >
        nonEmpty.length * 0.6
    ) {
      inferredType = "attachmentPath";
      confidence = 0.8;
      suggestedHeader = "attachment_path";
    }
    // 3. date: patterns like "8-Dec", "2/3/2026"
    else if (
      nonEmpty.filter((v) =>
        /^\d{1,2}[/-]\w{3,}$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\w{3,}-\d{1,2}$/i.test(v),
      ).length >
      nonEmpty.length * 0.5
    ) {
      inferredType = "date";
      confidence = 0.8;
      suggestedHeader = "Date";
    }
    // 4. companyInfo: long values with | separators
    else if (
      nonEmpty.filter((v) => v.includes("|") && v.length > 20).length >
      nonEmpty.length * 0.3
    ) {
      inferredType = "companyInfo";
      confidence = 0.75;
      suggestedHeader = "Company Info";
    } else {
      const unique = new Set(nonEmpty.map((v) => v.toLowerCase()));
      const uniqueRatio = unique.size / nonEmpty.length;
      const avgLength = nonEmpty.reduce((s, v) => s + v.length, 0) / nonEmpty.length;

      const titleWords =
        /\b(representative|manager|director|engineer|specialist|vp|president|analyst|associate|coordinator|lead|senior|sr\.?|assistant|executive|officer|supervisor|sales|marketing|business|development)\b/i;
      const titleMatches = nonEmpty.filter((v) => titleWords.test(v)).length;

      const memberLike = nonEmpty.filter((v) => /^[A-Za-z]+$/.test(v) && v.length < 15);

      const hasOutreach = nonEmpty.some((v) => /outreach|campaign|monetary|in-kind/i.test(v));
      const capitalizedCount = nonEmpty.filter((v) => /^[A-Z]/.test(v)).length;
      const isDocLink = nonEmpty.some((v) => /google docs|docs\.google|https?:|\.com\b/i.test(v));

      // 1. Doc/URL columns -> skip as notes
      if (isDocLink && !usedTypes.has("docLink")) {
        inferredType = "docLink";
        confidence = 0.8;
        suggestedHeader = "Notes";
      }
      // 2. Outreach keywords -> campaign tag (NOT template)
      else if (hasOutreach && !usedTypes.has("campaign")) {
        inferredType = "campaign";
        confidence = 0.85;
        suggestedHeader = "Campaign";
      }
      // 3. Title words
      else if (titleMatches > nonEmpty.length * 0.4 && !usedTypes.has("title")) {
        inferredType = "title";
        confidence = 0.85;
        suggestedHeader = "Title";
      }
      // 4. Member: single short word, very low cardinality
      else if (
        memberLike.length > nonEmpty.length * 0.8 &&
        unique.size < Math.max(4, nonEmpty.length * 0.15) &&
        !usedTypes.has("member")
      ) {
        inferredType = "member";
        confidence = 0.8;
        suggestedHeader = "Member";
      }
      // 5. Template symbol: short codes (GO, GD, Zayo), low cardinality
      else if (
        avgLength <= 6 &&
        unique.size <= 15 &&
        fillRate > 0.3 &&
        !usedTypes.has("templateSymbol")
      ) {
        inferredType = "templateSymbol";
        confidence = 0.7;
        suggestedHeader = "template";
      }
      // 6. Name: high uniqueness, contains spaces
      else if (
        uniqueRatio > 0.5 &&
        avgLength > 5 &&
        nonEmpty.some((v) => v.includes(" ")) &&
        !usedTypes.has("name")
      ) {
        inferredType = "name";
        confidence = 0.85;
        suggestedHeader = "name";
      }
      // 7. Company: mostly capitalized proper nouns, not caught above
      else if (
        capitalizedCount > nonEmpty.length * 0.7 &&
        avgLength >= 3 &&
        avgLength <= 35 &&
        !usedTypes.has("company")
      ) {
        inferredType = "company";
        confidence = 0.7;
        suggestedHeader = "Company";
      }
      // 8. Notes: sparse, short
      else if (fillRate < 0.5 && avgLength < 20) {
        inferredType = "notes";
        confidence = 0.5;
        suggestedHeader = "Notes";
      }
      // 9. Item: remaining low cardinality
      else if (uniqueRatio <= 0.5 && avgLength > 3 && avgLength < 30) {
        inferredType = "item";
        confidence = 0.6;
        suggestedHeader = "Item";
      }
    }

    usedTypes.add(inferredType);

    results.push({
      index: col,
      inferredType,
      confidence,
      suggestedHeader,
      sampleValues,
    });
  }

  // Fallback: if no name column was found, pick first unknown with spaces
  if (!results.some((r) => r.inferredType === "name")) {
    const candidate = results.find(
      (r) => r.inferredType === "unknown" && r.sampleValues.some((v) => v.includes(" ")),
    );
    if (candidate) {
      candidate.inferredType = "name";
      candidate.suggestedHeader = "name";
      candidate.confidence = 0.6;
    }
  }

  return results;
}

export async function parseCSV(csvText: string): Promise<ParsedContact[]> {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const tabCount = (lines[0].match(/\t/g) || []).length;
  const commaCount = (lines[0].match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? "\t" : ",";

  // Parse header row
  const headers = parseCSVLine(lines[0], delimiter);
  const emailIndex = headers.findIndex(
    (h) => h.toLowerCase().includes("email") || h.toLowerCase().includes("e-mail"),
  );

  if (emailIndex === -1) {
    throw new Error("CSV must contain an email column");
  }

  // Fetch Team Profiles mapped for injection
  const teamMembers = await teamStore.listMembers();

  // Parse data rows
  const contacts: ParsedContact[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line, delimiter);
    if (values.length !== headers.length) {
      console.warn(`Row ${i + 1}: Column count mismatch (${values.length} vs ${headers.length})`);
      continue;
    }

    const contact: ParsedContact = {
      email: values[emailIndex]?.trim() || "",
    };

    let memberName = "";

    // Map all columns to contact object
    headers.forEach((headerOrig, index) => {
      const header = headerOrig.trim();
      const value = values[index]?.trim();
      if (!value) return;

      const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Normalize basic Contact fields
      if (cleanHeader === "member") {
        memberName = value; // Capture the sender for profile resolution
      } else if (cleanHeader.includes("name") && !contact.name) {
        contact.name = value;
      }

      // We always preserve the raw data under its literal column name so {{Header}} merges work
      contact[header] = value;
    });

    // Ensure we have a basic name field for the contact
    if (!contact.name) {
      contact.name = contact.email.split("@")[0] || contact.email;
    }

    // Inject Dynamic Signature fields if the CSV defined a "Member"
    if (memberName) {
      // Match against the profile's `identifier` (short form, e.g. "Owen")
      // with fallback to the full `name` for legacy profiles. The full
      // display name (e.g. "Owen Wojciak") is what gets written into the
      // signature block — keeping those two concerns separate so CSVs can
      // stay terse while signatures render the full name.
      const searchName = memberName.trim().toLowerCase();
      const memberProf =
        teamMembers.find((m) => {
          const idKey = getMemberIdentifier(m).toLowerCase();
          return idKey === searchName;
        }) ||
        teamMembers.find((m) => {
          const idKey = getMemberIdentifier(m).toLowerCase();
          return idKey.includes(searchName) || searchName.includes(idKey);
        });
      if (memberProf) {
        contact["Sender Name"] = memberProf.name;
        contact["Sender Role"] = memberProf.role;
        contact["Sender Major"] = memberProf.major;
        contact["Sender Phone"] = memberProf.phone;
        contact["Sender Email"] = memberProf.email;
      } else {
        // No profile matched this Member value. Leave sender subfields empty
        // (NOT literal "{Setup role...}" text — that would render in emails)
        // and flag the row via `_unmatchedMember` so Preflight can surface it.
        contact["Sender Name"] = memberName;
        contact["Sender Role"] = "";
        contact["Sender Major"] = "";
        contact["Sender Phone"] = "";
        contact["Sender Email"] = "";
        contact._unmatchedMember = memberName;
      }
    }

    contacts.push(contact);
  }

  return contacts;
}

export function parseCSVLine(line: string, delimiter: string = ","): string[] {
  const result: string[] = [];
  let current = "";
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
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
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
  if (
    value.startsWith("=") ||
    value.startsWith("+") ||
    value.startsWith("-") ||
    value.startsWith("@")
  ) {
    return `'${value}`;
  }
  return value;
}
