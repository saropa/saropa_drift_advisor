/**
 * Data Invariants webview styles.
 * Extracted from invariant-html for modularization (plan: under 300 lines per file).
 */

export function getInvariantStyles(): string {
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
    margin-bottom: 16px;
  }
  .header h1 {
    margin: 0;
    font-size: 18px;
  }
  .btn-group {
    display: flex;
    gap: 8px;
  }
  .btn {
    padding: 6px 12px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
  .btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  .btn.primary:hover {
    opacity: 0.9;
  }
  .summary {
    display: flex;
    gap: 24px;
    padding: 12px 16px;
    border-radius: 4px;
    margin-bottom: 16px;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }
  .summary.status-pass { border-left: 3px solid #22c55e; }
  .summary.status-fail { border-left: 3px solid #ef4444; }
  .summary.status-pending { border-left: 3px solid #eab308; }
  .summary-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .summary-value {
    font-size: 20px;
    font-weight: bold;
  }
  .summary-label {
    font-size: 11px;
    opacity: 0.7;
    text-transform: uppercase;
  }
  .empty {
    text-align: center;
    padding: 48px 24px;
    opacity: 0.8;
  }
  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  .empty h2 {
    margin: 0 0 8px 0;
    font-size: 16px;
  }
  .empty p {
    margin: 4px 0;
    font-size: 13px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 12px;
    background: var(--vscode-editor-background);
  }
  .card.pass { border-left: 3px solid #22c55e; }
  .card.fail { border-left: 3px solid #ef4444; }
  .card.error { border-left: 3px solid #f97316; }
  .card.pending { border-left: 3px solid #eab308; }
  .card.disabled { opacity: 0.5; }
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .status-icon {
    font-size: 14px;
  }
  .card-title {
    font-weight: 600;
    flex: 1;
  }
  .card-table {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
  }
  .card-severity {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }
  .severity-error { background: #ef4444; color: white; }
  .severity-warning { background: #eab308; color: black; }
  .severity-info { background: #3b82f6; color: white; }
  .card-actions {
    display: flex;
    gap: 4px;
  }
  .icon-btn {
    padding: 4px 6px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
  }
  .icon-btn:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .icon-btn.danger:hover {
    background: #ef4444;
    color: white;
  }
  .card-sql {
    background: var(--vscode-textBlockQuote-background);
    padding: 8px;
    border-radius: 3px;
    margin-bottom: 8px;
    overflow-x: auto;
  }
  .card-sql code {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .card-expectation {
    font-size: 11px;
    opacity: 0.7;
    margin-bottom: 8px;
  }
  .result {
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 3px;
  }
  .result.pass { color: #22c55e; }
  .result.fail { color: #ef4444; }
  .result.error { color: #f97316; }
  .result.pending { color: #eab308; }
  .result.disabled { color: var(--vscode-disabledForeground); }
  .violations {
    font-size: 11px;
    opacity: 0.8;
    margin-top: 4px;
    padding-left: 8px;
    border-left: 2px solid #ef4444;
  }
`;
}
