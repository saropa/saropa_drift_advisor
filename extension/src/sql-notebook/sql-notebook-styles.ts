/**
 * CSS styles for the SQL Notebook webview, using VS Code theme variables
 * for seamless light/dark theme integration.
 *
 * Extracted to keep {@link sql-notebook-html.ts} under the 300-line limit.
 */
export function getNotebookCss(): string {
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow: hidden; height: 100vh;
  }
  #app { display: flex; flex-direction: column; height: 100vh; }

  /* --- Tab Bar --- */
  #tab-bar {
    display: flex; align-items: center; gap: 2px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    padding: 0 4px; min-height: 35px;
  }
  .tab {
    padding: 6px 12px; cursor: pointer; border: none; background: none;
    color: var(--vscode-tab-inactiveForeground);
    border-bottom: 2px solid transparent; white-space: nowrap;
    display: flex; align-items: center; gap: 6px;
  }
  .tab.active {
    color: var(--vscode-tab-activeForeground);
    border-bottom-color: var(--vscode-tab-activeBorderTop, var(--vscode-focusBorder));
  }
  .tab .close-tab {
    font-size: 14px; opacity: 0.6; cursor: pointer; border: none;
    background: none; color: inherit; padding: 0 2px;
  }
  .tab .close-tab:hover { opacity: 1; }
  #add-tab {
    border: none; background: none; color: var(--vscode-foreground);
    font-size: 18px; cursor: pointer; padding: 4px 8px; opacity: 0.7;
  }
  #add-tab:hover { opacity: 1; }

  /* --- Main Layout --- */
  #main-area { display: flex; flex: 1; overflow: hidden; }
  #editor-area { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

  /* --- SQL Input --- */
  .sql-input-wrap { position: relative; padding: 8px; }
  #sql-input {
    width: 100%; min-height: 80px; max-height: 200px; resize: vertical;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    padding: 8px; border-radius: 3px; outline: none;
  }
  #sql-input:focus { border-color: var(--vscode-focusBorder); }

  /* --- Autocomplete --- */
  .autocomplete-dropdown {
    position: absolute; z-index: 100; max-height: 200px; overflow-y: auto;
    background: var(--vscode-editorSuggestWidget-background);
    border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-widget-border));
    border-radius: 3px; min-width: 200px; left: 8px; top: 100%;
    box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0,0,0,.3));
  }
  .ac-item {
    padding: 4px 8px; cursor: pointer; display: flex;
    justify-content: space-between; align-items: center;
  }
  .ac-item:hover, .ac-selected {
    background: var(--vscode-editorSuggestWidget-selectedBackground);
    color: var(--vscode-editorSuggestWidget-selectedForeground, inherit);
  }
  .ac-type {
    font-size: 0.85em; opacity: 0.7; margin-left: 12px;
    color: var(--vscode-descriptionForeground);
  }

  /* --- Toolbar --- */
  .toolbar { display: flex; gap: 6px; padding: 0 8px 8px 8px; flex-wrap: wrap; }
  .toolbar button {
    padding: 4px 12px; cursor: pointer; border: none; border-radius: 3px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    font-size: var(--vscode-font-size);
  }
  .toolbar button:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .toolbar button:disabled { opacity: 0.5; cursor: default; }
  #btn-execute {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  #btn-execute:hover { background: var(--vscode-button-hoverBackground); }

  /* --- Status Bar --- */
  .status-bar {
    padding: 2px 8px; font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-widget-border, transparent);
  }

  /* --- Result Table --- */
  #result-area { flex: 1; overflow: auto; padding: 8px; }
  .result-filter {
    width: 100%; padding: 4px 8px; margin-bottom: 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px; outline: none;
  }
  .result-filter:focus { border-color: var(--vscode-focusBorder); }
  .table-wrap { overflow: auto; }
  .result-table {
    width: 100%; border-collapse: collapse;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
  }
  .result-table th {
    text-align: left; padding: 4px 8px; cursor: pointer; white-space: nowrap;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 2px solid var(--vscode-widget-border, #444);
    user-select: none; position: sticky; top: 0;
  }
  .result-table th:hover { background: var(--vscode-list-hoverBackground); }
  .result-table td {
    padding: 3px 8px; max-width: 300px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
    border-bottom: 1px solid var(--vscode-widget-border, transparent);
  }
  .result-table tr:hover td { background: var(--vscode-list-hoverBackground); }
  .null-cell { opacity: 0.5; font-style: italic; }
  .error-message {
    padding: 12px; color: var(--vscode-errorForeground);
    background: var(--vscode-inputValidation-errorBackground, transparent);
    border: 1px solid var(--vscode-inputValidation-errorBorder, transparent);
    border-radius: 3px;
  }

  /* --- Explain --- */
  .explain-container { padding: 4px; }
  .explain-sql {
    padding: 8px; margin-bottom: 8px; border-radius: 3px;
    background: var(--vscode-textCodeBlock-background);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    overflow-x: auto;
  }
  .explain-node { padding: 4px 4px 4px 16px; border-left: 2px solid var(--vscode-widget-border); }
  .explain-badge {
    font-size: 0.8em; padding: 1px 6px; border-radius: 3px; margin-left: 6px;
    font-weight: bold;
  }
  .explain-search .explain-badge { background: #2ea04380; color: #4ec970; }
  .explain-scan .explain-badge { background: #f1444480; color: #f88; }
  .explain-temp .explain-badge { background: #cca70080; color: #e6c54a; }

  /* --- Chart --- */
  .chart-area {
    padding: 8px; margin-bottom: 8px;
    border: 1px solid var(--vscode-widget-border, transparent);
    border-radius: 3px; overflow-x: auto;
  }
  .chart-area h4 { margin-bottom: 8px; font-weight: normal; opacity: 0.8; }

  /* --- History Sidebar --- */
  #history-sidebar {
    width: 250px; min-width: 200px; overflow-y: auto;
    border-left: 1px solid var(--vscode-widget-border, transparent);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 8px; display: flex; flex-direction: column;
  }
  .history-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
  }
  .history-header h3 {
    font-size: 0.9em; margin: 0;
    color: var(--vscode-sideBarSectionHeader-foreground);
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .history-header button {
    border: none; background: none; cursor: pointer; padding: 2px 4px;
    color: var(--vscode-descriptionForeground); font-size: 0.8em;
    border-radius: 3px;
  }
  .history-header button:hover {
    background: var(--vscode-toolbar-hoverBackground);
    color: var(--vscode-foreground);
  }
  #history-search {
    width: 100%; padding: 4px 6px; margin-bottom: 4px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px; outline: none;
    font-size: var(--vscode-font-size);
  }
  #history-search:focus { border-color: var(--vscode-focusBorder); }
  .history-counter {
    font-size: 0.75em; padding: 0 2px 4px;
    color: var(--vscode-descriptionForeground); opacity: 0.7;
  }
  #history-list { flex: 1; overflow-y: auto; }
  .history-entry {
    padding: 4px 6px; margin-bottom: 2px; cursor: pointer;
    border-radius: 3px; font-size: 0.85em;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .history-entry:hover { background: var(--vscode-list-hoverBackground); }
  .history-sql {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .history-meta {
    font-size: 0.8em; opacity: 0.6; display: flex;
    justify-content: space-between;
    color: var(--vscode-descriptionForeground);
  }
  .history-error { color: var(--vscode-errorForeground); }
  .history-time { white-space: nowrap; }

  /* --- History Context Menu --- */
  .history-ctx-menu {
    position: fixed; z-index: 200; min-width: 140px;
    background: var(--vscode-menu-background, var(--vscode-editorSuggestWidget-background));
    border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
    border-radius: 4px; padding: 4px 0;
    box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0,0,0,.3));
  }
  .history-ctx-menu div {
    padding: 4px 12px; cursor: pointer; font-size: 0.85em;
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
  }
  .history-ctx-menu div:hover {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    color: var(--vscode-menu-selectionForeground, inherit);
  }
`;
}
