/**
 * Data Story Narrator webview styles.
 * Extracted from narrator-html for modularization (plan: under 300 lines per file).
 */

export function getNarratorCss(): string {
  return `
:root {
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-editor-foreground);
  --border: var(--vscode-widget-border, #444);
  --accent: var(--vscode-textLink-foreground, #3794ff);
  --header-bg: var(--vscode-sideBarSectionHeader-background, rgba(100,100,255,0.08));
  --btn-bg: var(--vscode-button-background);
  --btn-fg: var(--vscode-button-foreground);
  --btn-hover: var(--vscode-button-hoverBackground);
}

* { box-sizing: border-box; }

body {
  font-family: var(--vscode-font-family, system-ui, sans-serif);
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
  margin: 0;
  padding: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
}

.header h1 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.narrative {
  max-width: 700px;
  line-height: 1.6;
}

.paragraph {
  margin-bottom: 16px;
}

.list-header {
  margin: 0 0 4px 0;
  font-weight: 500;
}

.list-items {
  margin: 0;
  padding: 0 0 0 8px;
  font-family: inherit;
  font-size: inherit;
  white-space: pre-wrap;
  opacity: 0.9;
}

.actions {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
}

button {
  cursor: pointer;
  padding: 6px 14px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  border: none;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 500;
}

button:hover {
  background: var(--btn-hover);
}

button:active {
  opacity: 0.8;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  opacity: 0.7;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  padding: 24px;
  text-align: center;
}

.error p {
  color: var(--vscode-errorForeground, #f44);
  margin-bottom: 16px;
}

.toast {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--vscode-notifications-background, #333);
  color: var(--vscode-notifications-foreground, #fff);
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.toast.visible {
  opacity: 1;
}

.toast.hidden {
  display: none;
}
`;
}
