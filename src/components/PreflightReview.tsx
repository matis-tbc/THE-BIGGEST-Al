import type React from "react";
import { useMemo, useState } from "react";
import {
  mergeTemplate,
  parseTemplateSections,
  validateTemplate,
  formatEmailBodyHtml,
  getSubjectsForTemplate,
  getSubjectForContactIndex,
} from "../utils/templateMerge";

interface Contact {
  id: string;
  name: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined;
}

interface Template {
  id: string;
  name: string;
  subjects?: string[];
  content: string;
  variables: string[];
}

interface PreflightReviewProps {
  contacts: Contact[];
  templates: Template[];
  defaultTemplateId: string | null;
  attachment: File | null;
  onBack: () => void;
  onContinue: () => void;
}

export const PreflightReview: React.FC<PreflightReviewProps> = ({
  contacts,
  templates,
  defaultTemplateId,
  attachment,
  onBack,
  onContinue,
}) => {
  const [previewIndex, setPreviewIndex] = useState(0);
  const selectedContact = contacts[previewIndex] || contacts[0];

  const getTemplateForContact = (contact: Contact) => {
    const activeId = contact.templateId || defaultTemplateId;
    return templates.find((t) => t.id === activeId) || templates[0];
  };

  const checks = useMemo(() => {
    let templateErrors: string[] = [];
    let templateWarnings: string[] = [];

    // Per-contact issue tracking
    const contactIssues: {
      contact: Contact;
      errors: string[];
      warnings: string[];
      templateName: string;
    }[] = [];

    // Validate templates for each contact
    contacts.forEach((contact) => {
      const activeTemplate = getTemplateForContact(contact);
      if (activeTemplate) {
        const validation = validateTemplate(activeTemplate.content, [contact]);
        templateErrors = [...templateErrors, ...validation.errors];
        templateWarnings = [...templateWarnings, ...validation.warnings];
        if (validation.errors.length > 0 || validation.warnings.length > 0) {
          contactIssues.push({
            contact,
            errors: validation.errors,
            warnings: validation.warnings,
            templateName: activeTemplate.name,
          });
        }
      } else {
        const msg = "No template assigned";
        templateErrors.push(msg);
        contactIssues.push({ contact, errors: [msg], warnings: [], templateName: "(none)" });
      }
    });

    // Deduplicate summary counts
    templateErrors = Array.from(new Set(templateErrors));
    templateWarnings = Array.from(new Set(templateWarnings));

    const templateValidation = {
      errors: templateErrors,
      warnings: templateWarnings,
      isValid: templateErrors.length === 0,
      contactIssues,
    };

    const invalidEmails = contacts.filter(
      (contact) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email),
    );
    const duplicateEmailCount = (() => {
      const seen = new Set<string>();
      let duplicates = 0;
      contacts.forEach((contact) => {
        const key = (contact.email || "").toLowerCase();
        if (!key) return;
        if (seen.has(key)) duplicates += 1;
        seen.add(key);
      });
      return duplicates;
    })();
    const attachmentWarning =
      attachment && attachment.size > 25 * 1024 * 1024
        ? `Attachment is ${Math.round(attachment.size / (1024 * 1024))}MB; this may slow batch processing.`
        : null;
    const missingCUHyperloop = contacts.filter((contact, index) => {
      const activeTemplate = getTemplateForContact(contact);
      if (!activeTemplate) return false;
      const selectedSubject = getSubjectForContactIndex(activeTemplate, index);
      if (!selectedSubject) return true;
      const merged = mergeTemplate(selectedSubject, contact);
      return !merged.toLowerCase().includes("cu hyperloop");
    });

    const emptySubjectCount = contacts.filter((contact, index) => {
      const activeTemplate = getTemplateForContact(contact);
      if (!activeTemplate) return false;
      const selectedSubject = getSubjectForContactIndex(activeTemplate, index);
      return selectedSubject ? !mergeTemplate(selectedSubject, contact).trim() : true;
    }).length;

    const emptyRecipientCount = contacts.filter((contact) => {
      const activeTemplate = getTemplateForContact(contact);
      if (!activeTemplate) return !contact.email.trim();
      const parsed = parseTemplateSections(activeTemplate.content);
      if (parsed.to) {
        return !mergeTemplate(parsed.to, contact).trim();
      }
      return !contact.email.trim();
    }).length;

    // Subject distribution stats: group by raw pattern, show merged example
    const subjectGroups = new Map<string, { count: number; example: string }>();
    contacts.forEach((contact, index) => {
      const activeTemplate = getTemplateForContact(contact);
      if (!activeTemplate) return;
      const selectedSubject = getSubjectForContactIndex(activeTemplate, index);
      if (selectedSubject) {
        const existing = subjectGroups.get(selectedSubject);
        if (existing) {
          existing.count++;
        } else {
          subjectGroups.set(selectedSubject, {
            count: 1,
            example: mergeTemplate(selectedSubject, contact),
          });
        }
      }
    });

    return {
      invalidEmails,
      duplicateEmailCount,
      templateValidation,
      attachmentWarning,
      emptySubjectCount,
      emptyRecipientCount,
      missingCUHyperloop,
      subjectGroups,
    };
  }, [contacts, attachment, getTemplateForContact]);

  const preview = useMemo(() => {
    if (!selectedContact) return null;
    const activeTemplate = getTemplateForContact(selectedContact);
    if (!activeTemplate) return null;
    const parsed = parseTemplateSections(activeTemplate.content);
    const selectedSubject = getSubjectForContactIndex(activeTemplate, previewIndex);

    const rawBody = mergeTemplate(parsed.body || activeTemplate.content, selectedContact);

    return {
      to: parsed.to ? mergeTemplate(parsed.to, selectedContact) : selectedContact.email,
      subject: selectedSubject ? mergeTemplate(selectedSubject, selectedContact) : "",
      body: formatEmailBodyHtml(rawBody),
      templateName: activeTemplate.name,
    };
  }, [selectedContact, previewIndex, getTemplateForContact]);

  const hasBlockingIssues =
    checks.invalidEmails.length > 0 ||
    checks.templateValidation.errors.length > 0 ||
    checks.emptyRecipientCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Preflight Review</h2>
        <p className="text-slate-400">Review checks before creating Outlook drafts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Validation Checks</h3>
          <ul className="space-y-2 text-sm">
            <li className={checks.invalidEmails.length ? "text-rose-400" : "text-emerald-400"}>
              Invalid emails: {checks.invalidEmails.length}
            </li>
            <li className={checks.duplicateEmailCount ? "text-yellow-500" : "text-emerald-400"}>
              Duplicate emails: {checks.duplicateEmailCount}
            </li>
            <li
              className={
                checks.templateValidation.errors.length ? "text-rose-400" : "text-emerald-400"
              }
            >
              Template errors: {checks.templateValidation.errors.length}
            </li>
            <li
              className={
                checks.templateValidation.warnings.length ? "text-yellow-500" : "text-emerald-400"
              }
            >
              Template warnings: {checks.templateValidation.warnings.length}
            </li>
            <li className={checks.emptySubjectCount > 0 ? "text-yellow-500" : "text-emerald-400"}>
              Empty subjects after merge: {checks.emptySubjectCount}
            </li>
            <li className={checks.emptyRecipientCount > 0 ? "text-rose-400" : "text-emerald-400"}>
              Empty recipients after merge: {checks.emptyRecipientCount}
            </li>
            <li
              className={
                checks.missingCUHyperloop.length > 0 ? "text-yellow-500" : "text-emerald-400"
              }
            >
              Missing "CU Hyperloop" in subject: {checks.missingCUHyperloop.length}
              {checks.missingCUHyperloop.length > 0 && (
                <span className="block text-xs mt-1">
                  Power Automate won't send drafts without "CU Hyperloop" in the subject line.
                </span>
              )}
            </li>
            {checks.attachmentWarning && (
              <li className="text-yellow-500">{checks.attachmentWarning}</li>
            )}
          </ul>
          {/* Per-contact issue details */}
          {checks.templateValidation.contactIssues.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <h4 className="text-xs font-medium text-slate-400 mb-2">
                {checks.templateValidation.contactIssues.length} contact
                {checks.templateValidation.contactIssues.length !== 1 ? "s" : ""} with issues
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {checks.templateValidation.contactIssues.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs bg-slate-900/50 rounded-lg px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200 font-medium truncate">
                          {issue.contact.name}
                        </span>
                        <span className="text-slate-500 truncate">{issue.contact.email}</span>
                        <span className="text-slate-600 flex-shrink-0">({issue.templateName})</span>
                      </div>
                      {issue.errors.map((e, j) => (
                        <div key={`e${j}`} className="text-rose-400 mt-0.5">
                          {e}
                        </div>
                      ))}
                      {issue.warnings.map((w, j) => (
                        <div key={`w${j}`} className="text-yellow-500/80 mt-0.5">
                          {w}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const idx = contacts.findIndex((c) => c.id === issue.contact.id);
                        if (idx >= 0) setPreviewIndex(idx);
                      }}
                      className="text-yellow-500 hover:text-yellow-400 flex-shrink-0 mt-0.5"
                      title="Preview this contact"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subject Distribution */}
          {checks.subjectGroups.size > 1 && (
            <div className="mt-4 pt-3 border-t border-slate-700">
              <h4 className="text-xs font-medium text-slate-400 mb-2">Subject Distribution</h4>
              <div className="space-y-1.5">
                {Array.from(checks.subjectGroups.entries()).map(([, group], i) => {
                  const pct = Math.round((group.count / contacts.length) * 100);
                  const letter = String.fromCharCode(65 + i);
                  const display = group.example || "(empty)";
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-yellow-500/20 text-yellow-500 font-mono font-bold text-[10px] flex-shrink-0">
                        {letter}
                      </span>
                      <span className="text-slate-400 truncate flex-1" title={display}>
                        {display.length > 45 ? `${display.slice(0, 45)}...` : display}
                      </span>
                      <span className="text-slate-500 flex-shrink-0">
                        {group.count} ({pct}%)
                      </span>
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className="h-full bg-yellow-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Recipient Preview</h3>
          {contacts.length > 0 && (
            <select
              value={previewIndex}
              onChange={(event) => setPreviewIndex(Number(event.target.value))}
              className="input-field !py-2"
            >
              {contacts.map((contact, index) => (
                <option key={contact.id} value={index}>
                  {contact.name} ({contact.email})
                </option>
              ))}
            </select>
          )}
          {preview && (
            <div className="space-y-2 text-sm text-slate-300 relative">
              <span className="absolute top-0 right-0 text-xs px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded-lg">
                Template: {preview.templateName}
              </span>
              <p>
                <span className="font-semibold text-slate-200">To:</span> {preview.to}
              </p>
              <p className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">Subject:</span>
                {checks.subjectGroups.size > 1 &&
                  (() => {
                    const activeTemplate = getTemplateForContact(selectedContact);
                    if (!activeTemplate) return null;
                    const subjects = getSubjectsForTemplate(activeTemplate);
                    const variantIndex = previewIndex % subjects.length;
                    const letter = String.fromCharCode(65 + variantIndex);
                    return (
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-yellow-500/20 text-yellow-500 font-mono font-bold text-[9px]">
                        {letter}
                      </span>
                    );
                  })()}
                <span>{preview.subject || "(empty)"}</span>
              </p>
              <div
                className="bg-white border border-slate-300 rounded-lg p-4 max-h-64 overflow-y-auto text-gray-900"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify in PR 1
                dangerouslySetInnerHTML={{ __html: preview.body }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="btn-secondary">
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={hasBlockingIssues}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Draft Creation
        </button>
      </div>
    </div>
  );
};
