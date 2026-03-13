/**
 * HTML template builder for the Data Invariants webview panel.
 */

import type { IInvariant, IInvariantSummary } from './invariant-types';
import { getInvariantStyles } from './invariant-styles';

/** Build the complete HTML for the invariant manager panel. */
export function buildInvariantHtml(
  invariants: readonly IInvariant[],
  summary: IInvariantSummary,
): string {
  if (invariants.length === 0) {
    return buildEmptyHtml();
  }

  const cards = invariants.map((inv) => buildInvariantCard(inv)).join('\n');
  const statusClass = getStatusClass(summary);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${getInvariantStyles()}
</style>
</head>
<body>
<div class="header">
  <h1>Data Invariants</h1>
  <div class="btn-group">
    <button class="btn" data-action="addRule">+ Add Rule</button>
    <button class="btn primary" data-action="runAll">Run All</button>
  </div>
</div>

<div class="summary ${statusClass}">
  <div class="summary-stat">
    <span class="summary-value">${summary.passingCount}</span>
    <span class="summary-label">Passing</span>
  </div>
  <div class="summary-stat">
    <span class="summary-value">${summary.failingCount}</span>
    <span class="summary-label">Failing</span>
  </div>
  <div class="summary-stat">
    <span class="summary-value">${summary.totalEnabled}</span>
    <span class="summary-label">Total</span>
  </div>
  ${summary.lastCheckTime ? `
  <div class="summary-stat">
    <span class="summary-value">${formatTime(summary.lastCheckTime)}</span>
    <span class="summary-label">Last Check</span>
  </div>
  ` : ''}
</div>

<div class="cards">
  ${cards}
</div>

<script>
${getScript()}
</script>
</body>
</html>`;
}

function buildEmptyHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
${getInvariantStyles()}
</style>
</head>
<body>
<div class="header">
  <h1>Data Invariants</h1>
  <div class="btn-group">
    <button class="btn primary" data-action="addRule">+ Add Rule</button>
  </div>
</div>
<div class="empty">
  <div class="empty-icon">$(shield)</div>
  <h2>No invariants defined</h2>
  <p>Data invariants help ensure your database maintains consistency.</p>
  <p>Click "Add Rule" to create your first invariant check.</p>
</div>
<script>
${getScript()}
</script>
</body>
</html>`;
}

function buildInvariantCard(inv: IInvariant): string {
  const status = getInvariantStatus(inv);
  const statusIcon = getStatusIcon(status);
  const statusClass = status;
  const result = inv.lastResult;

  let resultInfo = '';
  if (result) {
    if (result.error) {
      resultInfo = `<div class="result error">Error: ${esc(result.error)}</div>`;
    } else if (result.passed) {
      resultInfo = `<div class="result pass">PASS — checked ${formatTime(result.checkedAt)} (${result.durationMs}ms)</div>`;
    } else {
      const rowText = result.violationCount === 1 ? '1 row' : `${result.violationCount} rows`;
      resultInfo = `<div class="result fail">FAIL (${rowText}) — checked ${formatTime(result.checkedAt)}</div>`;

      if (result.violatingRows.length > 0) {
        const preview = result.violatingRows
          .slice(0, 3)
          .map((row) => {
            const vals = Object.entries(row)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${formatValue(v)}`)
              .join(', ');
            return vals;
          })
          .join(' | ');
        resultInfo += `<div class="violations">→ ${esc(preview)}${result.violationCount > 3 ? '...' : ''}</div>`;
      }
    }
  }

  return `
<div class="card ${statusClass}" data-id="${esc(inv.id)}">
  <div class="card-header">
    <span class="status-icon">${statusIcon}</span>
    <span class="card-title">${esc(inv.name)}</span>
    <span class="card-table">${esc(inv.table)}</span>
    <span class="card-severity severity-${inv.severity}">${inv.severity}</span>
    <div class="card-actions">
      <button class="icon-btn" data-action="toggle" title="${inv.enabled ? 'Disable' : 'Enable'}">
        ${inv.enabled ? '$(eye)' : '$(eye-closed)'}
      </button>
      <button class="icon-btn" data-action="runOne" title="Run Check">$(play)</button>
      <button class="icon-btn" data-action="edit" title="Edit">$(edit)</button>
      <button class="icon-btn danger" data-action="remove" title="Remove">$(trash)</button>
    </div>
  </div>
  <div class="card-sql">
    <code>${esc(inv.sql)}</code>
  </div>
  <div class="card-expectation">
    Expect: ${inv.expectation === 'zero_rows' ? '0 rows (no violations)' : 'At least 1 row'}
  </div>
  ${resultInfo}
  ${!result && inv.enabled ? '<div class="result pending">Not yet checked</div>' : ''}
  ${!inv.enabled ? '<div class="result disabled">Disabled</div>' : ''}
</div>`;
}

function getInvariantStatus(inv: IInvariant): 'pass' | 'fail' | 'error' | 'pending' | 'disabled' {
  if (!inv.enabled) return 'disabled';
  if (!inv.lastResult) return 'pending';
  if (inv.lastResult.error) return 'error';
  return inv.lastResult.passed ? 'pass' : 'fail';
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pass': return '✅';
    case 'fail': return '❌';
    case 'error': return '⚠️';
    case 'disabled': return '⏸';
    default: return '⏳';
  }
}

function getStatusClass(summary: IInvariantSummary): string {
  if (summary.totalEnabled === 0) return 'status-empty';
  if (summary.failingCount > 0) return 'status-fail';
  if (summary.passingCount === summary.totalEnabled) return 'status-pass';
  return 'status-pending';
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function formatValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'string') return `"${value.slice(0, 20)}${value.length > 20 ? '...' : ''}"`;
  return String(value);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getScript(): string {
  return `
  const vscode = acquireVsCodeApi();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const card = btn.closest('.card');
    const id = card ? card.dataset.id : undefined;

    vscode.postMessage({ command: action, id });
  });
`;
}
