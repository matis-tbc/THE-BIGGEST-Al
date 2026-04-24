import DOMPurify from "dompurify";

// Sanitize user/template-derived HTML before rendering in the preview.
// CSV fields flow through mergeTemplate into a raw HTML string; without
// sanitization a malicious merge var like `<img src=x onerror="...">` can
// reach the renderer and call any exposed IPC (including auth:get-tokens).
// See CSO finding H1.
//
// We explicitly keep the `style` attribute so the CU Hyperloop / CU Boulder
// gold signature (rendered by `formatEmailBodyHtml`) survives sanitization.
// Default html profile already includes `style`, but some DOMPurify versions
// strip it under CSP-like conditions; this makes intent explicit.
export const sanitizeEmailHtml = (html: string): string =>
  DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["style"],
  });
