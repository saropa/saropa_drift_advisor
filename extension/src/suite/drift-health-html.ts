/**
 * HTML for the Drift Health panel (plan 67 R4): a per-table join of the three
 * suite lenses. Theme-aware via `--vscode-*` variables (light / dark / high
 * contrast); all dynamic text is HTML-escaped.
 */
import type { DriftHealthModel } from './drift-health';
import { type SuiteRenderOptions } from './suite-notes-html';
import { t } from '../l10n';
import { renderFinding, renderTable, severityCounts } from './drift-health-cards';
import { wrapHtml } from './drift-health-shell';

/**
 * Build the full Drift Health panel HTML for [model]. [currentCommit], when
 * known, flags findings captured at a different commit as stale (plan 67 R6).
 * [opts] gates per-finding fix-action buttons to available commands (plan 67 R1).
 * [truncated] shows a banner when Advisor's live anomaly scan hit its
 * wall-clock budget and stopped before checking every table — the findings
 * below are then partial, not a complete scan (see the anomaly-scan
 * performance fix that added the underlying `truncated` envelope flag).
 */
export function buildDriftHealthHtml(
  model: DriftHealthModel,
  currentCommit?: string,
  opts?: SuiteRenderOptions,
  truncated = false,
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

  const truncatedBanner = truncated
    ? `<p class="dh-truncated" role="status">${t('panel.driftHealth.truncated')}</p>`
    : '';

  const body = `
<header class="dh-header">
  <h2>${t('panel.driftHealth.title')}</h2>
  <button class="dh-refresh" data-action="refresh">${t('panel.driftHealth.btn.refresh')}</button>
</header>
<p class="dh-intro">${t('panel.driftHealth.intro')}</p>
${truncatedBanner}
<p class="dh-count">${t('panel.driftHealth.count', model.totalIssues)}</p>
${bodyContent}`;

  return wrapHtml(body);
}
