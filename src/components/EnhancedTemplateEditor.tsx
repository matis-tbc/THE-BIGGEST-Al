import React, { useState, useRef, useEffect } from "react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Type,
  Code,
  Eye,
  Download,
  Upload,
  Tag,
  X,
  Search,
  Filter,
  Save,
  Trash2,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  extractVariables,
  mergeTemplate,
  parseTemplateSections,
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
  category?: string;
  tags?: string[];
}

interface EnhancedTemplateEditorProps {
  template: Template | null;
  contacts: Contact[];
  availableVariables: string[];
  onSave: (template: Template) => Promise<void>;
  onDelete?: (templateId: string) => Promise<void>;
  onExport?: (template: Template) => void;
  onImport?: (file: File) => Promise<void>;
}

type EditorMode = "visual" | "raw" | "preview";

export const EnhancedTemplateEditor: React.FC<EnhancedTemplateEditorProps> = ({
  template,
  contacts,
  availableVariables,
  onSave,
  onDelete,
  onExport,
  onImport,
}) => {
  const [editorMode, setEditorMode] = useState<EditorMode>("visual");
  const [templateName, setTemplateName] = useState(template?.name || "");
  const [templateCategory, setTemplateCategory] = useState(
    template?.category || "",
  );
  const [templateTags, setTemplateTags] = useState<string[]>(
    template?.tags || [],
  );
  const [currentTag, setCurrentTag] = useState("");
  const [visualSubjects, setVisualSubjects] = useState<string[]>([]);
  const [visualTo, setVisualTo] = useState("");
  const [visualBody, setVisualBody] = useState("");
  const [rawContent, setRawContent] = useState(template?.content || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Removed unused state variables: isExpanded, showVariables
  const [searchTerm, setSearchTerm] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Default variables that are always available
  const defaultVariables = [
    "name",
    "email",
    "company",
    "phone",
    "address",
    "position",
    "department",
  ];

  // Initialize content from template
  useEffect(() => {
    if (template) {
      setTemplateName(template.name);
      setTemplateCategory(template.category || "");
      setTemplateTags(template.tags || []);
      setRawContent(template.content);

      const parsed = parseTemplateSections(template.content);
      // Support legacy single subject or new subjects array
      const initialSubjects = template.subjects || (parsed.subject ? [parsed.subject] : [""]);
      setVisualSubjects(initialSubjects.length > 0 ? initialSubjects : [""]);
      setVisualTo(parsed.to || "");
      setVisualBody(parsed.body || template.content);
    } else {
      setTemplateName("");
      setTemplateCategory("");
      setTemplateTags([]);
      setVisualSubjects([""]);
      setVisualTo("");
      setVisualBody("");
      setRawContent("");
    }
  }, [template]);

  const handleInsertVariable = (variable: string) => {
    const variableText = `{{${variable}}}`;

    if (editorMode === "visual") {
      const textarea = bodyTextareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText =
          visualBody.substring(0, start) +
          variableText +
          visualBody.substring(end);
        setVisualBody(newText);

        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(
            start + variableText.length,
            start + variableText.length,
          );
        }, 0);
      }
    } else {
      const textarea = rawTextareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText =
          rawContent.substring(0, start) +
          variableText +
          rawContent.substring(end);
        setRawContent(newText);

        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(
            start + variableText.length,
            start + variableText.length,
          );
        }, 0);
      }
    }
  };

  const handleFormatText = (
    format: "bold" | "italic" | "list" | "orderedList" | "heading",
  ) => {
    if (editorMode !== "visual") return;

    const textarea = bodyTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = visualBody.substring(start, end);

    let formattedText = "";
    switch (format) {
      case "bold":
        formattedText = `**${selectedText}**`;
        break;
      case "italic":
        formattedText = `*${selectedText}*`;
        break;
      case "list":
        formattedText = selectedText ? `- ${selectedText}` : "- ";
        break;
      case "orderedList":
        formattedText = selectedText ? `1. ${selectedText}` : "1. ";
        break;
      case "heading":
        formattedText = selectedText ? `# ${selectedText}` : "# ";
        break;
    }

    const newText =
      visualBody.substring(0, start) +
      formattedText +
      visualBody.substring(end);
    setVisualBody(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + formattedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const getCurrentContent = (): string => {
    if (editorMode === "visual") {
      const parts = [];
      const primarySubject = visualSubjects[0];
      if (primarySubject) parts.push(`Subject: ${primarySubject}`);
      if (visualTo) parts.push(`To: ${visualTo}`);
      if (visualBody) parts.push(visualBody);
      return parts.join("\n\n");
    }
    return rawContent;
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      setError("Template name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const content = getCurrentContent();
      const variables = extractVariables(content);

      const updatedTemplate: Template = {
        id: template?.id || `template-${Date.now()}`,
        name: templateName.trim(),
        subjects: visualSubjects.filter(s => s.trim().length > 0),
        content,
        variables,
        category: templateCategory.trim() || undefined,
        tags: templateTags.length > 0 ? templateTags : undefined,
      };

      await onSave(updatedTemplate);
      setSuccess("Template saved successfully!");

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!template || !onDelete) return;

    if (window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      try {
        await onDelete(template.id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete template",
        );
      }
    }
  };

  const handleExport = () => {
    if (!template || !onExport) return;

    const content = getCurrentContent();
    const exportTemplate: Template = {
      ...template,
      content,
      variables: extractVariables(content),
    };

    onExport(exportTemplate);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onImport) return;

    onImport(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAddTag = () => {
    if (!currentTag.trim()) return;

    const tag = currentTag.trim().toLowerCase();
    if (!templateTags.includes(tag)) {
      setTemplateTags([...templateTags, tag]);
    }
    setCurrentTag("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTemplateTags(templateTags.filter((tag) => tag !== tagToRemove));
  };

  const getPreviewContent = () => {
    const content = getCurrentContent();

    if (!contacts.length) {
      const parsed = parseTemplateSections(content);
      return {
        subject: parsed.subject,
        to: parsed.to,
        body: parsed.body || content,
      };
    }

    try {
      const sampleContact = contacts[0];
      const parsed = parseTemplateSections(content);
      const subject = parsed.subject
        ? mergeTemplate(parsed.subject, sampleContact)
        : undefined;
      const to = parsed.to
        ? mergeTemplate(parsed.to, sampleContact)
        : undefined;
      const body = mergeTemplate(parsed.body || content, sampleContact);

      return { subject, to, body };
    } catch (err) {
      console.error("Failed to build preview", err);
      const parsed = parseTemplateSections(content);
      return {
        subject: parsed.subject,
        to: parsed.to,
        body: parsed.body || content,
      };
    }
  };

  const preview = getPreviewContent();
  const allVariables = Array.from(
    new Set([...defaultVariables, ...availableVariables, ...templateTags]),
  );
  const filteredVariables = allVariables.filter((variable) =>
    variable.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleAddSubject = () => {
    setVisualSubjects([...visualSubjects, ""]);
  };

  const handleUpdateSubject = (index: number, value: string) => {
    const newSubjects = [...visualSubjects];
    newSubjects[index] = value;
    setVisualSubjects(newSubjects);
  };

  const handleRemoveSubject = (index: number) => {
    if (visualSubjects.length > 1) {
      setVisualSubjects(visualSubjects.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="card !p-0 hidden-scrollbar overflow-hidden rounded-2xl" ref={containerRef}>
      {/* Header */}
      <div className="bg-slate-800/80 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-yellow-500/10 p-2 rounded-xl">
              <Sparkles className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {template ? "Edit Template" : "Create Template"}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                Design email templates with variables and formatting
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onImport && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.txt,.md"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  <span>Import</span>
                </button>
              </>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary"
            >
              <Save className="h-4 w-4 mr-2" />
              <span>{isSaving ? "Saving..." : "Save Template"}</span>
            </button>

            {onExport && template && (
              <button onClick={handleExport} className="btn-secondary">
                <Download className="h-4 w-4 mr-2" />
                <span>Export</span>
              </button>
            )}
            {onDelete && template && (
              <button
                onClick={handleDelete}
                className="btn-secondary !text-rose-400 !border-rose-500/30 hover:!bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {(error || success) && (
        <div className="px-6 py-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">
              {success}
            </div>
          )}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Template Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center">
              <span>Template Name</span>
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-white focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 transition-all duration-200 outline-none"
              placeholder="Spring Campaign Introduction"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Category
            </label>
            <div className="relative">
              <input
                type="text"
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-white focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 transition-all duration-200 outline-none"
                placeholder="Marketing, Onboarding, etc."
              />
              <div className="absolute right-3 top-3">
                <Filter className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Tags</label>
            <span className="text-xs text-gray-500">
              {templateTags.length} tags
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Tags become available as variables in your template.
          </p>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
            {templateTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium"
              >
                <Tag className="h-3 w-3" />
                <span>{tag}</span>
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 text-cyan-500/70 hover:text-cyan-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={currentTag}
                onChange={(e) => setCurrentTag(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-800 text-white focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 transition-all duration-200 outline-none text-sm"
                placeholder="Add tag..."
              />
              <button
                onClick={handleAddTag}
                className="p-1.5 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <Plus className="h-3 w-3 text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Editor Mode Tabs */}
        <div className="border-b border-gray-100">
          <div className="flex space-x-1">
            {(["visual", "raw", "preview"] as EditorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setEditorMode(mode)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-t-lg text-sm font-medium transition-all duration-200 ${editorMode === mode
                  ? "bg-slate-800 border-t border-x border-slate-600 text-yellow-500 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
              >
                {mode === "visual" && <Type className="h-4 w-4" />}
                {mode === "raw" && <Code className="h-4 w-4" />}
                {mode === "preview" && <Eye className="h-4 w-4" />}
                <span className="capitalize">{mode} Editor</span>
              </button>
            ))}
          </div>
        </div>

        {/* Variable Picker */}
        {allVariables.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-600 bg-gray-800">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-400">
                Available Variables (click to insert)
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter variables..."
                  className="pl-8 pr-2 py-1 text-xs border border-gray-600 rounded bg-gray-900 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
                />
              </div>
            </div>
            {filteredVariables.length > 0 ? (
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1">
                {filteredVariables.map((variable) => (
                  <button
                    key={variable}
                    onClick={() => handleInsertVariable(variable)}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-900/30 text-blue-300 hover:bg-blue-800"
                  >
                    {`{{${variable}}}`}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic py-2">
                No variables match your search.
              </div>
            )}
          </div>
        )}

        {/* Visual Editor Content */}
        {editorMode === "visual" && (
          <div className="border border-gray-600 rounded-xl overflow-hidden bg-slate-900">
            {/* Template Headers */}
            <div className="bg-slate-800/80 border-b border-gray-600 px-4 py-3 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Subject Lines (A/B Testing)</label>
                  <button onClick={handleAddSubject} className="text-xs text-yellow-500 hover:text-yellow-400 flex items-center">
                    <Plus className="h-3 w-3 mr-1" /> Add Subject Option
                  </button>
                </div>
                <div className="space-y-2">
                  {visualSubjects.map((subject, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 w-5">{(index + 1).toString().padStart(2, '0')}.</span>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => handleUpdateSubject(index, e.target.value)}
                        placeholder="Enter subject line..."
                        className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-colors"
                      />
                      {visualSubjects.length > 1 && (
                        <button onClick={() => handleRemoveSubject(index)} className="text-slate-500 hover:text-rose-400 p-1">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Distribution pattern hint */}
                {visualSubjects.length > 1 && (
                  <div className="bg-slate-900/50 rounded-lg px-3 py-2 mt-1">
                    <p className="text-xs text-slate-500">
                      Subjects alternate evenly: Contact #1 gets Subject 01, #2 gets Subject 02, etc.
                      {contacts.length > 0 && (
                        <span className="text-slate-400 ml-1">
                          With {contacts.length} contacts:{" "}
                          {visualSubjects.map((_, i) => {
                            const count = Math.floor(contacts.length / visualSubjects.length) + (i < contacts.length % visualSubjects.length ? 1 : 0);
                            return `Subject ${(i + 1).toString().padStart(2, "0")} = ${count}`;
                          }).join(", ")}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center">
                <span className="text-slate-400 font-mono text-sm w-16">To:</span>
                <input
                  type="text"
                  value={visualTo}
                  onChange={(e) => setVisualTo(e.target.value)}
                  placeholder="{{email}}"
                  className="flex-1 bg-transparent border-0 focus:ring-0 text-slate-200 placeholder-slate-600 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Editor Content Box */}
        <div className="border border-gray-600 rounded-xl overflow-hidden mt-4">
          {editorMode === "visual" && (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <button
                  onClick={() => handleFormatText("bold")}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Bold"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleFormatText("italic")}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Italic"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <div className="w-px h-6 bg-gray-200" />
                <button
                  onClick={() => handleFormatText("heading")}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Heading"
                >
                  <Type className="h-4 w-4" />
                </button>
                <div className="w-px h-6 bg-gray-200" />
                <button
                  onClick={() => handleFormatText("list")}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Bullet List"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleFormatText("orderedList")}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Numbered List"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
              </div>
              <textarea
                ref={bodyTextareaRef}
                value={visualBody}
                onChange={(e) => setVisualBody(e.target.value)}
                rows={12}
                className="w-full border-0 focus:ring-0 resize-none text-base leading-relaxed font-mono min-h-[300px] p-4 bg-slate-900 text-slate-100 overflow-y-auto outline-none"
                placeholder="Write your email body here..."
              />
            </div>
          )}
          {editorMode === "raw" && (
            <textarea
              ref={rawTextareaRef}
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              rows={20}
              className="w-full border-0 focus:ring-0 outline-none resize-none font-mono text-sm p-4 min-h-[400px] bg-slate-900 text-slate-100 overflow-y-auto"
              placeholder="Subject: Welcome {{name}}\nTo: {{email}}\n\nHello {{name}}..."
            />
          )}
          {editorMode === "preview" && (
            <div className="p-6 space-y-4 bg-slate-900 text-slate-100">
              <h3 className="text-lg font-semibold text-white">
                Preview with Sample Contact
              </h3>
              <div className="bg-slate-800 rounded-lg p-4 space-y-3">
                {preview.subject && (
                  <div>
                    <span className="font-medium text-slate-400">Subject:</span>{" "}
                    {preview.subject}
                  </div>
                )}
                {preview.to && (
                  <div>
                    <span className="font-medium text-slate-400">To:</span>{" "}
                    {preview.to}
                  </div>
                )}
                <div className="whitespace-pre-wrap text-slate-200 bg-slate-900/50 p-3 rounded border border-slate-700 max-h-96 overflow-y-auto">
                  {preview.body}
                </div>
              </div>
              <div className="text-sm text-slate-500">
                Using contact:{" "}
                {contacts[0]
                  ? `${contacts[0].name} (${contacts[0].email})`
                  : "No contacts available"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
