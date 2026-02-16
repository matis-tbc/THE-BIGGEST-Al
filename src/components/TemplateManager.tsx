import React, { useMemo, useRef, useState, useEffect } from 'react';
import { extractVariables, mergeTemplate, parseTemplateSections, validateTemplate } from '../utils/templateMerge';
import { projectStore, StoredTemplate } from '../services/projectStore';

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

interface TemplateManagerProps {
  contacts: Contact[];
  onTemplateSelected: (template: Template) => void;
  onBack: () => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ 
  contacts, 
  onTemplateSelected, 
  onBack 
}) => {
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorSubject, setEditorSubject] = useState('');
  const [editorTo, setEditorTo] = useState('');
  const [editorBody, setEditorBody] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const [rawContent, setRawContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableVariables = useMemo(() => {
    const variables = new Set<string>();
    contacts.forEach(contact => {
      Object.keys(contact).forEach(key => {
        if (key !== 'id' && contact[key]) {
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
    refreshTemplates().catch(err => {
      console.error('Failed to load templates:', err);
      setError('Failed to load saved templates.');
    });
  }, []);

  const buildContentFromStructuredFields = () => {
    const headers: string[] = [];
    if (editorSubject.trim()) {
      headers.push(`Subject: ${editorSubject.trim()}`);
    }
    if (editorTo.trim()) {
      headers.push(`To: ${editorTo.trim()}`);
    }

    const body = editorBody.trimEnd();
    if (headers.length === 0) {
      return body;
    }
    return `${headers.join('\n')}\n\n${body}`;
  };

  const loadTemplateIntoEditor = (template: Template) => {
    const parsed = parseTemplateSections(template.content);
    setEditorName(template.name);
    setEditorSubject(parsed.subject || '');
    setEditorTo(parsed.to || '');
    setEditorBody(parsed.body || '');
    setRawContent(template.content);
  };

  const setTemplateAndEditor = (template: Template | null) => {
    setSelectedTemplate(template);
    if (!template) {
      setEditorName('');
      setEditorSubject('');
      setEditorTo('');
      setEditorBody('');
      setRawContent('');
      return;
    }
    loadTemplateIntoEditor(template);
  };

  const createTemplateFromEditor = (): Template => {
    const content = rawMode ? rawContent : buildContentFromStructuredFields();
    const variables = extractVariables(content);
    return {
      id: selectedTemplate?.id || `template-${Date.now()}`,
      name: editorName.trim() || 'Untitled Template',
      content,
      variables,
    };
  };

  const handleNewTemplate = () => {
    setTemplateAndEditor(null);
    setRawMode(false);
    setEditorName(`Template ${templates.length + 1}`);
  };

  const handleSaveTemplate = async () => {
    try {
      setError(null);
      const nextTemplate = createTemplateFromEditor();
      const persisted = await projectStore.saveTemplate({
        ...nextTemplate,
        versions: (templates.find(template => template.id === nextTemplate.id)?.versions) || [],
      });
      await refreshTemplates();
      setSelectedTemplate({
        id: persisted.id,
        name: persisted.name,
        content: persisted.content,
        variables: persisted.variables,
      });
      loadTemplateIntoEditor({
        id: persisted.id,
        name: persisted.name,
        content: persisted.content,
        variables: persisted.variables,
      });
    } catch (err) {
      console.error('Failed to save template:', err);
      setError('Failed to save template.');
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    try {
      await projectStore.deleteTemplate(selectedTemplate.id);
      await refreshTemplates();
      setTemplateAndEditor(null);
    } catch (err) {
      console.error('Failed to delete template:', err);
      setError('Failed to delete template.');
    }
  };

  const handleDuplicateTemplate = async () => {
    if (!selectedTemplate) return;
    const duplicate: Template = {
      ...selectedTemplate,
      id: `template-${Date.now()}`,
      name: `${selectedTemplate.name} Copy`,
    };
    try {
      const persisted = await projectStore.saveTemplate({
        ...duplicate,
        versions: [],
      });
      await refreshTemplates();
      setTemplateAndEditor({
        id: persisted.id,
        name: persisted.name,
        content: persisted.content,
        variables: persisted.variables,
      });
    } catch (err) {
      console.error('Failed to duplicate template:', err);
      setError('Failed to duplicate template.');
    }
  };

  const handleCreateVersion = async () => {
    if (!selectedTemplate) return;
    try {
      const content = rawMode ? rawContent : buildContentFromStructuredFields();
      const updated = await projectStore.createTemplateVersion(selectedTemplate.id, content);
      if (!updated) return;
      await refreshTemplates();
      setSelectedTemplate({
        id: updated.id,
        name: updated.name,
        content: updated.content,
        variables: updated.variables,
      });
    } catch (err) {
      console.error('Failed to create template version:', err);
      setError('Failed to create template version.');
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!selectedTemplate) return;
    try {
      const restored = await projectStore.restoreTemplateVersion(selectedTemplate.id, versionId);
      if (!restored) return;
      await refreshTemplates();
      setTemplateAndEditor({
        id: restored.id,
        name: restored.name,
        content: restored.content,
        variables: restored.variables,
      });
    } catch (err) {
      console.error('Failed to restore template version:', err);
      setError('Failed to restore template version.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.info('[TemplateManager] Uploading template file:', file.name, file.size, 'bytes');

    setIsLoading(true);
    setError(null);

    try {
      const content = await file.text();
      const variables = extractVariables(content);
      
      const template: StoredTemplate = {
        id: `template-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        content,
        variables,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        versions: [],
      };
      await projectStore.saveTemplate(template);
      await refreshTemplates();
      setTemplateAndEditor(template);
    } catch (err) {
      console.error('Template upload error:', err);
      setError('Failed to upload template file.');
    } finally {
      setIsLoading(false);
    }
  };

  const getPreviewContent = (template: Template): { subject?: string; to?: string; body: string } => {
    if (!contacts.length) {
      console.warn('[TemplateManager] No contacts available for preview');
      const parsed = parseTemplateSections(template.content);
      return {
        subject: parsed.subject,
        to: parsed.to,
        body: parsed.body || template.content
      };
    }

    try {
      const sampleContact = contacts[0];
      if (!sampleContact) {
        console.warn('[TemplateManager] No sample contact available');
        const parsed = parseTemplateSections(template.content);
        return {
          subject: parsed.subject,
          to: parsed.to,
          body: parsed.body || template.content
        };
      }

      const parsed = parseTemplateSections(template.content);
      const subject = parsed.subject ? mergeTemplate(parsed.subject, sampleContact) : undefined;
      const to = parsed.to ? mergeTemplate(parsed.to, sampleContact) : undefined;
      const body = mergeTemplate(parsed.body || template.content, sampleContact);

      return { subject, to, body };
    } catch (err) {
      console.error('[TemplateManager] Failed to build preview', err, 'Contacts:', contacts);
      const parsed = parseTemplateSections(template.content);
      return {
        subject: parsed.subject,
        to: parsed.to,
        body: parsed.body || template.content
      };
    }
  };

  const handleContinue = () => {
    if (selectedTemplate) {
      const content = rawMode ? rawContent : buildContentFromStructuredFields();
      const template = {
        ...selectedTemplate,
        content,
        variables: extractVariables(content),
      };
      console.info('[TemplateManager] Continuing with template:', selectedTemplate.id);
      onTemplateSelected(template);
    }
  };

  const validation = useMemo(() => {
    if (!selectedTemplate) {
      return { isValid: true, errors: [], warnings: [] };
    }
    const currentContent = rawMode ? rawContent : buildContentFromStructuredFields();
    return validateTemplate(currentContent, contacts);
  }, [selectedTemplate, rawMode, rawContent, editorSubject, editorTo, editorBody, contacts]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Template</h2>
        <p className="text-gray-600">
          Create, edit, and save templates directly in-app with variables like {'{{name}}'} and {'{{email}}'}.
        </p>
        <p className="text-gray-600 mt-2">
          Optional headers: add <span className="font-medium">Subject:</span> and/or <span className="font-medium">To:</span> on the first lines,
          then a blank line, then the email body.
        </p>
      </div>

      {/* Template Upload */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="mt-4">
            <label htmlFor="template-upload" className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-gray-900">
                {isLoading ? 'Processing...' : 'Upload template file'}
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
            <p className="mt-1 text-sm text-gray-500">
              Text files (.txt, .md) only
            </p>
          </div>
        </div>
      </div>

      {/* Available Variables */}
      {availableVariables.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Available Variables from Contacts</h3>
          <div className="flex flex-wrap gap-2">
            {availableVariables.map(variable => (
              <span key={variable} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {`{{${variable}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Template List */}
      {templates.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Saved Templates</h3>
          {templates.map(template => (
            <div
              key={template.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedTemplate?.id === template.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setTemplateAndEditor(template)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{template.name}</h4>
                  <p className="text-sm text-gray-500">
                    {template.variables.length} variables: {template.variables.map(v => `{{${v}}}`).join(', ')}
                  </p>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    checked={selectedTemplate?.id === template.id}
                    onChange={() => setTemplateAndEditor(template)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Template Editor</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleNewTemplate} className="btn-secondary">New</button>
            <button onClick={handleSaveTemplate} className="btn-secondary">Save</button>
            <button onClick={handleDuplicateTemplate} disabled={!selectedTemplate} className="btn-secondary disabled:opacity-50">Duplicate</button>
            <button onClick={handleDeleteTemplate} disabled={!selectedTemplate} className="btn-secondary disabled:opacity-50">Delete</button>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Template Name</span>
          <input
            value={editorName}
            onChange={event => setEditorName(event.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="Spring Intro Campaign"
          />
        </label>

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={rawMode} onChange={event => setRawMode(event.target.checked)} />
            Raw text mode
          </label>
          <button onClick={handleCreateVersion} disabled={!selectedTemplate} className="btn-secondary disabled:opacity-50">
            Save Version
          </button>
        </div>

        {rawMode ? (
          <textarea
            value={rawContent}
            onChange={event => setRawContent(event.target.value)}
            rows={12}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
            placeholder="Subject: Welcome {{name}}\nTo: {{email}}\n\nHello {{name}}..."
          />
        ) : (
          <div className="space-y-3">
            <input
              value={editorSubject}
              onChange={event => setEditorSubject(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Subject (optional)"
            />
            <input
              value={editorTo}
              onChange={event => setEditorTo(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="To (optional, defaults to contact email)"
            />
            <textarea
              value={editorBody}
              onChange={event => setEditorBody(event.target.value)}
              rows={10}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Email body..."
            />
          </div>
        )}

        {selectedTemplate && templates.find(item => item.id === selectedTemplate.id)?.versions.length ? (
          <div className="border border-gray-200 rounded-md p-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Version History</p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {templates.find(item => item.id === selectedTemplate.id)?.versions.map(version => (
                <div key={version.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{new Date(version.createdAt).toLocaleString()}</span>
                  <button onClick={() => handleRestoreVersion(version.id)} className="text-primary-600 hover:text-primary-500">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Template Preview */}
      {selectedTemplate && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Preview with Sample Contact</h3>
          <div className="bg-white border border-gray-200 rounded p-4 max-h-64 overflow-y-auto">
            {(() => {
              const preview = getPreviewContent({
                ...selectedTemplate,
                content: rawMode ? rawContent : buildContentFromStructuredFields(),
              });
              return (
                <div className="space-y-3 text-sm text-gray-700">
                  {preview.subject && (
                    <div>
                      <span className="font-semibold text-gray-800">Subject:</span> {preview.subject}
                    </div>
                  )}
                  {preview.to && (
                    <div>
                      <span className="font-semibold text-gray-800">To:</span> {preview.to}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{preview.body}</div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-yellow-800">Template Checks</h3>
          {validation.errors.length > 0 && (
            <ul className="mt-2 text-sm text-yellow-900 list-disc list-inside">
              {validation.errors.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
          {validation.warnings.length > 0 && (
            <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
              {validation.warnings.slice(0, 4).map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="btn-secondary"
        >
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
