/**
 * Clipboard Import webview styles.
 * Extracted from clipboard-import-html for modularization (plan: under 300 lines per file).
 */

export function getClipboardImportCss(): string {
  return `
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px;
    line-height: 1.4;
  }
  h2 { margin-top: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 600;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
  }
  .badge.format { background: var(--vscode-statusBarItem-prominentBackground, #007acc); }
  
  .options-panel {
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-radius: 4px; padding: 12px; margin-bottom: 16px;
  }
  .options-header { font-weight: 600; margin-bottom: 8px; }
  .options-row {
    display: flex; gap: 16px; align-items: center; margin-bottom: 8px;
    font-size: 13px; flex-wrap: wrap;
  }
  .options-row label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .checkbox-label { margin-left: auto; }
  
  select, input[type="checkbox"] {
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  select { padding: 4px 8px; }
  
  .section { margin-bottom: 16px; }
  .section-header { font-weight: 600; margin-bottom: 8px; font-size: 13px; }
  
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; padding: 6px 8px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-bottom: 1px solid var(--vscode-panel-border, #444);
  }
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    vertical-align: middle;
  }
  td.sample {
    color: var(--vscode-descriptionForeground, #888);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .mapping-select {
    width: 100%; padding: 4px;
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  .mapping-summary { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-top: 8px; }
  
  .preview-table td { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .truncated { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-top: 8px; }
  .empty { padding: 20px; text-align: center; color: var(--vscode-descriptionForeground, #888); }
  
  .validation-results { margin: 16px 0; }
  .validation-errors { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border-radius: 4px; padding: 12px; margin-bottom: 8px; }
  .validation-warnings { background: var(--vscode-inputValidation-warningBackground, #5a4d1d); border-radius: 4px; padding: 12px; }
  .validation-header { font-weight: 600; margin-bottom: 8px; }
  .validation-results ul { margin: 0; padding-left: 20px; }
  .validation-results li { margin: 4px 0; font-size: 13px; }
  
  .dry-run-results { margin: 16px 0; background: var(--vscode-editor-inactiveSelectionBackground, #333); border-radius: 4px; padding: 12px; }
  .dry-run-header { font-weight: 600; margin-bottom: 8px; }
  .dry-run-summary { display: flex; gap: 16px; margin-bottom: 12px; }
  .stat { padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: 500; }
  .stat.insert { background: var(--vscode-testing-iconPassed, #3c8); color: #000; }
  .stat.update { background: var(--vscode-editorWarning-foreground, #cca700); color: #000; }
  .stat.skip { background: var(--vscode-descriptionForeground, #888); color: #fff; }
  
  .conflicts-preview { margin-top: 12px; }
  .conflicts-header { font-size: 13px; margin-bottom: 8px; }
  .conflicts-table { font-size: 12px; }
  .conflicts-table td { font-family: var(--vscode-editor-font-family, monospace); }
  
  .loading { padding: 20px; text-align: center; font-style: italic; color: var(--vscode-descriptionForeground, #888); }
  .error { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); padding: 12px; border-radius: 4px; margin: 16px 0; }
  .success { background: var(--vscode-testing-iconPassed, #3c8); color: #000; padding: 12px; border-radius: 4px; margin: 16px 0; font-weight: 500; }
  
  .actions {
    display: flex; gap: 8px; margin-top: 16px; padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border, #444);
  }
  .btn {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border: none; padding: 8px 16px; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground, #505357); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    margin-left: auto;
  }
  .btn.primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
`;
}
