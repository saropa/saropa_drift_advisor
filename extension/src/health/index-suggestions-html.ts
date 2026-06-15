import type { IndexSuggestion } from '../api-types';
import { SUITE_NOTES_CSS, SUITE_NOTES_SCRIPT } from '../suite/suite-notes-html';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

/**
 * Build HTML for the Index Suggestions webview panel.
 * Shows a table of missing-index recommendations with copy / create actions.
 * [suiteSection] is the prebuilt "Related Saropa Suite Findings" HTML (plan 67
 * R3), already escaped and command-gated; '' when there are no related findings.
 */
export function buildIndexSuggestionsHtml(
  suggestions: IndexSuggestion[],
  historyCount: number = 0,
  suiteSection: string = '',
): string {
  if (suggestions.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); }
.empty { padding: 32px; text-align: center; opacity: 0.6; }</style>
</head><body><div class="empty">${t('panel.quality.index.empty')}</div></body></html>`;
  }

  const rows = suggestions.map((s, i) => {
    const priorityCls = `priority-${esc(s.priority)}`;
    return `<tr>
      <td><input type="checkbox" data-idx="${i}" class="row-check" /></td>
      <td>${esc(s.table)}</td>
      <td>${esc(s.column)}</td>
      <td><span class="badge ${priorityCls}">${esc(s.priority)}</span></td>
      <td>${esc(s.reason)}</td>
      <td class="sql-cell"><code>${esc(s.sql)}</code></td>
      <td>
        <button class="action-btn" data-copy="${i}" title="${t('panel.quality.index.row.copy.title')}">${t('panel.quality.index.row.copy')}</button>
      </td>
    </tr>`;
  }).join('\n');

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
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .header h1 { margin: 0; font-size: 18px; }
  .btn-group { display: flex; gap: 6px; }
  .btn {
    padding: 4px 12px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .summary {
    font-size: 13px;
    opacity: 0.7;
    margin-bottom: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th, td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  th {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
    opacity: 0.7;
    position: sticky;
    top: 0;
    background: var(--vscode-editor-background);
  }
  tr:hover { background: var(--vscode-list-hoverBackground); }
  .sql-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sql-cell code {
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
  }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .priority-high { background: color-mix(in srgb, var(--status-bad) 20%, transparent); color: var(--status-bad); }
  .priority-medium { background: color-mix(in srgb, var(--accent-warning) 20%, transparent); color: var(--accent-warning); }
  .priority-low { background: color-mix(in srgb, var(--accent-info) 20%, transparent); color: var(--accent-info); }
  .action-btn {
    padding: 2px 8px;
    font-size: 11px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-radius: 3px;
    cursor: pointer;
  }
  .action-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
  /* Select-all checkbox in header */
  .select-all { margin: 0; vertical-align: middle; }
${SUITE_NOTES_CSS}
</style>
</head>
<body>
<div class="header">
  <h1>${t('panel.quality.index.title')}</h1>
  <div class="btn-group">
    <button class="btn btn-secondary" data-action="copySelected">${t('panel.quality.index.btn.copySelected')}</button>
    <button class="btn btn-secondary" data-action="copyAll">${t('panel.quality.index.btn.copyAll')}</button>
    <button class="btn btn-secondary" data-action="exportAnalysis">${t('panel.quality.index.btn.exportAnalysis')}</button>
    <button class="btn btn-secondary" data-action="saveSnapshot">${t('panel.quality.index.btn.saveSnapshot')}</button>
    <button class="btn btn-secondary" data-action="compareHistory">${historyCount > 0 ? t('panel.quality.index.btn.compareCount', historyCount) : t('panel.quality.index.btn.compare')}</button>
    <button class="btn" data-action="createAll">${t('panel.quality.index.btn.createAll')}</button>
  </div>
</div>
<div class="summary">${t('panel.quality.index.summary', suggestions.length)}</div>

<table>
  <thead>
    <tr>
      <th><input type="checkbox" class="select-all" title="${t('panel.quality.index.selectAll.title')}" /></th>
      <th>${t('panel.quality.index.th.table')}</th>
      <th>${t('panel.quality.index.th.column')}</th>
      <th>${t('panel.quality.index.th.priority')}</th>
      <th>${t('panel.quality.index.th.reason')}</th>
      <th>${t('panel.quality.index.th.sql')}</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
${suiteSection}

<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();

  // Select-all toggle
  document.querySelector('.select-all').addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.row-check').forEach((cb) => { cb.checked = checked; });
  });

  document.addEventListener('click', (e) => {
    // Header button actions
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      if (action === 'copySelected') {
        // Gather checked row indexes
        const indexes = [];
        document.querySelectorAll('.row-check:checked').forEach((cb) => {
          indexes.push(Number(cb.dataset.idx));
        });
        vscode.postMessage({ command: 'copySelected', indexes });
      } else {
        vscode.postMessage({ command: action });
      }
      return;
    }
    // Per-row copy button
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      vscode.postMessage({ command: 'copySingle', index: Number(copyBtn.dataset.copy) });
    }
  });
${SUITE_NOTES_SCRIPT}
</script>
</body>
</html>`;
}

/** HTML-escape a string. */
const esc = escapeHtml;
