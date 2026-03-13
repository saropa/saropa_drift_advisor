/**
 * HTML template for the Data Story Narrator webview panel.
 */

import type { INarrativeResult } from './narrator-types';
import { getNarratorCss } from './narrator-styles';

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
${getNarratorCss()}
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
${getNarratorCss()}
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
${getNarratorCss()}
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
