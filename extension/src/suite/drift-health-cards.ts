/**
 * Row/column/card rendering helpers for the Drift Health panel (plan 67 R4):
 * a per-table join of the three suite lenses. Theme-aware via `--vscode-*`
 * variables (light / dark / high contrast); all dynamic text is HTML-escaped.
 */
import type { SuiteDiagnostic } from './suite-diagnostics';
import type { DriftHealthModel, DriftHealthTable } from './drift-health';
import {
  renderSuiteFixButton,
  type SuiteRenderOptions,
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
export function renderFinding(
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
export function renderTable(
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
export function severityCounts(model: DriftHealthModel): {
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
