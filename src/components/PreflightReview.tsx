import React, { useMemo, useState } from 'react';
import { mergeTemplate, parseTemplateSections, validateTemplate } from '../utils/templateMerge';

interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

interface PreflightReviewProps {
  contacts: Contact[];
  template: Template;
  attachment: File | null;
  onBack: () => void;
  onContinue: () => void;
}

export const PreflightReview: React.FC<PreflightReviewProps> = ({
  contacts,
  template,
  attachment,
  onBack,
  onContinue,
}) => {
  const [previewIndex, setPreviewIndex] = useState(0);
  const selectedContact = contacts[previewIndex] || contacts[0];

  const checks = useMemo(() => {
    const templateValidation = validateTemplate(template.content, contacts);
    const parsed = parseTemplateSections(template.content);
    const invalidEmails = contacts.filter(contact => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email));
    const duplicateEmailCount = (() => {
      const seen = new Set<string>();
      let duplicates = 0;
      contacts.forEach(contact => {
        const key = (contact.email || '').toLowerCase();
        if (!key) return;
        if (seen.has(key)) duplicates += 1;
        seen.add(key);
      });
      return duplicates;
    })();
    const attachmentWarning = attachment && attachment.size > 25 * 1024 * 1024
      ? `Attachment is ${Math.round(attachment.size / (1024 * 1024))}MB; this may slow batch processing.`
      : null;
    const emptySubjectCount = parsed.subject
      ? contacts.filter(contact => !mergeTemplate(parsed.subject || '', contact).trim()).length
      : contacts.length;
    const emptyRecipientCount = contacts.filter(contact => {
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
  }, [contacts, template.content, attachment]);

  const preview = useMemo(() => {
    if (!selectedContact) return null;
    const parsed = parseTemplateSections(template.content);
    return {
      to: parsed.to ? mergeTemplate(parsed.to, selectedContact) : selectedContact.email,
      subject: parsed.subject ? mergeTemplate(parsed.subject, selectedContact) : '',
      body: mergeTemplate(parsed.body || template.content, selectedContact),
    };
  }, [template.content, selectedContact]);

  const hasBlockingIssues =
    checks.invalidEmails.length > 0 ||
    checks.templateValidation.errors.length > 0 ||
    checks.emptyRecipientCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Preflight Review</h2>
        <p className="text-gray-600">Review checks before creating Outlook drafts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Validation Checks</h3>
          <ul className="space-y-2 text-sm">
            <li className={checks.invalidEmails.length ? 'text-red-600' : 'text-green-600'}>
              Invalid emails: {checks.invalidEmails.length}
            </li>
            <li className={checks.duplicateEmailCount ? 'text-yellow-600' : 'text-green-600'}>
              Duplicate emails: {checks.duplicateEmailCount}
            </li>
            <li className={checks.templateValidation.errors.length ? 'text-red-600' : 'text-green-600'}>
              Template errors: {checks.templateValidation.errors.length}
            </li>
            <li className={checks.templateValidation.warnings.length ? 'text-yellow-600' : 'text-green-600'}>
              Template warnings: {checks.templateValidation.warnings.length}
            </li>
            <li className={checks.emptySubjectCount > 0 ? 'text-yellow-600' : 'text-green-600'}>
              Empty subjects after merge: {checks.emptySubjectCount}
            </li>
            <li className={checks.emptyRecipientCount > 0 ? 'text-red-600' : 'text-green-600'}>
              Empty recipients after merge: {checks.emptyRecipientCount}
            </li>
            {checks.attachmentWarning && (
              <li className="text-yellow-600">{checks.attachmentWarning}</li>
            )}
          </ul>
          {checks.templateValidation.errors.length > 0 && (
            <ul className="mt-3 text-xs text-red-700 list-disc list-inside">
              {checks.templateValidation.errors.map(error => <li key={error}>{error}</li>)}
            </ul>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Recipient Preview</h3>
          {contacts.length > 0 && (
            <select
              value={previewIndex}
              onChange={event => setPreviewIndex(Number(event.target.value))}
              className="mb-3 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {contacts.map((contact, index) => (
                <option key={contact.id} value={index}>
                  {contact.name} ({contact.email})
                </option>
              ))}
            </select>
          )}
          {preview && (
            <div className="space-y-2 text-sm text-gray-700">
              <p><span className="font-semibold">To:</span> {preview.to}</p>
              <p><span className="font-semibold">Subject:</span> {preview.subject || '(empty)'}</p>
              <div className="border border-gray-200 rounded-md p-2 max-h-44 overflow-y-auto whitespace-pre-wrap">
                {preview.body}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="btn-secondary">Back</button>
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
