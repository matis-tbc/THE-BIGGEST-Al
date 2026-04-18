import DOMPurify from "dompurify";

// Sanitize user/template-derived HTML before rendering in the preview.
// CSV fields flow through mergeTemplate into a raw HTML string; without sanitization
// a malicious merge var like `<img src=x onerror="...">` can reach the renderer and
// call any exposed IPC (including auth:get-tokens). See CSO finding H1.
export const sanitizeEmailHtml = (html: string): string =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
