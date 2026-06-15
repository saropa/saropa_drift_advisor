/**
 * Canonical Saropa dashboard design tokens (single source of truth).
 *
 * Implements the token layer of docs/design/SAROPA_DASHBOARD_STYLE_GUIDE.md
 * (§3) so every Drift Advisor webview and HTML export draws from one named
 * palette instead of hand-painted hexes. Two resolution tables, same names:
 *
 *  - getWebviewTokens(): inside a VS Code webview, surfaces/text/borders/status
 *    bind to the host `--vscode-*` theme tokens so the surface follows the
 *    user's chosen light/dark/high-contrast theme. Only the brand accent is a
 *    fixed color (§3.4 — orange is accent-only, never a large text fill).
 *  - getStandaloneTokens(): an emailed / CI-artifact HTML report has no host
 *    theme to inherit, so it ships the §3.6 fallback palette baked in, with a
 *    prefers-color-scheme dark override.
 *
 * Scope of this module is COLOR: surfaces, text, borders, the brand accent and
 * its gradient strip, semantic/status colors, the A–F grade ramp, plus the
 * radius and focus-ring tokens buttons need. It deliberately omits the spacing
 * and type scales — adopting those would reflow existing layouts, which is out
 * of scope for the color/gradient/button pass.
 */

/**
 * The `:root` token block for VS Code webviews. Prepend the returned string to
 * a surface's `<style>` so `var(--status-bad)` etc. resolve. Status colors bind
 * to the editor's own diagnostic colors so severity reads identically to the
 * editor's squiggles (§3.5); each carries a hardcoded fallback for the rare
 * theme that leaves a diagnostic token undefined.
 */
export function getWebviewTokens(): string {
  return `
:root {
  /* Brand — the only fixed colors (§3.4). Accent use only. */
  --brand: #f97316;
  --brand-2: #ea580c;
  --brand-glow: rgba(249,115,22,.22);
  /* Signature 3px banner strip: brand -> brand-2 -> host foreground. */
  --brand-strip: linear-gradient(90deg, var(--brand), var(--brand-2) 55%, var(--vscode-foreground) 100%);

  /* Surfaces — bound to host editor tokens so they follow the theme. */
  --surface-0: var(--vscode-editor-background);
  --surface-1: var(--vscode-editor-background);
  --surface-2: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
  --surface-3: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-sideBar-background));
  --inset: var(--vscode-input-background);

  /* Text */
  --text: var(--vscode-foreground);
  --muted: var(--vscode-descriptionForeground);
  --link: var(--vscode-textLink-foreground);

  /* Borders */
  --border: var(--vscode-widget-border, rgba(127,127,127,.25));
  --border-strong: color-mix(in srgb, var(--vscode-focusBorder) 35%, var(--border));

  /* Semantic / status — bind to the editor's diagnostic colors (§3.5),
     never an invented green/red. Fallbacks are the guide's brand palette. */
  --status-good: var(--vscode-testing-iconPassed, var(--vscode-charts-green, #16a34a));
  --status-bad: var(--vscode-editorError-foreground, #dc2626);
  --accent-critical: var(--vscode-editorError-foreground, #dc2626);
  --accent-high: var(--vscode-editorWarning-foreground, #ea580c);
  --accent-warning: var(--vscode-editorWarning-foreground, #d97706);
  --accent-medium: var(--vscode-editorWarning-foreground, #d97706);
  --accent-info: var(--vscode-editorInfo-foreground, #2563eb);
  --accent-low: var(--vscode-editorInfo-foreground, #2563eb);
  --accent-opinionated: var(--vscode-descriptionForeground, #64748b);

  /* A–F grade ramp (§5.8) — derived from the semantic tokens so a grade reads
     the same hue as the matching severity. A=good, F=bad, C=warning at the mid,
     B/D blended between. No bespoke grade hexes. */
  --grade-a: var(--status-good);
  --grade-b: color-mix(in srgb, var(--status-good) 55%, var(--accent-warning));
  --grade-c: var(--accent-warning);
  --grade-d: var(--accent-high);
  --grade-f: var(--status-bad);

  /* Radius (§3.8) and focus ring (§3.4). */
  --radius-sm: 3px;
  --radius: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;
  --ring: 0 0 0 3px rgba(249,115,22,.32);
}`;
}

/**
 * The §3.6 fallback palette for standalone HTML exports (emailed reports, CI
 * artifacts) that have no host theme to inherit. Same canonical token NAMES as
 * the webview set — only the resolution differs — so the same component CSS
 * serves both. Includes a prefers-color-scheme dark override.
 */
export function getStandaloneTokens(): string {
  return `
:root {
  color-scheme: light dark;
  --brand: #f97316;
  --brand-2: #ea580c;
  --brand-glow: rgba(249,115,22,.18);
  --brand-strip: linear-gradient(90deg, var(--brand), var(--brand-2) 55%, var(--text) 100%);

  --surface-0: #fafaf9;
  --surface-1: #ffffff;
  --surface-2: #f5f5f4;
  --surface-3: #eeeeec;
  --inset: #ffffff;

  --text: #0f172a;
  --muted: #64748b;
  --link: #ea580c;

  --border: #e5e7eb;
  --border-strong: color-mix(in srgb, var(--brand) 35%, var(--border));

  --status-good: #16a34a;
  --status-bad: #dc2626;
  --accent-critical: #dc2626;
  --accent-high: #ea580c;
  --accent-warning: #d97706;
  --accent-medium: #d97706;
  --accent-info: #2563eb;
  --accent-low: #2563eb;
  --accent-opinionated: #64748b;

  --grade-a: var(--status-good);
  --grade-b: color-mix(in srgb, var(--status-good) 55%, var(--accent-warning));
  --grade-c: var(--accent-warning);
  --grade-d: var(--accent-high);
  --grade-f: var(--status-bad);

  --radius-sm: 3px;
  --radius: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;
  --ring: 0 0 0 3px rgba(249,115,22,.32);
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface-0: #0a0f1c;
    --surface-1: #0f172a;
    --surface-2: #1e293b;
    --surface-3: #243044;
    --inset: #0b1220;
    --text: #f1f5f9;
    --muted: #94a3b8;
    --link: #fb923c;
    --border: rgba(148,163,184,.18);
    --brand-glow: rgba(249,115,22,.28);
  }
}`;
}
