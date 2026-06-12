/**
 * HTML shell for the Query Replay DVR webview (toolbar, filters, timeline, detail).
 */

import type { IRecordedQueryV1 } from '../api-types';
import { t } from '../l10n';

export interface IDvrPanelHtmlState {
  recording: boolean;
  sessionId: string;
  count: number;
  maxQueries?: number;
  captureBeforeAfter?: boolean;
  error: string;
  searchText: string;
  kindFilter: 'all' | 'reads' | 'writes';
  tableFilter: string;
  /** Chronological order (ascending id) for timeline navigation. */
  timelineQueries: IRecordedQueryV1[];
  /** Currently focused query id within [timelineQueries], or null. */
  focusedId: number | null;
  /** Escaped HTML block for params / before / after (may be empty). */
  detailHtml: string;
}

/** Escapes text for safe insertion into HTML text nodes and attributes. */
export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rowHtml(q: IRecordedQueryV1, focusedId: number | null): string {
  const rowCount = q.type === 'select' ? q.resultRowCount : q.affectedRowCount;
  const tableHint = q.table ? ` · ${escapeHtml(q.table)}` : '';
  const sel = focusedId === q.id ? ' selected' : '';
  return `<div class="row${sel}" data-id="${q.id}" data-session="${escapeHtml(q.sessionId)}">
  <div class="meta">#${q.id} · ${q.type.toUpperCase()}${tableHint} · ${q.durationMs.toFixed(1)}ms · rows=${rowCount}</div>
  <pre>${escapeHtml(q.sql)}</pre>
</div>`;
}

/**
 * Builds the full DVR panel document for a [vscode.Webview].
 */
export function buildDvrPanelHtml(state: IDvrPanelHtmlState): string {
  const tq = state.timelineQueries;
  const pos =
    state.focusedId === null
      ? 0
      : Math.max(0, tq.findIndex((q) => q.id === state.focusedId)) + 1;
  const total = tq.length;
  const posLabel = total === 0 ? '—' : t('panel.replay.dvr.timeline.pos', pos, total);

  const rows =
    tq.length === 0
      ? `<div class="empty">${t('panel.replay.dvr.empty')}</div>`
      : tq
          .map((q) => rowHtml(q, state.focusedId))
          .join('\n');

  const cap = state.captureBeforeAfter === undefined ? '—' : String(state.captureBeforeAfter);
  const maxQ = state.maxQueries === undefined ? '—' : String(state.maxQueries);

  const selAll = state.kindFilter === 'all' ? 'selected' : '';
  const selReads = state.kindFilter === 'reads' ? 'selected' : '';
  const selWrites = state.kindFilter === 'writes' ? 'selected' : '';

  const detail =
    state.detailHtml.length > 0
      ? `<div class="detail"><div class="detailTitle">${t('panel.replay.dvr.detail.title')}</div>${state.detailHtml}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 12px; color: var(--vscode-foreground); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; align-items: center; }
    .timeline { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; align-items: center; }
    button { padding: 4px 10px; }
    input, select { padding: 4px 6px; min-width: 120px; }
    .status { margin-bottom: 10px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .row { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 8px; padding: 8px; cursor: pointer; }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .row.selected { outline: 1px solid var(--vscode-focusBorder); }
    .meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    pre { margin: 0; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .empty { opacity: 0.8; }
    .error { color: var(--vscode-errorForeground); margin-bottom: 8px; }
    .detail { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; margin-bottom: 10px; max-height: 220px; overflow: auto; }
    .detailTitle { font-weight: 600; margin-bottom: 6px; }
    .detail pre { font-size: 11px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="start">${t('panel.replay.dvr.btn.start')}</button>
    <button id="pause">${t('panel.replay.dvr.btn.pause')}</button>
    <button id="stop">${t('panel.replay.dvr.btn.stop')}</button>
    <button id="refresh">${t('panel.replay.dvr.btn.refresh')}</button>
    <button id="export">${t('panel.replay.dvr.btn.export')}</button>
    <button id="openSql">${t('panel.replay.dvr.btn.openSql')}</button>
    <button id="openNotebook">${t('panel.replay.dvr.btn.openNotebook')}</button>
    <button id="analyzeCost">${t('panel.replay.dvr.btn.analyzeCost')}</button>
    <button id="openSnapshotDiff" title="${t('panel.replay.dvr.btn.snapshotDiff.title')}">${t('panel.replay.dvr.btn.snapshotDiff')}</button>
    <button id="openSchemaRollback" title="${t('panel.replay.dvr.btn.schemaRollback.title')}">${t('panel.replay.dvr.btn.schemaRollback')}</button>
  </div>
  <div class="timeline">
    <span>${t('panel.replay.dvr.timeline.label')} <strong>${escapeHtml(posLabel)}</strong></span>
    <button id="first">|◀</button>
    <button id="prev">◀</button>
    <button id="next">▶</button>
    <button id="last">▶|</button>
  </div>
  <div class="filters">
    <label>${t('panel.replay.dvr.filter.search')} <input type="text" id="search" value="${escapeHtml(state.searchText)}" placeholder="${t('panel.replay.dvr.filter.search.placeholder')}" /></label>
    <label>${t('panel.replay.dvr.filter.kind')} <select id="kind">
      <option value="all" ${selAll}>${t('panel.replay.dvr.filter.kind.all')}</option>
      <option value="reads" ${selReads}>${t('panel.replay.dvr.filter.kind.reads')}</option>
      <option value="writes" ${selWrites}>${t('panel.replay.dvr.filter.kind.writes')}</option>
    </select></label>
    <label>${t('panel.replay.dvr.filter.table')} <input type="text" id="tableFilter" value="${escapeHtml(state.tableFilter)}" placeholder="${t('panel.replay.dvr.filter.table.placeholder')}" /></label>
    <button id="applyFilters">${t('panel.replay.dvr.filter.apply')}</button>
  </div>
  <div class="status">${t('panel.replay.dvr.status.line', state.recording ? t('panel.replay.dvr.status.recording') : t('panel.replay.dvr.status.stopped'), escapeHtml(state.sessionId), state.count, maxQ, cap)}</div>
  ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ''}
  ${detail}
  ${rows}
  <script>
    const vscode = acquireVsCodeApi();
    function post(cmd, payload) { vscode.postMessage(Object.assign({ command: cmd }, payload || {})); }
    document.getElementById('start').addEventListener('click', () => post('start'));
    document.getElementById('pause').addEventListener('click', () => post('pause'));
    document.getElementById('stop').addEventListener('click', () => post('stop'));
    document.getElementById('refresh').addEventListener('click', () => post('refresh'));
    document.getElementById('export').addEventListener('click', () => post('export'));
    document.getElementById('openSql').addEventListener('click', () => post('openSql'));
    document.getElementById('openNotebook').addEventListener('click', () => post('openNotebook'));
    document.getElementById('analyzeCost').addEventListener('click', () => post('analyzeCost'));
    document.getElementById('openSnapshotDiff').addEventListener('click', () => post('openSnapshotDiff'));
    document.getElementById('openSchemaRollback').addEventListener('click', () => post('openSchemaRollback'));
    document.getElementById('first').addEventListener('click', () => post('step', { which: 'first' }));
    document.getElementById('prev').addEventListener('click', () => post('step', { which: 'prev' }));
    document.getElementById('next').addEventListener('click', () => post('step', { which: 'next' }));
    document.getElementById('last').addEventListener('click', () => post('step', { which: 'last' }));
    document.getElementById('applyFilters').addEventListener('click', () => post('filters', {
      text: document.getElementById('search').value,
      kind: document.getElementById('kind').value,
      table: document.getElementById('tableFilter').value,
    }));
    document.querySelectorAll('.row').forEach((el) => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.row').forEach((r) => r.classList.remove('selected'));
        el.classList.add('selected');
        post('select', { id: Number(el.dataset.id), sessionId: el.dataset.session });
      });
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Home') { ev.preventDefault(); post('step', { which: 'first' }); }
      else if (ev.key === 'End') { ev.preventDefault(); post('step', { which: 'last' }); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); post('step', { which: 'prev' }); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); post('step', { which: 'next' }); }
    });
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}
