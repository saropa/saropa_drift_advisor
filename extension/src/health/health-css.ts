/**
 * CSS for the database health-score dashboard webview. Split out of
 * health-html.ts so the builder file stays focused on structure and the
 * per-section HTML helpers.
 */
export function getHealthCss(): string {
  return `
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 16px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .header h1 { margin: 0; font-size: 18px; }
  .btn {
    padding: 4px 12px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover { opacity: 0.9; }
  .btn-group { display: flex; gap: 6px; }
  .overall {
    text-align: center;
    margin-bottom: 28px;
  }
  .overall-grade {
    font-size: 64px;
    font-weight: bold;
    line-height: 1;
  }
  .overall-score {
    font-size: 16px;
    opacity: 0.7;
    margin-top: 4px;
  }
  .grade-a { color: #22c55e; }
  .grade-b { color: #84cc16; }
  .grade-c { color: #eab308; }
  .grade-d { color: #f97316; }
  .grade-f { color: #ef4444; }
  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .card {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 12px;
    transition: border-color 0.15s;
  }
  .card[data-command] {
    cursor: pointer;
  }
  .card[data-command]:hover {
    border-color: var(--vscode-focusBorder);
  }
  .card-header {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
    margin-bottom: 8px;
  }
  .card-score {
    font-size: 24px;
    font-weight: bold;
  }
  .card-grade {
    font-size: 14px;
    font-weight: bold;
    margin-left: 6px;
  }
  .card-summary {
    font-size: 12px;
    opacity: 0.7;
    margin-top: 6px;
  }
  .recs {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 12px;
  }
  .recs h2 {
    font-size: 14px;
    margin: 0 0 10px 0;
  }
  .rec {
    font-size: 12px;
    padding: 4px 0;
    display: flex;
    gap: 8px;
  }
  .rec-icon { flex-shrink: 0; width: 16px; text-align: center; }
  .rec-error .rec-icon { color: #ef4444; }
  .rec-warning .rec-icon { color: #eab308; }
  .rec-info .rec-icon { color: #3b82f6; }
  .rec-metric {
    opacity: 0.5;
    font-size: 11px;
    margin-left: auto;
    white-space: nowrap;
  }
  .card-actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .action-btn {
    padding: 3px 8px;
    font-size: 11px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-radius: 3px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .action-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
  .action-btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  .action-btn.primary:hover {
    opacity: 0.9;
  }
  .rec-action {
    padding: 2px 6px;
    font-size: 10px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-radius: 3px;
    cursor: pointer;
    margin-left: 8px;
    flex-shrink: 0;
  }
  .rec-action:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
  .advisor {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 20px;
    font-size: 12px;
  }
  .advisor h2 { font-size: 14px; margin: 0 0 8px 0; }
  .advisor ul { margin: 6px 0 0 18px; padding: 0; }
  .advisor .advisor-meta { opacity: 0.75; font-size: 11px; margin-top: 8px; }
`;
}
