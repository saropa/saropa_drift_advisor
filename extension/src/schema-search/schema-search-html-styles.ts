/**
 * CSS stylesheet for the Schema Search webview.
 * Separated from schema-search-html-content (script) to keep both under the line cap.
 */
export const SCHEMA_SEARCH_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* Fallback colors: some hosts/themes omit CSS variables in webviews → invisible text without these. */
  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground, #cccccc);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background, #252526));
    padding: 8px;
    min-height: 280px;
  }
  .panel-chrome {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.45));
    min-height: 52px;
  }
  .panel-chrome-title {
    font-weight: 600;
    font-size: 12px;
    color: var(--vscode-foreground, #e0e0e0);
  }
  .panel-chrome-lead {
    font-size: 10px;
    line-height: 1.4;
    margin-top: 4px;
    opacity: 0.92;
    color: var(--vscode-descriptionForeground, var(--vscode-foreground, #bbbbbb));
  }
  .schema-hard-fallback {
    display: block;
    padding: 8px 6px 10px 6px;
    margin-bottom: 8px;
    font-size: 12px;
    line-height: 1.45;
    border-radius: 3px;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.35));
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.12));
  }
  .schema-hard-fallback-title { font-weight: 600; margin-bottom: 6px; }
  .schema-hard-fallback-lead { opacity: 0.92; font-size: 11px; }
  .search-box { display: flex; gap: 4px; margin-bottom: 6px; }
  .search-box input { flex: 1; padding: 4px 6px;
    background: var(--vscode-input-background, rgba(80, 80, 80, 0.35));
    color: var(--vscode-input-foreground, var(--vscode-foreground, #cccccc));
    border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.55));
    border-radius: 2px;
    outline: none; font-size: var(--vscode-font-size);
    transition: opacity 0.2s ease; }
  .search-box input:focus { border-color: var(--vscode-focusBorder); }
  .search-box input:disabled { opacity: 0.5; cursor: not-allowed; }
  .filters { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;
    transition: opacity 0.2s ease; }
  .filters button { padding: 2px 8px; font-size: 11px; cursor: pointer;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid transparent; border-radius: 2px; }
  .filters button.active { background: var(--vscode-button-background);
    color: var(--vscode-button-foreground); }
  .filters button:hover { opacity: 0.9; }
  .filters.disabled { opacity: 0.72; pointer-events: none; }
  .sep { width: 1px; background: var(--vscode-widget-border, #555); margin: 0 2px; }
  .results { list-style: none; }
  .result-item { padding: 3px 4px; cursor: pointer; border-radius: 2px; }
  .result-item:hover { background: var(--vscode-list-hoverBackground); }
  .result-table { font-weight: 600; }
  .result-col { padding-left: 14px; }
  .result-type { opacity: 0.7; margin-left: 4px; font-size: 11px; }
  .result-meta { font-size: 11px; opacity: 0.6; }
  .cross-ref { padding-left: 24px; font-size: 11px; opacity: 0.7; }
  .cross-ref .warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  .empty { opacity: 0.6; font-style: italic; padding: 8px 0; }
  .idle { opacity: 0.6; font-size: 12px; padding: 12px 0; }
  .browse-link { font-size: 11px; opacity: 0.8; margin-bottom: 6px;
    transition: opacity 0.2s ease; }
  .browse-link a { color: var(--vscode-textLink-foreground); cursor: pointer; }
  .browse-link a:hover { text-decoration: underline; }
  .browse-link.disabled { opacity: 0.4; pointer-events: none; }
  .error { color: var(--vscode-errorForeground); font-size: 12px; padding: 8px 0; }
  .status { font-size: 11px; opacity: 0.6; margin-bottom: 4px; }
  .loading { opacity: 0.6; font-style: italic; padding: 8px 0;
    animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
  .retry-btn { margin-top: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px;
    transition: opacity 0.15s ease; }
  .retry-btn:hover { opacity: 0.85; }
  .disconnected { overflow: hidden; max-height: 0; opacity: 0; padding: 0 8px;
    margin-bottom: 0; font-size: 11px; border-radius: 3px;
    background: var(--vscode-inputValidation-warningBackground, #5a4300);
    border: 1px solid var(--vscode-inputValidation-warningBorder, #856d00);
    color: var(--vscode-inputValidation-warningForeground, #cca700);
    transition: max-height 0.25s ease, opacity 0.25s ease,
                padding 0.25s ease, margin-bottom 0.25s ease; }
  .disconnected.show {
    max-height: 620px;
    opacity: 1;
    padding: 8px;
    margin-bottom: 6px;
    overflow-y: auto;
    color: var(--vscode-inputValidation-warningForeground, #f0e0a8);
  }
  .disc-title { font-weight: 600; }
  .disc-hint { font-size: 10px; opacity: 0.95; margin-top: 4px; line-height: 1.35;
    white-space: pre-wrap; }
  .disc-actions { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  .disc-resources {
    margin-top: 10px; padding-top: 8px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.25));
    font-size: 10px;
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    opacity: 0.9;
  }
  .disc-resources-label { font-weight: 600; margin-right: 4px; }
  .disc-resources-sep { opacity: 0.6; user-select: none; }
  .linkish { background: transparent; border: none; color: var(--vscode-textLink-foreground);
    cursor: pointer; font-size: 10px; padding: 2px 0; text-decoration: underline; }
  .linkish:hover { opacity: 0.9; }
  .conn-status {
    font-size: 10px;
    opacity: 0.95;
    margin-bottom: 6px;
    line-height: 1.35;
    color: var(--vscode-foreground, #cccccc);
    min-height: 1.2em;
  }
  .disc-live {
    font-size: 10px; line-height: 1.35; margin-bottom: 8px; padding: 6px 8px;
    border-radius: 3px;
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.15));
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.28));
  }
  .disc-live-title { font-weight: 600; font-size: 10px; margin-bottom: 4px; opacity: 0.88; }
  .disc-live-line { margin-bottom: 4px; }
  .disc-live-outcome { opacity: 0.85; margin-bottom: 4px; }
  .disc-live-meta { opacity: 0.68; font-size: 10px; margin-bottom: 6px; }
  .disc-live-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .disc-faq {
    margin-top: 8px; padding-top: 6px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    font-size: 10px; opacity: 0.82;
  }
`;
