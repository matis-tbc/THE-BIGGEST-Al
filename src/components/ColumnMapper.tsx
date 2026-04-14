import React, { useState, useMemo } from "react";
import type { ColumnInference } from "../utils/csvParser";

const COLUMN_TYPE_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "title", label: "Title / Role" },
  { value: "member", label: "Team Member" },
  { value: "templateSymbol", label: "Template Code" },
  { value: "campaign", label: "Campaign Tag" },
  { value: "template", label: "Template (full name)" },
  { value: "item", label: "Item" },
  { value: "notes", label: "Notes" },
  { value: "docLink", label: "Doc Link (skip)" },
  { value: "date", label: "Date" },
  { value: "companyInfo", label: "Company Info" },
  { value: "blank", label: "Skip" },
  { value: "unknown", label: "Custom Field" },
];

interface ColumnMapperProps {
  inferredColumns: ColumnInference[];
  rawRows: string[][];
  onConfirm: (headers: string[]) => void;
  onCancel: () => void;
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({
  inferredColumns,
  rawRows,
  onConfirm,
  onCancel,
}) => {
  const [mappings, setMappings] = useState<ColumnInference[]>(inferredColumns);

  const updateMapping = (index: number, newType: string) => {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.index !== index) return m;
        const option = COLUMN_TYPE_OPTIONS.find((o) => o.value === newType);
        return {
          ...m,
          inferredType: newType,
          suggestedHeader:
            newType === "blank"
              ? ""
              : newType === "unknown"
                ? m.suggestedHeader.startsWith("Column")
                  ? m.suggestedHeader
                  : m.suggestedHeader
                : option?.label || m.suggestedHeader,
        };
      }),
    );
  };

  const updateCustomHeader = (index: number, header: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.index === index ? { ...m, suggestedHeader: header } : m,
      ),
    );
  };

  const previewRows = useMemo(() => rawRows.slice(0, 4), [rawRows]);

  const hasEmail = mappings.some((m) => m.inferredType === "email");

  const handleConfirm = () => {
    // Build the header row from confirmed mappings
    const headers = mappings.map((m) => {
      if (m.inferredType === "blank" || m.inferredType === "docLink") return "";
      if (m.inferredType === "member") return "Member";
      if (m.inferredType === "template") return "template";
      if (m.inferredType === "templateSymbol") return "template";
      if (m.inferredType === "campaign") return "Campaign";
      if (m.inferredType === "email") return "email";
      if (m.inferredType === "name") return "name";
      if (m.inferredType === "company") return "Company";
      if (m.inferredType === "title") return "Title";
      if (m.inferredType === "item") return "Item";
      if (m.inferredType === "notes") return "Notes";
      if (m.inferredType === "date") return "Date";
      if (m.inferredType === "companyInfo") return "Company Info";
      return m.suggestedHeader || `Column ${m.index + 1}`;
    });
    onConfirm(headers);
  };

  // Filter out blank columns for display
  const visibleColumns = mappings.filter((m) => m.inferredType !== "blank");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white">
            Column Mapping
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            We detected {rawRows.length} rows with no header row. Verify the
            column assignments below.
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {mappings.filter((m) => m.inferredType === "blank").length} blank
          columns hidden
        </span>
      </div>

      {/* Column Assignment Cards */}
      <div className="grid gap-3">
        {visibleColumns.map((col) => (
          <div
            key={col.index}
            className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-lg p-3"
          >
            {/* Sample Values */}
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 flex-wrap">
                {col.sampleValues.map((v, i) => (
                  <span
                    key={i}
                    className="text-xs text-slate-300 bg-slate-900/50 px-2 py-1 rounded truncate max-w-[200px]"
                    title={v}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-600 flex-shrink-0"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>

            {/* Type Selector */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                value={col.inferredType}
                onChange={(e) => updateMapping(col.index, e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:ring-1 focus:ring-yellow-500"
              >
                {COLUMN_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {col.inferredType === "unknown" && (
                <input
                  type="text"
                  value={col.suggestedHeader}
                  onChange={(e) =>
                    updateCustomHeader(col.index, e.target.value)
                  }
                  placeholder="Header name"
                  className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 w-28 focus:ring-1 focus:ring-yellow-500"
                />
              )}

              {col.confidence >= 0.8 && (
                <span className="text-xs text-emerald-400">auto</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Preview Table */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">
          Preview ({Math.min(4, rawRows.length)} of {rawRows.length} rows)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.index}
                    className="text-left p-2 text-yellow-500 font-medium border-b border-slate-700 whitespace-nowrap"
                  >
                    {col.inferredType === "unknown"
                      ? col.suggestedHeader
                      : COLUMN_TYPE_OPTIONS.find(
                            (o) => o.value === col.inferredType,
                          )?.label || col.suggestedHeader}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri} className="border-b border-slate-800">
                  {visibleColumns.map((col) => (
                    <td
                      key={col.index}
                      className="p-2 text-slate-300 max-w-[200px] truncate"
                      title={row[col.index] || ""}
                    >
                      {row[col.index] || (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Validation */}
      {!hasEmail && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300">
          No email column detected. Please assign one column as "Email".
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!hasEmail}
          className="btn-primary text-sm disabled:opacity-50"
        >
          Confirm Mapping ({rawRows.length} contacts)
        </button>
      </div>
    </div>
  );
};
