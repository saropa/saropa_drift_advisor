/**
 * Query Cost panel webview styles.
 * Extracted from query-cost-html for modularization (plan: under 300 lines per file).
 */

export function getQueryCostCss(): string {
  return `
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px;
    line-height: 1.4;
  }
  h2 { margin-top: 0; }
  h3 { margin-top: 20px; margin-bottom: 8px; }
  .toolbar { margin-bottom: 12px; display: flex; gap: 6px; }
  .copy-btn, .run-btn {
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .copy-btn {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
  }
  .copy-btn:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .run-btn {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
  }
  .run-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, #505357);
  }
  .sql-block {
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    padding: 8px 12px;
    border-radius: 4px;
    margin-bottom: 16px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tree { margin-bottom: 16px; }
  .node {
    margin: 4px 0 4px 16px;
    padding: 6px 10px;
    border-radius: 4px;
  }
  .node:first-child { margin-left: 0; }
  .node-detail {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
  }
  .node-search { border-left: 4px solid #28a745; background: rgba(40,167,69,0.08); }
  .node-scan   { border-left: 4px solid #dc3545; background: rgba(220,53,69,0.08); }
  .node-temp   { border-left: 4px solid #e0a800; background: rgba(224,168,0,0.08); }
  .node-other  { border-left: 4px solid var(--vscode-panel-border, #444); }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
    margin-left: 8px;
    font-weight: 600;
  }
  .badge.node-search { color: #28a745; }
  .badge.node-scan   { color: #dc3545; }
  .badge.node-temp   { color: #e0a800; }
  .table-name, .index-name {
    font-size: 11px;
    opacity: 0.6;
    margin-left: 6px;
  }
  .warning {
    padding: 6px 10px;
    margin: 4px 0;
    border-radius: 4px;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .warn-warning { background: rgba(220,53,69,0.08); }
  .warn-info { background: rgba(224,168,0,0.08); }
  .warn-icon { font-size: 14px; }
  .warn-msg { font-size: 13px; }
  .warn-suggestion {
    font-size: 12px;
    opacity: 0.7;
    display: block;
    margin-top: 2px;
  }
  .summary { margin-bottom: 16px; }
  .summary-item {
    padding: 4px 0;
    font-size: 13px;
  }
  .summary-bad { color: #dc3545; }
  .summary-good { color: #28a745; }
  .summary-info { color: #e0a800; }
  .summary-neutral { opacity: 0.7; }
  .suggestion {
    margin: 8px 0;
    padding: 10px 12px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-radius: 4px;
  }
  .suggestion-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .suggestion-impact {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .impact-high { color: #dc3545; background: rgba(220,53,69,0.15); }
  .impact-medium { color: #e0a800; background: rgba(224,168,0,0.15); }
  .impact-low { color: #28a745; background: rgba(40,167,69,0.15); }
  .suggestion-reason {
    font-size: 12px;
    opacity: 0.7;
  }
  .suggestion-sql {
    font-size: 13px;
    display: block;
    margin-bottom: 8px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .suggestion-actions {
    display: flex;
    gap: 6px;
  }
`;
}
