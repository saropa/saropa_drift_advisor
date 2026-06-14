/**
 * HTML for the Drift Health panel (plan 67 R4): a per-table join of the three
 * suite lenses. Theme-aware via `--vscode-*` variables (light / dark / high
 * contrast); all dynamic text is HTML-escaped.
 */
import type { SuiteDiagnostic } from './suite-diagnostics';
import type { DriftHealthModel, DriftHealthTable } from './drift-health';
import {
  renderSuiteFixButton,
  type SuiteRenderOptions,
  SUITE_NOTES_SCRIPT,
} from './suite-notes-html';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

const esc = escapeHtml;

/**
 * A finding is stale when it was captured at a known commit that differs from
 * the current checkout (plan 67 R6) — it may no longer reflect this code. A
 * finding with no commit, or when the current commit is unknown, is never
 * marked (we don't guess).
 */
function isStale(d: SuiteDiagnostic, currentCommit?: string): boolean {
  return Boolean(currentCommit && d.commitSha && d.commitSha !== currentCommit);
}

/** Renders one finding row: severity dot, its own localized title/detail, rule id, fix. */
function renderFinding(
  d: SuiteDiagnostic,
  currentCommit?: string,
  opts?: SuiteRenderOptions,
): string {
  const sev = esc(d.severity ?? 'info');
  const title = esc(d.title ?? d.detail ?? d.ruleId ?? '');
  const detail = d.detail && d.detail !== d.title
    ? `<span class="dh-detail">${esc(d.detail)}</span>`
    : '';
  const rule = d.ruleId ? `<code class="dh-rule">${esc(d.ruleId)}</code>` : '';
  const fix = renderSuiteFixButton(d, opts);
  const stale = isStale(d, currentCommit)
    ? ` <span class="dh-stale" title="${esc(d.commitSha)}">${t('panel.driftHealth.stale')}</span>`
    : '';
  return `<li class="dh-finding dh-${sev}${stale ? ' dh-is-stale' : ''}" data-sev="${sev}">
  <span class="dh-dot dh-dot-${sev}" aria-hidden="true"></span>
  <span class="dh-title">${title}</span>
  ${rule}${fix}${stale}
  ${detail}
</li>`;
}

/** Renders one tool column within a table card; omitted when the tool has none. */
function renderColumn(
  labelKey: string,
  findings: SuiteDiagnostic[],
  currentCommit?: string,
  opts?: SuiteRenderOptions,
): string {
  if (findings.length === 0) return '';
  const items = findings.map((f) => renderFinding(f, currentCommit, opts)).join('\n');
  return `<div class="dh-col">
  <h4 class="dh-col-label">${t(labelKey)} <span class="dh-col-count">${findings.length}</span></h4>
  <ul class="dh-list">${items}</ul>
</div>`;
}

/** Renders one table card with its (non-empty) tool columns. */
function renderTable(
  group: DriftHealthTable,
  currentCommit?: string,
  opts?: SuiteRenderOptions,
): string {
  const cols = [
    renderColumn('panel.driftHealth.col.advisor', group.advisor, currentCommit, opts),
    renderColumn('panel.driftHealth.col.lints', group.lints, currentCommit, opts),
    renderColumn('panel.driftHealth.col.logCapture', group.logCapture, currentCommit, opts),
  ].join('\n');
  return `<section class="dh-card" data-total="${group.total}" data-table="${esc(group.table)}">
  <h3 class="dh-table">${esc(group.table)} <span class="dh-table-count">${group.total}</span></h3>
  <div class="dh-cols">${cols}</div>
</section>`;
}

/** Counts findings by severity across the whole model, for filter labels. */
function severityCounts(model: DriftHealthModel): {
  error: number;
  warning: number;
  info: number;
} {
  const counts = { error: 0, warning: 0, info: 0 };
  const tally = (d: SuiteDiagnostic): void => {
    const sev = d.severity === 'error' || d.severity === 'warning' ? d.severity : 'info';
    counts[sev]++;
  };
  for (const g of model.tables) {
    g.advisor.forEach(tally);
    g.lints.forEach(tally);
    g.logCapture.forEach(tally);
  }
  model.untabled.forEach(tally);
  return counts;
}

/**
 * Build the full Drift Health panel HTML for [model]. [currentCommit], when
 * known, flags findings captured at a different commit as stale (plan 67 R6).
 * [opts] gates per-finding fix-action buttons to available commands (plan 67 R1).
 */
export function buildDriftHealthHtml(
  model: DriftHealthModel,
  currentCommit?: string,
  opts?: SuiteRenderOptions,
): string {
  const cards = model.tables.map((tbl) => renderTable(tbl, currentCommit, opts)).join('\n');

  const untabled = model.untabled.length > 0
    ? `<section class="dh-card">
  <h3 class="dh-table">${t('panel.driftHealth.untabled')} <span class="dh-table-count">${model.untabled.length}</span></h3>
  <ul class="dh-list">${model.untabled.map((f) => renderFinding(f, currentCommit, opts)).join('\n')}</ul>
</section>`
    : '';

  // Toolbar: severity filter + sort (plan 67 R4 polish). Hidden in the empty
  // state where there is nothing to filter.
  const c = severityCounts(model);
  const toolbar = model.totalIssues === 0 ? '' : `
<div class="dh-toolbar" role="toolbar" aria-label="Drift Health filters">
  <div class="dh-filters">
    <button class="dh-filter active" data-sev-filter="all" aria-pressed="true">${t('panel.driftHealth.filter.all', model.totalIssues)}</button>
    ${c.error > 0 ? `<button class="dh-filter" data-sev-filter="error" aria-pressed="false">${t('panel.driftHealth.filter.errors', c.error)}</button>` : ''}
    ${c.warning > 0 ? `<button class="dh-filter" data-sev-filter="warning" aria-pressed="false">${t('panel.driftHealth.filter.warnings', c.warning)}</button>` : ''}
    ${c.info > 0 ? `<button class="dh-filter" data-sev-filter="info" aria-pressed="false">${t('panel.driftHealth.filter.info', c.info)}</button>` : ''}
  </div>
  <label class="dh-sort">${t('panel.driftHealth.sort.label')}
    <select class="dh-sort-select" aria-label="${t('panel.driftHealth.sort.label')}">
      <option value="count">${t('panel.driftHealth.sort.count')}</option>
      <option value="name">${t('panel.driftHealth.sort.name')}</option>
    </select>
  </label>
</div>`;

  const bodyContent = model.totalIssues === 0
    ? `<p class="dh-empty">${t('panel.driftHealth.empty')}</p>`
    : `${toolbar}\n<div id="dh-cards">${cards}</div>\n${untabled}`;

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
    font-size: 11px; font-weight: 600; opacity: 0.7; margin-inline-start: 6px;
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
  .dh-detail { flex-basis: 100%; font-size: 12px; opacity: 0.7; margin-inline-start: 14px; }
  .dh-finding.dh-is-stale { opacity: 0.55; }
  .dh-stale {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 0 5px; border-radius: 8px;
    color: var(--vscode-editorWarning-foreground, #e0a800);
    border: 1px solid var(--vscode-editorWarning-foreground, #e0a800);
  }
  .suite-fix {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
    border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
  }
  .suite-fix:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .dh-toolbar {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 14px;
  }
  .dh-filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .dh-filter {
    padding: 3px 10px; font-size: 12px; border-radius: 3px; cursor: pointer;
    border: 1px solid var(--vscode-panel-border, #555);
    background: transparent; color: var(--vscode-foreground, #ccc);
  }
  .dh-filter:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .dh-filter.active {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border-color: var(--vscode-button-background, #0e639c);
  }
  .dh-sort { font-size: 12px; opacity: 0.85; display: inline-flex; align-items: center; gap: 6px; }
  .dh-sort-select {
    background: var(--vscode-dropdown-background, #3c3c3c);
    color: var(--vscode-dropdown-foreground, #ccc);
    border: 1px solid var(--vscode-dropdown-border, #555); border-radius: 3px; padding: 2px 6px;
  }
  /* Visible keyboard focus for accessibility (design pass). */
  .dh-refresh:focus-visible, .dh-filter:focus-visible, .dh-sort-select:focus-visible, .suite-fix:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px;
  }
  .dh-hidden { display: none; }
</style>
</head>
<body>
${body}
<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    vscode.postMessage({ command: btn.dataset.action });
  });

  // Severity filter: show only findings of the chosen severity, then hide any
  // column/card that ends up with nothing visible (plan 67 R4 polish).
  function applyFilter(sev) {
    document.querySelectorAll('.dh-filter').forEach((b) => {
      const on = b.dataset.sevFilter === sev;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('.dh-finding').forEach((li) => {
      li.classList.toggle('dh-hidden', sev !== 'all' && li.dataset.sev !== sev);
    });
    document.querySelectorAll('.dh-col').forEach((col) => {
      const any = col.querySelector('.dh-finding:not(.dh-hidden)');
      col.classList.toggle('dh-hidden', !any);
    });
    document.querySelectorAll('.dh-card').forEach((card) => {
      const any = card.querySelector('.dh-finding:not(.dh-hidden)');
      card.classList.toggle('dh-hidden', !any);
    });
  }
  document.querySelectorAll('.dh-filter').forEach((b) => {
    b.addEventListener('click', () => applyFilter(b.dataset.sevFilter));
  });

  // Sort the table cards by finding count or table name.
  const sortSel = document.querySelector('.dh-sort-select');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      const host = document.getElementById('dh-cards');
      if (!host) return;
      const cards = Array.from(host.querySelectorAll('.dh-card'));
      cards.sort((a, b) => sortSel.value === 'name'
        ? (a.dataset.table || '').localeCompare(b.dataset.table || '')
        : (Number(b.dataset.total) - Number(a.dataset.total)));
      cards.forEach((c) => host.appendChild(c));
    });
  }
${SUITE_NOTES_SCRIPT}
</script>
</body>
</html>`;
}
