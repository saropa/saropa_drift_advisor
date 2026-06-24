/**
 * CSS for the Drift Advisor Rules configuration webview. Extracted from
 * rules-config-html to keep the builder under the line cap; the HTML builder
 * inlines this string inside its `<style>` element. All colors come from VS Code
 * theme variables so the panel tracks the active editor theme.
 */
export const RULES_CONFIG_STYLES = `
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 16px 20px 32px;
  }
  .header { margin-bottom: 16px; }
  .header h1 { margin: 0 0 4px; font-size: 18px; }
  .subtitle { margin: 0 0 8px; font-size: 12px; opacity: 0.75; max-width: 70ch; }
  .summary { font-size: 12px; opacity: 0.85; }
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 14px 0 18px;
    flex-wrap: wrap;
  }
  .search {
    flex: 1 1 240px;
    min-width: 180px;
    padding: 5px 10px;
    font-size: 12px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 3px;
  }
  .btn {
    padding: 5px 12px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }
  .btn:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .category { margin-bottom: 22px; }
  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.8;
    margin: 0 0 6px;
    border-bottom: 1px solid var(--vscode-widget-border);
    padding-bottom: 4px;
  }
  .category-count {
    font-size: 11px;
    font-weight: 600;
    padding: 0 6px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent-warning) 20%, transparent);
    color: var(--accent-warning);
  }
  .rules-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .rules-table th {
    text-align: left;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    padding: 4px 10px;
  }
  .rules-table td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-widget-border);
    vertical-align: top;
  }
  .th-enabled, .enabled-cell { width: 56px; text-align: center; }
  .enabled-cell { text-align: center; }
  .th-count, .count-cell { width: 70px; }
  .th-sev, .sev-cell { width: 180px; }
  .rule-code { font-family: var(--vscode-editor-font-family, monospace); font-weight: 600; }
  .rule-desc { opacity: 0.7; margin-top: 2px; line-height: 1.4; }
  .rule-disabled .rule-code,
  .rule-disabled .rule-desc { opacity: 0.4; }
  .count { display: inline-block; min-width: 18px; text-align: center; font-weight: 600; }
  .count-warn { color: var(--accent-warning); }
  .count-zero { opacity: 0.4; }
  .sev-select {
    width: 100%;
    padding: 3px 6px;
    font-size: 12px;
    color: var(--vscode-dropdown-foreground);
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border));
    border-radius: 3px;
  }
  .rule-disabled .sev-select { opacity: 0.5; }
  .empty { padding: 32px; text-align: center; opacity: 0.6; }
  .hidden { display: none; }
`;
