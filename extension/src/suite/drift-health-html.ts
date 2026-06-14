/**
 * HTML for the Drift Health panel (plan 67 R4): a per-table join of the three
 * suite lenses. Theme-aware via `--vscode-*` variables (light / dark / high
 * contrast); all dynamic text is HTML-escaped.
 */
import type { SuiteDiagnostic } from './suite-diagnostics';
import type { DriftHealthModel, DriftHealthTable } from './drift-health';
import { t } from '../l10n';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders one finding row: severity dot, its own localized title/detail, rule id. */
function renderFinding(d: SuiteDiagnostic): string {
  const sev = esc(d.severity ?? 'info');
  const title = esc(d.title ?? d.detail ?? d.ruleId ?? '');
  const detail = d.detail && d.detail !== d.title
    ? `<span class="dh-detail">${esc(d.detail)}</span>`
    : '';
  const rule = d.ruleId ? `<code class="dh-rule">${esc(d.ruleId)}</code>` : '';
  return `<li class="dh-finding dh-${sev}">
  <span class="dh-dot dh-dot-${sev}" aria-hidden="true"></span>
  <span class="dh-title">${title}</span>
  ${rule}
  ${detail}
</li>`;
}

/** Renders one tool column within a table card; omitted when the tool has none. */
function renderColumn(labelKey: string, findings: SuiteDiagnostic[]): string {
  if (findings.length === 0) return '';
  const items = findings.map(renderFinding).join('\n');
  return `<div class="dh-col">
  <h4 class="dh-col-label">${t(labelKey)} <span class="dh-col-count">${findings.length}</span></h4>
  <ul class="dh-list">${items}</ul>
</div>`;
}

/** Renders one table card with its (non-empty) tool columns. */
function renderTable(group: DriftHealthTable): string {
  const cols = [
    renderColumn('panel.driftHealth.col.advisor', group.advisor),
    renderColumn('panel.driftHealth.col.lints', group.lints),
    renderColumn('panel.driftHealth.col.logCapture', group.logCapture),
  ].join('\n');
  return `<section class="dh-card">
  <h3 class="dh-table">${esc(group.table)} <span class="dh-table-count">${group.total}</span></h3>
  <div class="dh-cols">${cols}</div>
</section>`;
}

/** Build the full Drift Health panel HTML for [model]. */
export function buildDriftHealthHtml(model: DriftHealthModel): string {
  const cards = model.tables.map(renderTable).join('\n');

  const untabled = model.untabled.length > 0
    ? `<section class="dh-card">
  <h3 class="dh-table">${t('panel.driftHealth.untabled')} <span class="dh-table-count">${model.untabled.length}</span></h3>
  <ul class="dh-list">${model.untabled.map(renderFinding).join('\n')}</ul>
</section>`
    : '';

  const bodyContent = model.totalIssues === 0
    ? `<p class="dh-empty">${t('panel.driftHealth.empty')}</p>`
    : `${cards}\n${untabled}`;

  const body = `
<header class="dh-header">
  <h2>${t('panel.driftHealth.title')}</h2>
  <button class="dh-refresh" data-action="refresh">${t('panel.driftHealth.btn.refresh')}</button>
</header>
<p class="dh-intro">${t('panel.driftHealth.intro')}</p>
<p class="dh-count">${t('panel.driftHealth.count', model.totalIssues)}</p>
${bodyContent}`;

  return wrapHtml(body);
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px;
    line-height: 1.4;
  }
  .dh-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .dh-header h2 { margin: 0; }
  .dh-refresh {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;
  }
  .dh-refresh:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .dh-intro { opacity: 0.75; font-size: 13px; margin: 6px 0 2px; }
  .dh-count { opacity: 0.6; font-size: 12px; margin: 0 0 16px; }
  .dh-empty { opacity: 0.7; font-style: italic; }
  .dh-card {
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;
    background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
  }
  .dh-table { margin: 0 0 10px; font-size: 15px; }
  .dh-table-count, .dh-col-count {
    display: inline-block; min-width: 18px; text-align: center;
    font-size: 11px; font-weight: 600; opacity: 0.7; margin-left: 6px;
    padding: 0 6px; border-radius: 9px;
    border: 1px solid var(--vscode-panel-border, #555);
  }
  .dh-cols { display: flex; flex-wrap: wrap; gap: 16px; }
  .dh-col { flex: 1 1 220px; min-width: 200px; }
  .dh-col-label { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.85; }
  .dh-list { list-style: none; margin: 0; padding: 0; }
  .dh-finding { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 4px 0; }
  .dh-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .dh-dot-error { background: #dc3545; }
  .dh-dot-warning { background: #e0a800; }
  .dh-dot-info { background: #0e639c; }
  .dh-title { font-size: 13px; }
  .dh-rule { font-size: 11px; opacity: 0.6; }
  .dh-detail { flex-basis: 100%; font-size: 12px; opacity: 0.7; margin-left: 14px; }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    vscode.postMessage({ command: btn.dataset.action });
  });
</script>
</body>
</html>`;
}
