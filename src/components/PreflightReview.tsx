import React, { useMemo, useState } from "react";
import {
  mergeTemplate,
  parseTemplateSections,
  validateTemplate,
  DEFAULT_SUBJECTS,
  formatEmailBodyHtml,
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

    // Validate templates for each contact
    contacts.forEach((contact) => {
      const activeTemplate = getTemplateForContact(contact);
      if (activeTemplate) {
        const validation = validateTemplate(activeTemplate.content, [contact]);
        templateErrors = [...templateErrors, ...validation.errors];
        templateWarnings = [...templateWarnings, ...validation.warnings];
      }
    });

    // Deduplicate
    templateErrors = Array.from(new Set(templateErrors));
    templateWarnings = Array.from(new Set(templateWarnings));

    const templateValidation = {
      errors: templateErrors,
      warnings: templateWarnings,
      isValid: templateErrors.length === 0,
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
    const emptySubjectCount = contacts.filter((contact, index) => {
      const activeTemplate = getTemplateForContact(contact);
      if (!activeTemplate) return false;
      const parsed = parseTemplateSections(activeTemplate.content);
      const availableSubjects = activeTemplate.subjects && activeTemplate.subjects.length > 0
        ? activeTemplate.subjects
        : (parsed.subject ? [parsed.subject] : DEFAULT_SUBJECTS);
      const selectedSubject = availableSubjects[index % availableSubjects.length];

      return selectedSubject
        ? !mergeTemplate(selectedSubject, contact).trim()
        : true;
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

    return {
      invalidEmails,
      duplicateEmailCount,
      templateValidation,
      attachmentWarning,
      emptySubjectCount,
      emptyRecipientCount,
    };
  }, [contacts, templates, defaultTemplateId, attachment]);

  const preview = useMemo(() => {
    if (!selectedContact) return null;
    const activeTemplate = getTemplateForContact(selectedContact);
    if (!activeTemplate) return null;
    const parsed = parseTemplateSections(activeTemplate.content);
    const availableSubjects = activeTemplate.subjects && activeTemplate.subjects.length > 0
      ? activeTemplate.subjects
      : (parsed.subject ? [parsed.subject] : DEFAULT_SUBJECTS);
    const selectedSubject = availableSubjects[previewIndex % availableSubjects.length];

    const rawBody = mergeTemplate(
      parsed.body || activeTemplate.content,
      selectedContact,
    );

    return {
      to: parsed.to
        ? mergeTemplate(parsed.to, selectedContact)
        : selectedContact.email,
      subject: selectedSubject
        ? mergeTemplate(selectedSubject, selectedContact)
        : "",
      body: formatEmailBodyHtml(rawBody),
      templateName: activeTemplate.name,
    };
  }, [selectedContact, templates, defaultTemplateId]);

  const hasBlockingIssues =
    checks.invalidEmails.length > 0 ||
    checks.templateValidation.errors.length > 0 ||
    checks.emptyRecipientCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Preflight Review</h2>
        <p className="text-slate-400">
          Review checks before creating Outlook drafts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">
            Validation Checks
          </h3>
          <ul className="space-y-2 text-sm">
            <li
              className={
                checks.invalidEmails.length
                  ? "text-rose-400"
                  : "text-emerald-400"
              }
            >
              Invalid emails: {checks.invalidEmails.length}
            </li>
            <li
              className={
                checks.duplicateEmailCount
                  ? "text-yellow-500"
                  : "text-emerald-400"
              }
            >
              Duplicate emails: {checks.duplicateEmailCount}
            </li>
            <li
              className={
                checks.templateValidation.errors.length
                  ? "text-rose-400"
                  : "text-emerald-400"
              }
            >
              Template errors: {checks.templateValidation.errors.length}
            </li>
            <li
              className={
                checks.templateValidation.warnings.length
                  ? "text-yellow-500"
                  : "text-emerald-400"
              }
            >
              Template warnings: {checks.templateValidation.warnings.length}
            </li>
            <li
              className={
                checks.emptySubjectCount > 0
                  ? "text-yellow-500"
                  : "text-emerald-400"
              }
            >
              Empty subjects after merge: {checks.emptySubjectCount}
            </li>
            <li
              className={
                checks.emptyRecipientCount > 0
                  ? "text-rose-400"
                  : "text-emerald-400"
              }
            >
              Empty recipients after merge: {checks.emptyRecipientCount}
            </li>
            {checks.attachmentWarning && (
              <li className="text-yellow-500">{checks.attachmentWarning}</li>
            )}
          </ul>
          {checks.templateValidation.errors.length > 0 && (
            <ul className="mt-3 text-xs text-rose-300 list-disc list-inside">
              {checks.templateValidation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">
            Recipient Preview
          </h3>
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
                <span className="font-semibold text-slate-200">To:</span>{" "}
                {preview.to}
              </p>
              <p>
                <span className="font-semibold text-slate-200">Subject:</span>{" "}
                {preview.subject || "(empty)"}
              </p>
              <div
                className="bg-white border border-slate-300 rounded-lg p-4 max-h-64 overflow-y-auto text-gray-900"
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
