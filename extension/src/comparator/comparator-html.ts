import type { IRowDiff, IRowDiffColumn } from './row-differ';
import { t } from '../l10n';

/** Build the HTML for the row comparator webview panel. */
export function buildComparatorHtml(diff: IRowDiff): string {
  const rows = diff.columns.map((c) => renderRow(c)).join('');

  const parts: string[] = [];
  if (diff.sameCount > 0) parts.push(t('panel.compare.comparator.summary.same', diff.sameCount));
  if (diff.differentCount > 0) parts.push(t('panel.compare.comparator.summary.different', diff.differentCount));
  if (diff.onlyACount > 0) parts.push(t('panel.compare.comparator.summary.onlyA', diff.onlyACount));
  if (diff.onlyBCount > 0) parts.push(t('panel.compare.comparator.summary.onlyB', diff.onlyBCount));
  const summary = parts.join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px; }
  h2 { margin: 0 0 12px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 5px 10px;
           border-bottom: 1px solid var(--vscode-widget-border); }
  th { font-weight: bold; opacity: 0.8; font-size: 12px; }
  .col-name { font-weight: 600; }
  .num { font-variant-numeric: tabular-nums; }
  .diff-same td { opacity: 0.6; }
  .diff-different td:nth-child(2),
  .diff-different td:nth-child(3) {
    background: rgba(200, 200, 0, 0.15); font-weight: bold;
  }
  .diff-type_mismatch td:nth-child(2),
  .diff-type_mismatch td:nth-child(3) {
    background: rgba(200, 0, 0, 0.1);
  }
  .diff-only_a td:nth-child(2) { background: rgba(0, 200, 0, 0.15); }
  .diff-only_b td:nth-child(3) { background: rgba(0, 200, 0, 0.15); }
  .summary { margin-top: 12px; font-size: 12px; opacity: 0.8; }
  .marker { opacity: 0.5; margin-left: 4px; }
  .actions { margin-top: 12px; display: flex; gap: 8px; }
  button { cursor: pointer; padding: 4px 10px;
           background: var(--vscode-button-background);
           color: var(--vscode-button-foreground); border: none;
           border-radius: 2px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <h2>${t('panel.compare.comparator.heading', esc(diff.labelA), esc(diff.labelB))}</h2>
  <table>
    <thead>
      <tr>
        <th>${t('panel.compare.comparator.th.column')}</th>
        <th>${esc(diff.labelA)}</th>
        <th>${esc(diff.labelB)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="summary">${esc(summary)}</p>
  <div class="actions">
    <button data-click="post" data-a0="swapRows">${t('panel.compare.comparator.btn.swap')}</button>
    <button data-click="post" data-a0="copyJson">${t('panel.compare.comparator.btn.copyJson')}</button>
  </div>
  <script nonce="__CSP_NONCE__">
    const vscode = acquireVsCodeApi();
    function post(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
}

function renderRow(c: IRowDiffColumn): string {
  const valA = c.match === 'only_b' ? '' : formatValue(c.valueA);
  const valB = c.match === 'only_a' ? '' : formatValue(c.valueB);
  const marker = c.match !== 'same' ? '<span class="marker">&#9668;</span>' : '';
  return `<tr class="diff-${c.match}">
    <td class="col-name">${esc(c.column)}</td>
    <td>${valA}</td>
    <td>${valB}${marker}</td>
  </tr>`;
}

function formatValue(v: unknown): string {
  if (v === null) return `<em>${t('panel.compare.comparator.value.null')}</em>`;
  if (v === undefined) return '';
  if (typeof v === 'string') return esc(`"${v}"`);
  return esc(String(v));
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
