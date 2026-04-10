/**
 * HTML builder for the generic analysis comparison webview.
 * Renders Before/After dropdown selectors and two side-by-side panels
 * that get populated dynamically via postMessage.
 */

import type { IAnalysisSnapshot } from './analysis-history-store';

/**
 * Build the full HTML for the compare panel.
 * The side-by-side content is populated client-side after the user
 * picks Before/After from the dropdowns and the extension posts back
 * rendered HTML fragments.
 */
export function buildCompareHtml<T>(
  title: string,
  snapshots: readonly IAnalysisSnapshot<T>[],
): string {
  const options = snapshots.map((s) =>
    `<option value="${esc(s.id)}">${esc(s.label)}</option>`,
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 16px;
  }
  .header { margin-bottom: 16px; }
  .header h1 { margin: 0; font-size: 18px; }
  .toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .toolbar label {
    font-size: 12px;
    font-weight: 600;
  }
  .toolbar select {
    font-size: 12px;
    padding: 3px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 3px;
  }
  .summary {
    font-size: 13px;
    padding: 8px 12px;
    margin-bottom: 12px;
    border-radius: 4px;
    background: var(--vscode-textBlockQuote-background, var(--vscode-input-background));
    border-left: 3px solid var(--vscode-textLink-foreground, #3b82f6);
    min-height: 1em;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .col {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 12px;
    max-height: 60vh;
    overflow: auto;
    font-size: 12px;
  }
  .col-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    margin-bottom: 8px;
    font-weight: 600;
  }
  .placeholder { opacity: 0.5; font-style: italic; }
  /* Allow analysis-specific tables to render inside columns */
  .col table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .col th, .col td {
    text-align: left; padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .col th {
    font-weight: 600; opacity: 0.7; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  /* Diff highlighting classes used by renderers */
  .diff-added { background: rgba(34, 197, 94, 0.15); }
  .diff-removed { background: rgba(239, 68, 68, 0.15); text-decoration: line-through; }
  .diff-changed { background: rgba(234, 179, 8, 0.15); }
</style>
</head>
<body>
<div class="header">
  <h1>Compare: ${esc(title)}</h1>
</div>

<div class="toolbar">
  <label for="before-sel">Before:</label>
  <select id="before-sel">
    <option value="">— select —</option>
    <option value="_current">Current result</option>
    ${options}
  </select>

  <label for="after-sel">After:</label>
  <select id="after-sel">
    <option value="">— select —</option>
    <option value="_current">Current result</option>
    ${options}
  </select>
</div>

<div class="summary" id="summary">Select Before and After to compare.</div>

<div class="columns">
  <div class="col" id="left-col">
    <div class="col-label">Before</div>
    <div class="placeholder">Select a snapshot above.</div>
  </div>
  <div class="col" id="right-col">
    <div class="col-label">After</div>
    <div class="placeholder">Select a snapshot above.</div>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const beforeSel = document.getElementById('before-sel');
  const afterSel = document.getElementById('after-sel');
  const summary = document.getElementById('summary');
  const leftCol = document.getElementById('left-col');
  const rightCol = document.getElementById('right-col');

  function requestCompare() {
    vscode.postMessage({
      command: 'compare',
      beforeId: beforeSel.value || undefined,
      afterId: afterSel.value || undefined,
    });
  }

  beforeSel.addEventListener('change', requestCompare);
  afterSel.addEventListener('change', requestCompare);

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'compareResult') {
      leftCol.innerHTML = '<div class="col-label">Before</div>' +
        (msg.beforeHtml || '<div class="placeholder">Select a snapshot above.</div>');
      rightCol.innerHTML = '<div class="col-label">After</div>' +
        (msg.afterHtml || '<div class="placeholder">Select a snapshot above.</div>');
      summary.textContent = msg.summary || 'Select Before and After to compare.';
    }
  });
</script>
</body>
</html>`;
}

/** HTML-escape a string. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
