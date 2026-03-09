import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  extractVariables,
  mergeTemplate,
  parseTemplateSections,
  validateTemplate,
  DEFAULT_SUBJECTS,
  formatEmailBodyHtml,
} from "../utils/templateMerge";
import { projectStore, StoredTemplate } from "../services/projectStore";
import { EnhancedTemplateEditor } from "./EnhancedTemplateEditor";

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

interface TemplateManagerProps {
  contacts: Contact[];
  onTemplateSelected: (template: Template) => void;
  onBack: () => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  contacts,
  onTemplateSelected,
  onBack,
}) => {
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableVariables = useMemo(() => {
    const variables = new Set<string>();
    contacts.forEach((contact) => {
      Object.keys(contact).forEach((key) => {
        if (key !== "id" && contact[key]) {
          variables.add(key);
        }
      });
    });
    return Array.from(variables);
  }, [contacts]);

  const refreshTemplates = async () => {
    const stored = await projectStore.listTemplates();
    setTemplates(stored);
  };

  useEffect(() => {
    refreshTemplates().catch((err) => {
      console.error("Failed to load templates:", err);
      setError("Failed to load saved templates.");
    });
  }, []);

  const handleNewTemplate = () => {
    setSelectedTemplate(null);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await projectStore.deleteTemplate(templateId);
      await refreshTemplates();
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
    } catch (err) {
      console.error("Failed to delete template:", err);
      setError("Failed to delete template.");
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!selectedTemplate) return;
    try {
      const restored = await projectStore.restoreTemplateVersion(
        selectedTemplate.id,
        versionId,
      );
      if (!restored) return;
      await refreshTemplates();
      setSelectedTemplate({
        id: restored.id,
        name: restored.name,
        subjects: restored.subjects || undefined,
        content: restored.content,
        variables: restored.variables,
      });
    } catch (err) {
      console.error("Failed to restore template version:", err);
      setError("Failed to restore template version.");
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.info(
      "[TemplateManager] Uploading template file:",
      file.name,
      file.size,
      "bytes",
    );

    setIsLoading(true);
    setError(null);

    try {
      const content = await file.text();
      const variables = extractVariables(content);

      const template: StoredTemplate = {
        id: `template-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        subjects: DEFAULT_SUBJECTS,
        content,
        variables,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        versions: [],
      };
      await projectStore.saveTemplate(template);
      await refreshTemplates();
      setSelectedTemplate(template);
    } catch (err) {
      console.error("Template upload error:", err);
      setError("Failed to upload template file.");
    } finally {
      setIsLoading(false);
    }
  };

  const getPreviewContent = (
    template: Template,
  ): { subject?: string; to?: string; body: string } => {
    if (!contacts.length) {
      console.warn("[TemplateManager] No contacts available for preview");
      const parsed = parseTemplateSections(template.content);
      const firstSubject = template.subjects && template.subjects.length > 0 ? template.subjects[0] : (parsed.subject || DEFAULT_SUBJECTS[0]);
      return {
        subject: firstSubject,
        to: parsed.to,
        body: formatEmailBodyHtml(parsed.body || template.content),
      };
    }

    try {
      const sampleContact = contacts[0];
      if (!sampleContact) {
        console.warn("[TemplateManager] No sample contact available");
        const parsed = parseTemplateSections(template.content);
        const firstSubject = template.subjects && template.subjects.length > 0 ? template.subjects[0] : (parsed.subject || DEFAULT_SUBJECTS[0]);
        return {
          subject: firstSubject,
          to: parsed.to,
          body: formatEmailBodyHtml(parsed.body || template.content),
        };
      }

      const parsed = parseTemplateSections(template.content);
      const firstSubject = template.subjects && template.subjects.length > 0 ? template.subjects[0] : (parsed.subject || DEFAULT_SUBJECTS[0]);
      const subject = firstSubject
        ? mergeTemplate(firstSubject, sampleContact)
        : undefined;
      const to = parsed.to
        ? mergeTemplate(parsed.to, sampleContact)
        : undefined;
      const rawBody = mergeTemplate(
        parsed.body || template.content,
        sampleContact,
      );

      return { subject, to, body: formatEmailBodyHtml(rawBody) };
    } catch (err) {
      console.error(
        "[TemplateManager] Failed to build preview",
        err,
        "Contacts:",
        contacts,
      );
      const parsed = parseTemplateSections(template.content);
      const firstSubject = template.subjects && template.subjects.length > 0 ? template.subjects[0] : (parsed.subject || DEFAULT_SUBJECTS[0]);
      return {
        subject: firstSubject,
        to: parsed.to,
        body: formatEmailBodyHtml(parsed.body || template.content),
      };
    }
  };

  const handleContinue = () => {
    if (selectedTemplate) {
      console.info(
        "[TemplateManager] Continuing with template:",
        selectedTemplate.id,
      );
      onTemplateSelected(selectedTemplate);
    }
  };

  const validation = useMemo(() => {
    if (!selectedTemplate) {
      return { isValid: true, errors: [], warnings: [] };
    }
    return validateTemplate(selectedTemplate.content, contacts);
  }, [selectedTemplate, contacts]);

  const unmappedCount = useMemo(() => {
    return contacts.filter(c => !c.templateId).length;
  }, [contacts]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Email Template</h2>
        {unmappedCount > 0 && unmappedCount < contacts.length ? (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-medium text-yellow-500 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
              Fallback Template Required
            </h3>
            <p className="text-sm text-yellow-500/80 mt-1">
              {unmappedCount} of your {contacts.length} contacts are missing a template assignment. Please select a fallback template below to catch these rows.
            </p>
          </div>
        ) : (
          <p className="text-slate-400">
            Create, edit, and save templates directly in-app with variables like{" "}
            {"{{name}}"} and {"{{email}}"}.
          </p>
        )}
        <p className="text-slate-400 mt-2">
          Optional headers: add{" "}
          <span className="font-medium text-slate-300">Subject:</span> and/or{" "}
          <span className="font-medium text-slate-300">To:</span> on the first
          lines, then a blank line, then the email body.
        </p>
      </div>

      {/* Template Upload */}
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
            <label htmlFor="template-upload" className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-slate-200">
                {isLoading ? "Processing..." : "Upload template file"}
              </span>
              <input
                ref={fileInputRef}
                id="template-upload"
                name="template-upload"
                type="file"
                accept=".txt,.md"
                className="sr-only"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </label>
            <p className="mt-1 text-sm text-slate-500">
              Text files (.txt, .md) only
            </p>
          </div>
        </div>
      </div>

      {/* Available Variables */}
      {availableVariables.length > 0 && (
        <div className="bg-blue-900/30 border border-blue-800 rounded-md p-4">
          <h3 className="text-sm font-medium text-blue-300 mb-2">
            Available Variables from Contacts
          </h3>
          <div className="flex flex-wrap gap-2">
            {availableVariables.map((variable) => (
              <span
                key={variable}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-800/50 text-blue-300"
              >
                {`{{${variable}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Template List */}
      {templates.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-200">
            Saved Templates
          </h3>
          {templates.map((template) => (
            <div
              key={template.id}
              className={`border rounded-xl p-4 cursor-pointer transition-colors ${selectedTemplate?.id === template.id
                ? "border-yellow-500 bg-yellow-500/10"
                : "border-slate-700 hover:border-slate-600 bg-slate-800/50"
                }`}
              onClick={() => setSelectedTemplate(template)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-200">
                    {template.name}
                  </h4>
                  <p className="text-sm text-slate-400">
                    {template.variables.length} variables:{" "}
                    {template.variables.map((v) => `{{${v}}}`).join(", ")}
                  </p>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    checked={selectedTemplate?.id === template.id}
                    onChange={() => setSelectedTemplate(template)}
                    className="h-4 w-4 text-yellow-500 focus:ring-yellow-500 border-slate-600 bg-slate-800"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-4">
        {templates.find((item) => item.id === selectedTemplate?.id)?.versions
          .length ? (
          <div className="border border-slate-700 rounded-lg p-3 bg-slate-800/50">
            <p className="text-sm font-medium text-slate-300 mb-2">
              Version History
            </p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {templates
                .find((item) => item.id === selectedTemplate?.id)
                ?.versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-400">
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleRestoreVersion(version.id)}
                      className="text-yellow-500 hover:text-yellow-400 font-medium"
                    >
                      Restore
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end mb-4">
          <button onClick={handleNewTemplate} className="btn-secondary">
            New Template
          </button>
        </div>

        <EnhancedTemplateEditor
          template={selectedTemplate}
          contacts={contacts}
          availableVariables={availableVariables}
          onSave={async (template) => {
            const nextTemplate = {
              ...template,
              versions:
                templates.find((item) => item.id === template.id)?.versions ||
                [],
            };
            await projectStore.saveTemplate(nextTemplate);
            await refreshTemplates();
            setSelectedTemplate(template);
          }}
          onDelete={handleDeleteTemplate}
        />
      </div>

      {/* Template Preview */}
      {selectedTemplate && (
        <div className="card border border-slate-700 rounded-xl p-6">
          <h3 className="text-sm font-medium text-slate-200 mb-4">
            Preview with Sample Contact
          </h3>
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-5 max-h-64 overflow-y-auto">
            {(() => {
              const preview = getPreviewContent(selectedTemplate);
              return (
                <div className="space-y-4 text-sm text-slate-300">
                  {preview.subject && (
                    <div>
                      <span className="font-semibold text-slate-400">
                        Subject:
                      </span>{" "}
                      {preview.subject}
                    </div>
                  )}
                  {preview.to && (
                    <div>
                      <span className="font-semibold text-slate-400">To:</span>{" "}
                      {preview.to}
                    </div>
                  )}
                  <div
                    className="bg-white text-gray-900 p-4 rounded-lg text-base border border-slate-300 shadow-sm"
                    dangerouslySetInnerHTML={{ __html: preview.body }}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="bg-yellow-900/30 border border-yellow-800 rounded-md p-4">
          <h3 className="text-sm font-medium text-yellow-300">
            Template Checks
          </h3>
          {validation.errors.length > 0 && (
            <ul className="mt-2 text-sm text-yellow-300 list-disc list-inside">
              {validation.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {validation.warnings.length > 0 && (
            <ul className="mt-2 text-sm text-yellow-400 list-disc list-inside">
              {validation.warnings.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-300"
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
              <p className="text-sm text-red-200">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button onClick={onBack} className="btn-secondary">
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!selectedTemplate || !validation.isValid}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue with Template
        </button>
      </div>
    </div>
  );
};
