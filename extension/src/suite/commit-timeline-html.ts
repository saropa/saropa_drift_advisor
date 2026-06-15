/**
 * HTML for the Suite Commit Timeline panel (plan 67 R6 / §6): finding counts per
 * commit over time. Theme-aware via `--vscode-*` variables (light / dark / high
 * contrast); all dynamic text is HTML-escaped. Read-only — no fix actions.
 */
import type { TimelineModel, TimelineRow } from './commit-timeline';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

const esc = escapeHtml;

/** Compact, locale-stable capture time: `2026-06-14 09:31` from the ISO string. */
function formatWhen(iso: string): string {
  // Avoid Date/locale formatting so the output is deterministic and testable;
  // the stored value is already UTC ISO 8601.
  return iso.replace('T', ' ').slice(0, 16);
}

/** The delta label + CSS modifier for a row's change versus the previous commit. */
function deltaParts(row: TimelineRow): { text: string; cls: string } {
  if (row.deltaTotal === null) {
    return { text: t('panel.commitTimeline.delta.first'), cls: 'ct-delta-first' };
  }
  if (row.deltaTotal > 0) {
    // More findings than the previous commit — a regression.
    return { text: t('panel.commitTimeline.delta.up', row.deltaTotal), cls: 'ct-delta-up' };
  }
  if (row.deltaTotal < 0) {
    // Fewer findings — an improvement. Strip the sign for the localized label.
    return { text: t('panel.commitTimeline.delta.down', -row.deltaTotal), cls: 'ct-delta-down' };
  }
  return { text: t('panel.commitTimeline.delta.same'), cls: 'ct-delta-same' };
}

/** A stacked severity bar scaled to the busiest commit, so rows are comparable. */
function severityBar(row: TimelineRow, maxTotal: number): string {
  // Width is share of the busiest commit's total; a per-row bar would hide the
  // trend. info = whatever is neither error nor warning.
  const info = Math.max(0, row.total - row.errors - row.warnings);
  const denom = maxTotal > 0 ? maxTotal : 1;
  const pct = (n: number): string => `${((n / denom) * 100).toFixed(1)}%`;
  const seg = (cls: string, n: number): string =>
    n > 0 ? `<span class="ct-seg ${cls}" style="width:${pct(n)}"></span>` : '';
  return `<div class="ct-bar" aria-hidden="true">
    ${seg('ct-seg-error', row.errors)}
    ${seg('ct-seg-warning', row.warnings)}
    ${seg('ct-seg-info', info)}
  </div>`;
}

/** One tool chip; dimmed (not hidden) when the tool had nothing at this commit. */
function toolChip(labelKey: string, count: number): string {
  return `<span class="ct-tool${count === 0 ? ' ct-zero' : ''}">`
    + `${t(labelKey)}: <strong>${count}</strong></span>`;
}

/** Renders one commit row. */
function renderRow(row: TimelineRow, maxTotal: number): string {
  const delta = deltaParts(row);
  const current = row.isCurrent
    ? ` <span class="ct-current">${t('panel.commitTimeline.current')}</span>`
    : '';
  return `<li class="ct-row${row.isCurrent ? ' ct-is-current' : ''}">
  <div class="ct-row-head">
    <code class="ct-sha" title="${esc(row.commitSha)}">${esc(row.shortSha)}</code>${current}
    <span class="ct-when">${esc(formatWhen(row.generatedAt))}</span>
    <span class="ct-total">${row.total}</span>
    <span class="ct-delta ${delta.cls}">${esc(delta.text)}</span>
  </div>
  ${severityBar(row, maxTotal)}
  <div class="ct-meta">
    <span class="ct-sev">${t('panel.commitTimeline.severity', row.errors, row.warnings)}</span>
    <span class="ct-tools">
      ${toolChip('panel.commitTimeline.tool.advisor', row.advisor)}
      ${toolChip('panel.commitTimeline.tool.lints', row.lints)}
      ${toolChip('panel.commitTimeline.tool.logCapture', row.logCapture)}
    </span>
  </div>
</li>`;
}

/** Builds the full Commit Timeline panel HTML for [model]. */
export function buildCommitTimelineHtml(model: TimelineModel): string {
  const body = model.commitCount === 0
    ? `<p class="ct-empty">${t('panel.commitTimeline.empty')}</p>`
    : `<ol class="ct-list">${model.rows.map((r) => renderRow(r, model.maxTotal)).join('\n')}</ol>`;

  const header = `
<header class="ct-header">
  <h2>${t('panel.commitTimeline.title')}</h2>
  <button class="ct-refresh" data-action="refresh">${t('panel.commitTimeline.btn.refresh')}</button>
</header>
<p class="ct-intro">${t('panel.commitTimeline.intro')}</p>
<p class="ct-count">${t('panel.commitTimeline.count', model.commitCount)}</p>
${body}`;

  return wrapHtml(header);
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
  .ct-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .ct-header h2 { margin: 0; }
  .ct-refresh {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;
  }
  .ct-refresh:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .ct-refresh:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px;
  }
  .ct-intro { opacity: 0.75; font-size: 13px; margin: 6px 0 2px; }
  .ct-count { opacity: 0.6; font-size: 12px; margin: 0 0 16px; }
  .ct-empty { opacity: 0.7; font-style: italic; }
  .ct-list { list-style: none; margin: 0; padding: 0; }
  .ct-row {
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 6px; padding: 10px 12px; margin-bottom: 10px;
    background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
  }
  .ct-is-current { border-color: var(--vscode-focusBorder, #007fd4); }
  .ct-row-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
  .ct-sha { font-size: 13px; font-weight: 600; }
  .ct-current {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 0 5px; border-radius: 8px;
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
  }
  .ct-when { font-size: 11px; opacity: 0.6; }
  .ct-total {
    margin-inline-start: auto; font-size: 14px; font-weight: 600;
  }
  .ct-delta { font-size: 11px; padding: 0 6px; border-radius: 8px; }
  .ct-delta-up { color: var(--vscode-charts-red, #e51400); }
  .ct-delta-down { color: var(--vscode-charts-green, #388a34); }
  .ct-delta-same, .ct-delta-first { opacity: 0.6; }
  .ct-bar {
    display: flex; height: 8px; margin: 8px 0 6px; border-radius: 4px; overflow: hidden;
    background: var(--vscode-input-background, #3c3c3c);
  }
  .ct-seg { height: 100%; }
  .ct-seg-error { background: var(--status-bad); }
  .ct-seg-warning { background: var(--accent-warning); }
  .ct-seg-info { background: var(--accent-info); }
  .ct-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; }
  .ct-sev { opacity: 0.8; }
  .ct-tools { display: flex; flex-wrap: wrap; gap: 8px; }
  .ct-tool {
    border: 1px solid var(--vscode-panel-border, #555); border-radius: 4px; padding: 0 6px;
  }
  .ct-zero { opacity: 0.45; }
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
</script>
</body>
</html>`;
}
