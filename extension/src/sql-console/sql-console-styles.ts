/**
 * CSS for the sidebar SQL console webview view (plan 84, work package C).
 *
 * Scaled down from the SQL Notebook panel's stylesheet
 * ([../sql-notebook/sql-notebook-styles.ts](../sql-notebook/sql-notebook-styles.ts)):
 * a sidebar view is roughly 250-350px wide and has no tab bar, no history rail,
 * and no result grid, so the layout is a single vertical stack with no horizontal
 * splits. Everything is expressed in VS Code theme variables so the view matches
 * whichever theme the developer runs, light or dark.
 *
 * The severity colors reuse the injected Saropa design tokens (--status-bad,
 * --accent-warning) that `secureWebviewHtml` stamps into every webview head, with
 * VS Code fallbacks — a raw hex here where a token exists would be a defect.
 *
 * Extracted from the markup file so both stay under the 300-line limit.
 */
export function getSqlConsoleCss(): string {
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 8px;
  }

  /* Single vertical stack — the sidebar is too narrow for any side-by-side. */
  #console { display: flex; flex-direction: column; gap: 6px; }

  /* --- SQL input --- */
  #sql-input {
    width: 100%; min-height: 72px; resize: vertical;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    padding: 6px; border-radius: 3px; outline: none;
  }
  #sql-input:focus { border-color: var(--vscode-focusBorder); }

  /* The Execute button sits directly under the textarea (plan 84 §2) and spans
     the full width, because a narrow sidebar has no room for a button row. */
  #btn-execute {
    width: 100%; padding: 5px 10px; cursor: pointer; border: none;
    border-radius: 3px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-size: var(--vscode-font-size);
  }
  #btn-execute:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  /* Disabled still shows a tooltip naming the reason, so it must stay legible
     rather than fading to the point of looking absent. */
  #btn-execute:disabled { opacity: 0.55; cursor: not-allowed; }

  /* --- Validation icon strip --- */
  /* One row: a severity glyph plus the reason text. Hidden entirely while the
     box is untouched so an empty console is not decorated with an error. */
  #validation {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: 0.9em; line-height: 1.35;
    min-height: 1.35em;
  }
  #validation[hidden] { display: none; }
  .sev-icon { flex: 0 0 auto; font-weight: bold; }
  .sev-text { flex: 1 1 auto; word-break: break-word; }
  /* Three-tier severity vocabulary, matching diagnostic-config.ts. */
  .sev-error .sev-icon,
  .sev-error .sev-text { color: var(--status-bad, var(--vscode-errorForeground)); }
  .sev-warning .sev-icon,
  .sev-warning .sev-text { color: var(--accent-warning, var(--vscode-editorWarning-foreground)); }
  .sev-info .sev-icon,
  .sev-info .sev-text { color: var(--vscode-descriptionForeground); }

  /* --- Confirm-destructive checkbox --- */
  .option-row {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: 0.9em; color: var(--vscode-descriptionForeground);
  }
  .option-row input[type="checkbox"] { margin-top: 2px; flex: 0 0 auto; }
  .option-row label { cursor: pointer; }

  /* --- Status / result / error output --- */
  /* Every action writes here, so no request ever completes without a visible
     outcome in the sidebar itself (not just a toast that can be missed). */
  #output {
    font-size: 0.9em; line-height: 1.4; word-break: break-word;
    padding-top: 4px;
    border-top: 1px solid var(--vscode-widget-border, transparent);
    color: var(--vscode-descriptionForeground);
  }
  #output .out-value {
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-foreground);
  }
  #output .out-error { color: var(--status-bad, var(--vscode-errorForeground)); }
  /* Truncation is a correctness trap, so it is styled as a warning banner rather
     than another line of muted status text. */
  #output .out-truncated {
    display: block; margin-top: 4px; padding: 4px 6px; border-radius: 3px;
    color: var(--accent-warning, var(--vscode-editorWarning-foreground));
    border: 1px solid var(--accent-warning, var(--vscode-editorWarning-foreground));
  }
`;
}
