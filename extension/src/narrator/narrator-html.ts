/**
 * HTML template for the Data Story Narrator webview panel.
 */

import type { INarrativeResult } from './narrator-types';

/**
 * Build the full HTML for the narrator panel.
 */
export function buildNarratorHtml(
  result: INarrativeResult,
): string {
  const root = result.graph.root;
  const title = `${esc(root.table)} #${esc(String(root.pkValue))}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${css()}
</style>
</head>
<body>
  <header class="header">
    <h1>DATA STORY — ${title}</h1>
  </header>

  <main class="content">
    <div class="narrative">
${formatNarrativeHtml(result.text)}
    </div>
  </main>

  <footer class="actions">
    <button onclick="copyText()">Copy Text</button>
    <button onclick="copyMarkdown()">Copy Markdown</button>
    <button onclick="regenerate()">Regenerate</button>
  </footer>

  <div id="toast" class="toast hidden"></div>

  <script>
${clientScript()}
  </script>
</body>
</html>`;
}

/**
 * Build loading state HTML.
 */
export function buildLoadingHtml(table: string, pkValue: unknown): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
${css()}
</style>
</head>
<body>
  <header class="header">
    <h1>DATA STORY — ${esc(table)} #${esc(String(pkValue))}</h1>
  </header>

  <main class="content">
    <div class="loading">
      <div class="spinner"></div>
      <p>Generating story...</p>
    </div>
  </main>
</body>
</html>`;
}

/**
 * Build error state HTML.
 */
export function buildErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
${css()}
</style>
</head>
<body>
  <header class="header">
    <h1>DATA STORY</h1>
  </header>

  <main class="content">
    <div class="error">
      <p>Error: ${esc(message)}</p>
      <button onclick="regenerate()">Try Again</button>
    </div>
  </main>

  <script>
${clientScript()}
  </script>
</body>
</html>`;
}

function formatNarrativeHtml(text: string): string {
  return text
    .split('\n\n')
    .map((paragraph) => {
      if (paragraph.includes('\n')) {
        const lines = paragraph.split('\n');
        const header = lines[0];
        const items = lines.slice(1).join('\n');
        return `      <div class="paragraph">
        <p class="list-header">${esc(header)}</p>
        <pre class="list-items">${esc(items)}</pre>
      </div>`;
      }
      return `      <p class="paragraph">${esc(paragraph)}</p>`;
    })
    .join('\n');
}

function css(): string {
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

function clientScript(): string {
  return `
const vscode = acquireVsCodeApi();

function copyText() {
  vscode.postMessage({ command: 'copyText' });
  showToast('Text copied to clipboard');
}

function copyMarkdown() {
  vscode.postMessage({ command: 'copyMarkdown' });
  showToast('Markdown copied to clipboard');
}

function regenerate() {
  vscode.postMessage({ command: 'regenerate' });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('visible');
  setTimeout(function() {
    toast.classList.remove('visible');
    setTimeout(function() {
      toast.classList.add('hidden');
    }, 200);
  }, 1500);
}
`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
