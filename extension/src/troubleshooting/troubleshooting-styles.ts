/**
 * CSS for the Troubleshooting webview panel.
 * Uses VS Code theme variables for consistent appearance.
 */

export const TROUBLESHOOTING_STYLES = `
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 24px 32px;
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
  }
  h1 {
    font-size: 22px;
    margin: 0 0 8px 0;
    color: var(--vscode-editor-foreground);
  }
  .subtitle {
    opacity: 0.7;
    margin-bottom: 24px;
    font-size: 13px;
  }
  h2 {
    font-size: 16px;
    margin: 24px 0 12px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-widget-border, #444);
  }
  .section {
    background: var(--vscode-sideBar-background, #252526);
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 6px;
    padding: 16px 20px;
    margin-bottom: 16px;
  }
  .section-title {
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
  }
  .step {
    margin: 8px 0;
    padding-left: 8px;
  }
  .step-number {
    display: inline-block;
    width: 22px;
    height: 22px;
    line-height: 22px;
    text-align: center;
    border-radius: 50%;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    font-size: 12px;
    font-weight: bold;
    margin-right: 8px;
  }
  code {
    font-family: var(--vscode-editor-fontFamily, 'Consolas', monospace);
    background: var(--vscode-textCodeBlock-background, #2d2d2d);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 13px;
  }
  pre {
    background: var(--vscode-textCodeBlock-background, #2d2d2d);
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 4px;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
  }
  pre code {
    background: none;
    padding: 0;
  }
  .tip {
    background: var(--vscode-inputValidation-infoBackground, #063b49);
    border: 1px solid var(--vscode-inputValidation-infoBorder, #007acc);
    border-radius: 4px;
    padding: 10px 14px;
    margin: 12px 0;
    font-size: 13px;
  }
  .warning {
    background: var(--vscode-inputValidation-warningBackground, #352a05);
    border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
    border-radius: 4px;
    padding: 10px 14px;
    margin: 12px 0;
    font-size: 13px;
  }
  .btn {
    display: inline-block;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    margin: 4px 4px 4px 0;
    text-decoration: none;
  }
  .btn:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ccc);
  }
  .btn-secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, #45494e);
  }
  .checklist {
    list-style: none;
    padding-left: 4px;
  }
  .checklist li {
    padding: 4px 0;
    padding-left: 24px;
    position: relative;
  }
  .checklist li::before {
    content: "\\2610";
    position: absolute;
    left: 0;
    opacity: 0.7;
  }
  .diagram {
    font-family: var(--vscode-editor-fontFamily, 'Consolas', monospace);
    font-size: 12px;
    line-height: 1.4;
    padding: 16px;
    background: var(--vscode-textCodeBlock-background, #2d2d2d);
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre;
    margin: 12px 0;
  }
  a { color: var(--vscode-textLink-foreground, #3794ff); }
  a:hover { color: var(--vscode-textLink-activeForeground, #3794ff); }
  .actions {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-widget-border, #444);
  }
  details {
    margin: 8px 0;
  }
  summary {
    cursor: pointer;
    font-weight: bold;
    padding: 4px 0;
  }
  details[open] summary {
    margin-bottom: 8px;
  }

  /* Live status banner — tone-keyed background/border with a leading dot so the
     connection state reads at a glance before any of the help text. */
  .status {
    border-radius: 6px;
    padding: 14px 18px;
    margin-bottom: 16px;
    border: 1px solid var(--vscode-widget-border, #444);
  }
  .status-title {
    font-weight: bold;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .status-detail {
    margin-top: 6px;
    font-size: 13px;
    opacity: 0.9;
  }
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: 0 0 auto;
    background: currentColor;
  }
  .status-ok {
    background: var(--vscode-inputValidation-infoBackground, #0c2f1a);
    border-color: var(--vscode-testing-iconPassed, #4caf50);
    color: var(--vscode-testing-iconPassed, #4caf50);
  }
  .status-info {
    background: var(--vscode-inputValidation-infoBackground, #063b49);
    border-color: var(--vscode-inputValidation-infoBorder, #007acc);
    color: var(--vscode-inputValidation-infoBorder, #3794ff);
  }
  .status-warn {
    background: var(--vscode-inputValidation-warningBackground, #352a05);
    border-color: var(--vscode-inputValidation-warningBorder, #b89500);
    color: var(--vscode-inputValidation-warningBorder, #e0b400);
  }
  .status-error {
    background: var(--vscode-inputValidation-errorBackground, #3a1d1d);
    border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    color: var(--vscode-testing-iconFailed, #f14c4c);
  }
  /* Keep the detail text readable rather than tinted with the tone color. */
  .status-detail { color: var(--vscode-editor-foreground, #ccc); }

  /* Current-configuration grid: two columns, label muted, value emphasized. */
  .kv {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    font-size: 13px;
  }
  .kv .k { opacity: 0.7; }
  .kv .v { word-break: break-word; }
`;
