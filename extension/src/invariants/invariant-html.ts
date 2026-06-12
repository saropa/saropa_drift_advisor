/**
 * HTML template builder for the Data Invariants webview panel.
 */

import type { IInvariant, IInvariantSummary } from './invariant-types';
import { getInvariantStyles } from './invariant-styles';
import { t } from '../l10n';

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
  <h1>${t('panel.quality.invariants.title')}</h1>
  <div class="btn-group">
    <button class="btn" data-action="addRule">${t('panel.quality.invariants.btn.addRule')}</button>
    <button class="btn primary" data-action="runAll">${t('panel.quality.invariants.btn.runAll')}</button>
  </div>
</div>

<div class="summary ${statusClass}">
  <div class="summary-stat">
    <span class="summary-value">${summary.passingCount}</span>
    <span class="summary-label">${t('panel.quality.invariants.summary.passing')}</span>
  </div>
  <div class="summary-stat">
    <span class="summary-value">${summary.failingCount}</span>
    <span class="summary-label">${t('panel.quality.invariants.summary.failing')}</span>
  </div>
  <div class="summary-stat">
    <span class="summary-value">${summary.totalEnabled}</span>
    <span class="summary-label">${t('panel.quality.invariants.summary.total')}</span>
  </div>
  ${summary.lastCheckTime ? `
  <div class="summary-stat">
    <span class="summary-value">${formatTime(summary.lastCheckTime)}</span>
    <span class="summary-label">${t('panel.quality.invariants.summary.lastCheck')}</span>
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
  <h1>${t('panel.quality.invariants.title')}</h1>
  <div class="btn-group">
    <button class="btn primary" data-action="addRule">${t('panel.quality.invariants.btn.addRule')}</button>
  </div>
</div>
<div class="empty">
  <div class="empty-icon">$(shield)</div>
  <h2>${t('panel.quality.invariants.empty.title')}</h2>
  <p>${t('panel.quality.invariants.empty.body')}</p>
  <p>${t('panel.quality.invariants.empty.cta')}</p>
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
      resultInfo = `<div class="result error">${t('panel.quality.invariants.result.error', esc(result.error))}</div>`;
    } else if (result.passed) {
      resultInfo = `<div class="result pass">${t('panel.quality.invariants.result.pass', formatTime(result.checkedAt), result.durationMs)}</div>`;
    } else {
      // Singular/plural row phrase is its own key, then embedded as {0} in the FAIL line.
      const rowText = result.violationCount === 1
        ? t('panel.quality.invariants.result.rowOne')
        : t('panel.quality.invariants.result.rowMany', result.violationCount);
      resultInfo = `<div class="result fail">${t('panel.quality.invariants.result.fail', rowText, formatTime(result.checkedAt))}</div>`;

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
      <button class="icon-btn" data-action="toggle" title="${inv.enabled ? t('panel.quality.invariants.action.disable') : t('panel.quality.invariants.action.enable')}">
        ${inv.enabled ? '$(eye)' : '$(eye-closed)'}
      </button>
      <button class="icon-btn" data-action="runOne" title="${t('panel.quality.invariants.action.run')}">$(play)</button>
      <button class="icon-btn" data-action="edit" title="${t('panel.quality.invariants.action.edit')}">$(edit)</button>
      <button class="icon-btn danger" data-action="remove" title="${t('panel.quality.invariants.action.remove')}">$(trash)</button>
    </div>
  </div>
  <div class="card-sql">
    <code>${esc(inv.sql)}</code>
  </div>
  <div class="card-expectation">
    ${t('panel.quality.invariants.expect.label', inv.expectation === 'zero_rows' ? t('panel.quality.invariants.expect.zeroRows') : t('panel.quality.invariants.expect.atLeastOne'))}
  </div>
  ${resultInfo}
  ${!result && inv.enabled ? `<div class="result pending">${t('panel.quality.invariants.result.pending')}</div>` : ''}
  ${!inv.enabled ? `<div class="result disabled">${t('panel.quality.invariants.result.disabled')}</div>` : ''}
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
