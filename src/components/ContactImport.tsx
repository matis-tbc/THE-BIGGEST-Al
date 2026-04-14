import { useEffect, useState, useRef } from "react";
import {
  parseCSV,
  ParsedContact,
  validateEmail,
  isHeaderRow,
  inferColumnTypes,
  parseCSVLine,
} from "../utils/csvParser";
import type { ColumnInference } from "../utils/csvParser";
import { projectStore, StoredTemplate } from "../services/projectStore";
import { validateContacts as sharedValidateContacts } from "../utils/contactValidation";
import { trimAllFields, dedupeByEmail, filterValidEmails, extractFirstNames } from "../utils/contactTransforms";
import { ColumnMapper } from "./ColumnMapper";

interface Contact {
  id: string;
  name: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined;
}

interface ContactImportProps {
  onContactsImported: (contacts: Contact[]) => void;
  onBack: () => void;
  campaignId?: string;
}

export const ContactImport: React.FC<ContactImportProps> = ({
  onContactsImported,
  onBack,
  campaignId,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkEditField, setBulkEditField] = useState<string>("");
  const [bulkEditValue, setBulkEditValue] = useState<string>("");

  const [isDragging, setIsDragging] = useState(false);
  const [dragSelectMode, setDragSelectMode] = useState(true);

  const [pastedText, setPastedText] = useState("");

  // Column mapper state for headerless paste
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [inferredColumns, setInferredColumns] = useState<ColumnInference[]>([]);
  const [rawPastedRows, setRawPastedRows] = useState<string[][]>([]);

  useEffect(() => {
    projectStore.listTemplates().then(setTemplates).catch(console.error);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const revalidate = (nextContacts: Contact[]) => {
    const result = sharedValidateContacts(nextContacts);
    setValidationErrors(result.errors);
  };

  const loadParsedContacts = async (parsedContacts: ParsedContact[]) => {
    const currentTemplates = await projectStore.listTemplates();

    const seenLower = new Set<string>(["name", "email"]);
    const discoveredHeaders: string[] = ["name", "email"];
    parsedContacts.forEach((contact) => {
      Object.keys(contact).forEach((key) => {
        const lower = key.toLowerCase();
        if (!seenLower.has(lower)) {
          seenLower.add(lower);
          discoveredHeaders.push(key);
        }
      });
    });
    setHeaders(discoveredHeaders);

    const normalizedContacts: Contact[] = [];

    // Build a canonical key map: first occurrence of each lowercase key wins
    const canonicalKeys = new Map<string, string>();
    parsedContacts.forEach((contact) => {
      Object.keys(contact).forEach((key) => {
        const lower = key.toLowerCase();
        if (!canonicalKeys.has(lower)) {
          canonicalKeys.set(lower, key);
        }
      });
    });

    parsedContacts.forEach((contact, index) => {
      // Normalize keys so "Name" and "name" merge into a single canonical key
      const normalized: Record<string, any> = {};
      for (const [k, v] of Object.entries(contact)) {
        const canonical = canonicalKeys.get(k.toLowerCase()) || k;
        if (!(canonical in normalized)) {
          normalized[canonical] = v;
        }
      }

      const { name, email, templateId, ...rest } = normalized as any;
      const cleanRest: Record<string, string> = {};
      let mappedTemplateId = templateId || undefined;

      for (const [k, v] of Object.entries(rest)) {
        if (v !== null && v !== undefined) {
          cleanRest[k] = String(v);
          if (k.toLowerCase() === 'template' && !mappedTemplateId && typeof v === 'string' && v.trim()) {
            const searchLower = v.trim().toLowerCase();
            const found = currentTemplates.find(t => {
              const templateLower = t.name.toLowerCase();
              return templateLower === searchLower ||
                templateLower.includes(searchLower) ||
                searchLower.includes(templateLower);
            });
            if (found) mappedTemplateId = found.id;
          }
        }
      }
      normalizedContacts.push({
        id: `contact-${Date.now()}-${index}`,
        name: name || email,
        email: email,
        templateId: mappedTemplateId,
        ...cleanRest,
      });
    });

    setContacts(normalizedContacts);
    revalidate(normalizedContacts);

    if (normalizedContacts.length === 0) {
      setError("No valid contacts found. Please check your data format.");
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const text = await file.text();
      const parsedContacts = await parseCSV(text);
      await loadParsedContacts(parsedContacts);
    } catch (err) {
      console.error("CSV parsing error:", err);
      setError("Failed to parse CSV file. Please check the format.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePastedTextSubmit = async () => {
    if (!pastedText.trim()) return;
    setError(null);
    setValidationErrors([]);

    // Detect delimiter and split into rows
    const lines = pastedText.trim().split("\n").filter((l) => l.trim());
    if (lines.length === 0) return;

    const tabCount = (lines[0].match(/\t/g) || []).length;
    const commaCount = (lines[0].match(/,/g) || []).length;
    const delimiter = tabCount > commaCount ? "\t" : ",";

    const firstRowCells = parseCSVLine(lines[0], delimiter);

    // Check if the first row looks like data (not headers)
    if (!isHeaderRow(firstRowCells)) {
      // Headerless data: parse all rows and show column mapper
      const allRows = lines.map((line) => parseCSVLine(line, delimiter));
      const inferred = inferColumnTypes(allRows);
      setRawPastedRows(allRows);
      setInferredColumns(inferred);
      setShowColumnMapper(true);
      return;
    }

    // Has headers: use existing parseCSV flow
    setIsLoading(true);
    try {
      const parsedContacts = await parseCSV(pastedText);
      await loadParsedContacts(parsedContacts);
      setPastedText("");
    } catch (err) {
      console.error("Paste parsing error:", err);
      setError("Failed to parse pasted text. Please check the format.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleColumnMapperConfirm = async (confirmedHeaders: string[]) => {
    setShowColumnMapper(false);
    setIsLoading(true);
    setError(null);

    try {
      // Build CSV text with synthetic header row + data rows
      const delimiter = "\t";
      const headerLine = confirmedHeaders.join(delimiter);
      const dataLines = rawPastedRows.map((row) => row.join(delimiter));
      const csvWithHeaders = [headerLine, ...dataLines].join("\n");

      const parsedContacts = await parseCSV(csvWithHeaders);
      await loadParsedContacts(parsedContacts);
      setPastedText("");
      setRawPastedRows([]);
      setInferredColumns([]);
    } catch (err) {
      console.error("Column mapper parsing error:", err);
      setError("Failed to import contacts. Please check the column mapping.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCellChange = (contactId: string, key: string, value: string) => {
    const next = contacts.map((contact) => {
      if (contact.id !== contactId) return contact;
      const updated = { ...contact, [key]: value };
      if (key === "email" && !updated.name) {
        updated.name = value.split("@")[0] || value;
      }
      if (key === "name") {
        updated.name = value;
      }
      return updated;
    });
    setContacts(next);
    revalidate(next);
  };

  const handleDeleteRow = (contactId: string) => {
    const next = contacts.filter((contact) => contact.id !== contactId);
    setContacts(next);
    revalidate(next);
  };

  const handleAddRow = () => {
    const next = [
      ...contacts,
      {
        id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        email: "",
      },
    ];
    setContacts(next);
    revalidate(next);
  };

  const toggleRowSelection = (id: string, override?: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      const willSelect = override !== undefined ? override : !next.has(id);
      if (willSelect) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleRowMouseDown = (id: string, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    // Only allow starting drag on the left column itself (prevents text-selection glitches elsewhere)
    const isCurrentlySelected = selectedRows.has(id);
    const mode = !isCurrentlySelected;
    setIsDragging(true);
    setDragSelectMode(mode);
    toggleRowSelection(id, mode);
  };

  const handleRowMouseEnter = (id: string) => {
    if (isDragging) {
      toggleRowSelection(id, dragSelectMode);
    }
  };

  useEffect(() => {
    let scrollInterval: number | null = null;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      if (!tableContainerRef.current) return;
      const rect = tableContainerRef.current.getBoundingClientRect();
      const topBuffer = rect.top + 50;
      const bottomBuffer = rect.bottom - 50;

      if (e.clientY < topBuffer) {
        if (!scrollInterval) {
          scrollInterval = window.setInterval(() => {
            if (tableContainerRef.current) tableContainerRef.current.scrollTop -= 20;
          }, 16);
        }
      } else if (e.clientY > bottomBuffer) {
        if (!scrollInterval) {
          scrollInterval = window.setInterval(() => {
            if (tableContainerRef.current) tableContainerRef.current.scrollTop += 20;
          }, 16);
        }
      } else {
        if (scrollInterval) {
          window.clearInterval(scrollInterval);
          scrollInterval = null;
        }
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      if (scrollInterval) {
        window.clearInterval(scrollInterval);
        scrollInterval = null;
      }
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
    }
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      if (scrollInterval) window.clearInterval(scrollInterval);
    };
  }, [isDragging]);

  const toggleAllRows = () => {
    if (selectedRows.size === contacts.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(contacts.map((c) => c.id)));
    }
  };

  const applyFieldBulkEdit = () => {
    if (!bulkEditField || selectedRows.size === 0) return;
    const next = contacts.map((c) => {
      if (!selectedRows.has(c.id)) return c;
      if (bulkEditField === "templateId") {
        return { ...c, templateId: bulkEditValue || undefined };
      }
      return { ...c, [bulkEditField]: bulkEditValue };
    });
    setContacts(next);
    revalidate(next);
  };

  const applyBulkAction = (action: "trim" | "dedupe" | "invalid-only" | "extract-first-name") => {
    let next = [...contacts];
    if (action === "trim") next = trimAllFields(next);
    if (action === "dedupe") next = dedupeByEmail(next);
    if (action === "invalid-only") next = filterValidEmails(next);
    if (action === "extract-first-name") next = extractFirstNames(next);
    setContacts(next);
    revalidate(next);
  };

  const exportCorrectedCsv = () => {
    if (contacts.length === 0) return;
    const csvHeaders = headers.length ? headers : ["name", "email"];
    const rows = [
      csvHeaders.join(","),
      ...contacts.map((contact) =>
        csvHeaders
          .map((header) => {
            const value = contact[header] || "";
            return `"${String(value).replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "contacts-corrected.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const validCount = contacts.filter((contact) =>
    validateEmail(contact.email),
  ).length;
  const mappedCount = contacts.filter((contact) => !!contact.templateId).length;
  const isFullyMapped = contacts.length > 0 && mappedCount === contacts.length;

  useEffect(() => {
    if (contacts.length === 0) return;
    const seenLower = new Set<string>(["name", "email"]);
    const nextHeaders: string[] = ["name", "email"];
    contacts.forEach((contact) => {
      Object.keys(contact).forEach((key) => {
        const lower = key.toLowerCase();
        if (lower !== "id" && lower !== "template" && !seenLower.has(lower)) {
          seenLower.add(lower);
          nextHeaders.push(key);
        }
      });
    });
    setHeaders(nextHeaders);
  }, [contacts]);

  const handleContinueWithCurrentData = () => {
    if (validCount > 0) {
      onContactsImported(
        contacts.filter((contact) => validateEmail(contact.email)),
      );
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      ["name", "email", "company", "department"],
      ["John Doe", "john@example.com", "Acme Corp", "Sales"],
      ["Jane Smith", "jane@example.com", "Tech Inc", "Marketing"],
      ["Bob Johnson", "bob@example.com", "Startup Co", "Engineering"],
    ];

    const csvContent = sampleData.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "sample-contacts.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Import Contacts</h2>
        <p className="text-slate-400">
          Upload a CSV file with your contact list. Include columns for name,
          email, and any merge fields.
        </p>
      </div>

      <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 bg-slate-800/30">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-500"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="mt-4">
            <label htmlFor="file-upload" className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-slate-200">
                {isLoading ? "Processing..." : "Upload CSV file"}
              </span>
              <input
                ref={fileInputRef}
                id="file-upload"
                name="file-upload"
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={handleFileSelect}
                disabled={isLoading}
              />
            </label>
            <p className="mt-1 text-sm text-slate-500">
              CSV files only, up to 10MB
            </p>
          </div>
        </div>
      </div>

      {showColumnMapper ? (
        <div className="border border-slate-700 rounded-xl p-4 bg-slate-800/30">
          <ColumnMapper
            inferredColumns={inferredColumns}
            rawRows={rawPastedRows}
            onConfirm={handleColumnMapperConfirm}
            onCancel={() => {
              setShowColumnMapper(false);
              setRawPastedRows([]);
              setInferredColumns([]);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-center text-sm font-medium text-slate-400">OR</div>
          <textarea
            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 text-sm text-slate-300 focus:border-yellow-500/50 focus:ring focus:ring-yellow-500/20 mb-2 min-h-[120px] resize-y placeholder-slate-600 focus:outline-none transition-all"
            placeholder="Paste columns from Excel, Google Sheets, or any tab/comma separated text here. Headerless data is auto-detected..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
          />
          <button
            className="btn-secondary w-full py-3 border-dashed hover:border-solid bg-slate-800/50 hover:bg-slate-800 transition-all font-medium text-slate-300 hover:text-white"
            onClick={handlePastedTextSubmit}
            disabled={isLoading || !pastedText.trim()}
          >
            {isLoading ? "Processing..." : "Import from Pasted Text"}
          </button>
        </div>
      )}

      {/* Sample CSV Download */}
      <div className="text-center">
        <button
          onClick={downloadSampleCSV}
          className="text-sm text-yellow-500 hover:text-yellow-400 font-medium"
        >
          Download sample CSV format
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-rose-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-rose-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-600">
                Validation Warnings
              </h3>
              <div className="mt-2 text-sm text-yellow-600/80">
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.slice(0, 5).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {validationErrors.length > 5 && (
                    <li>... and {validationErrors.length - 5} more errors</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Preview */}
      {contacts.length > 0 && (
        <div className={`border rounded-xl p-4 ${isFullyMapped ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {isFullyMapped ? (
                <svg
                  className="h-5 w-5 text-emerald-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 text-yellow-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <h3 className={`text-sm font-medium ${isFullyMapped ? 'text-emerald-500' : 'text-yellow-600'}`}>
                {validCount} valid contacts | {mappedCount}/{contacts.length} Templates Mapped
              </h3>
              <div className={`mt-2 text-sm ${isFullyMapped ? 'text-emerald-500/80' : 'text-yellow-600/80'}`}>
                {isFullyMapped
                  ? <p>All contacts have an assigned template. You can bypass the Template Manager directly!</p>
                  : <p>Some contacts are missing a template assignment. They will be routed to the fallback template selector next.</p>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-5 py-4 bg-slate-800/80 border-b border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-medium text-slate-200">CSV Editor</h3>
                {selectedRows.size > 0 && (
                  <div className="flex items-center gap-2 bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20">
                    <span className="text-xs text-yellow-500 font-medium">{selectedRows.size} selected</span>
                    <select value={bulkEditField} onChange={e => setBulkEditField(e.target.value)} className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-slate-300 focus:border-yellow-500 focus:ring-yellow-500">
                      <option value="">Edit field...</option>
                      {headers.filter(h => h !== 'id').map(h => <option key={h} value={h}>{h}</option>)}
                      <option value="templateId">Template</option>
                    </select>
                    {bulkEditField === "templateId" ? (
                      <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-slate-300 focus:border-yellow-500 focus:ring-yellow-500 max-w-[150px]">
                        <option value="">(Unmapped) Catch-all</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <input value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} placeholder="New value" className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-slate-300 focus:border-yellow-500 focus:ring-yellow-500 w-32" disabled={!bulkEditField} />
                    )}
                    <button onClick={applyFieldBulkEdit} disabled={!bulkEditField} className="bg-yellow-500 text-yellow-950 text-xs font-semibold px-2 py-1 rounded hover:bg-yellow-400 disabled:opacity-50 transition-colors">Apply</button>
                    <button onClick={() => setSelectedRows(new Set())} className="bg-slate-700 text-slate-300 text-xs font-semibold px-2 py-1 rounded hover:bg-slate-600 transition-colors">Deselect</button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => applyBulkAction("extract-first-name")}
                  className="btn-secondary text-xs !py-1.5"
                >
                  Extract first names
                </button>
                <button
                  onClick={() => applyBulkAction("trim")}
                  className="btn-secondary text-xs !py-1.5"
                >
                  Trim fields
                </button>
                <button
                  onClick={() => applyBulkAction("dedupe")}
                  className="btn-secondary text-xs !py-1.5"
                >
                  Remove duplicates
                </button>
                <button
                  onClick={() => applyBulkAction("invalid-only")}
                  className="btn-secondary text-xs !py-1.5"
                >
                  Keep valid only
                </button>
                <button
                  onClick={exportCorrectedCsv}
                  className="btn-secondary text-xs !py-1.5"
                >
                  Export corrected CSV
                </button>
                <button
                  onClick={handleAddRow}
                  className="btn-secondary text-xs !py-1.5"
                >
                  Add row
                </button>
              </div>
            </div>
          </div>
          <div ref={tableContainerRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-450px)] relative">
            <table className="min-w-max divide-y divide-slate-700">
              <thead className="sticky top-0 bg-slate-800 z-20 shadow-sm">
                <tr>
                  <th className="px-3 py-3 w-10 sticky left-0 bg-slate-800 z-30 shadow-[1px_0_0_0_#334155] cursor-pointer" onClick={toggleAllRows} title="Toggle All">
                    <div className="w-4 h-4 rounded border-2 mx-auto flex items-center justify-center transition-colors border-slate-500 hover:border-slate-400">
                      {selectedRows.size > 0 && selectedRows.size === contacts.length && (
                        <div className="w-2 h-2 bg-yellow-400 rounded-sm"></div>
                      )}
                      {selectedRows.size > 0 && selectedRows.size !== contacts.length && (
                        <div className="w-2 h-0.5 bg-slate-400 rounded-sm"></div>
                      )}
                    </div>
                  </th>
                  {headers
                    .filter(
                      (header) => header !== "id" && header !== "templateId",
                    )
                    .map((header) => (
                      <th
                        key={header}
                        className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap"
                      >
                        <div className="flex items-center gap-2">
                          <span>{header}</span>
                        </div>
                      </th>
                    ))}
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Template
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-slate-700/50">
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="hover:bg-slate-800/30 transition-colors group"
                  >
                    <td
                      className={`px-3 py-2 w-10 sticky left-0 z-10 shadow-[2px_0_0_0_#334155] cursor-col-resize select-none transition-colors ${selectedRows.has(contact.id) ? 'bg-yellow-500/20' : 'bg-slate-900'}`}
                      onMouseDown={(e) => handleRowMouseDown(contact.id, e)}
                      onMouseEnter={() => handleRowMouseEnter(contact.id)}
                    >
                      <div className={`w-4 h-4 mx-auto rounded border-2 flex items-center justify-center transition-colors ${selectedRows.has(contact.id) ? 'border-yellow-500 bg-yellow-500/20' : 'border-slate-600 group-hover:border-slate-500'}`}>
                        {selectedRows.has(contact.id) && <div className="w-2 h-2 bg-yellow-500 rounded-sm"></div>}
                      </div>
                    </td>
                    {headers
                      .filter(
                        (header) => header !== "id" && header !== "templateId",
                      )
                      .map((header) => (
                        <td key={header} className="px-5 py-2 text-sm whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <input
                              value={contact[header] || ""}
                              onChange={(event) =>
                                handleCellChange(
                                  contact.id,
                                  header,
                                  event.target.value,
                                )
                              }
                              className={`input-field !py-1.5 ${header === "email" &&
                                contact.email &&
                                !validateEmail(contact.email)
                                ? "!border-rose-500/50 !bg-rose-500/10"
                                : ""
                                }`}
                            />
                          </div>
                        </td>
                      ))}
                    <td className="px-5 py-3 text-sm font-medium">
                      {validateEmail(contact.email) ? (
                        <span className="text-emerald-500">Valid</span>
                      ) : (
                        <span className="text-rose-500">Invalid email</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium">
                      <select
                        value={contact.templateId || ""}
                        onChange={(e) =>
                          handleCellChange(
                            contact.id,
                            "templateId",
                            e.target.value,
                          )
                        }
                        className={`bg-slate-900 border text-xs rounded-lg block w-full p-2 ${!contact.templateId ? 'border-yellow-500/50 focus:ring-yellow-500 focus:border-yellow-500 text-yellow-200' : 'border-slate-700 focus:ring-emerald-500 text-slate-300 focus:border-emerald-500'}`}
                      >
                        <option value="">(Unmapped) Catch-all</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <button
                        onClick={() => handleDeleteRow(contact.id)}
                        className="text-rose-500 hover:text-rose-400 font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button onClick={onBack} className="btn-secondary">
          Back
        </button>
        <button
          onClick={handleContinueWithCurrentData}
          disabled={validCount === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue ({validCount} valid contacts)
        </button>
      </div>
    </div>
  );
};
