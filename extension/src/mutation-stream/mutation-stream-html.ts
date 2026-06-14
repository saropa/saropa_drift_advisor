/**
 * Builds self-contained HTML for the mutation stream panel.
 */

import type { MutationEvent } from '../api-types';
import type { MutationStreamFilters } from './mutation-stream-types';
import { esc, optionSelected, previewFromEvent, typeClass } from './mutation-stream-html-helpers';
import {
  MUTATION_STREAM_LOADING_STYLES,
  MUTATION_STREAM_STYLES,
  mutationStreamScript,
} from './mutation-stream-webview-assets';
import { t } from '../l10n';

export function buildMutationStreamLoadingHtml(args?: {
  message?: string;
}): string {
  const message = args?.message ?? t('panel.replay.mutation.loading');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${MUTATION_STREAM_LOADING_STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="title">${t('panel.replay.mutation.title')}</div>
    <div class="msg">${esc(message)}</div>
    <div class="spinner" aria-label="${t('panel.replay.mutation.loading.aria')}"></div>
  </div>
</body>
</html>`;
}

export function buildMutationStreamHtml(args: {
  events: readonly MutationEvent[];
  filters: MutationStreamFilters;
  paused: boolean;
  tables: readonly string[];
  columns: readonly string[];
}): string {
  const { events, filters, paused, tables, columns } = args;

  const tableOptions = [
    `<option value=""${filters.table === '' ? ' selected' : ''}>${t('panel.replay.mutation.filter.table.all')}</option>`,
    ...tables.map((tbl) => `<option value="${esc(tbl)}"${optionSelected(filters.table, tbl)}>${esc(tbl)}</option>`),
  ].join('');

  // INSERT/UPDATE/DELETE are SQL operation keywords (data), kept literal; the
  // "All operations" catch-all is prose and is externalized.
  const typeOptions: Array<[MutationStreamFilters['type'], string]> = [
    ['all', t('panel.replay.mutation.filter.op.all')],
    ['insert', 'INSERT'],
    ['update', 'UPDATE'],
    ['delete', 'DELETE'],
  ];

  const opOptions = typeOptions
    .map(([v, label]) => `<option value="${v}"${filters.type === v ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const modeOptions: Array<[MutationStreamFilters['mode'], string]> = [
    ['freeText', t('panel.replay.mutation.filter.mode.freeText')],
    ['columnValue', t('panel.replay.mutation.filter.mode.columnValue')],
  ];
  const modeSelect = modeOptions
    .map(([v, label]) => `<option value="${v}"${filters.mode === v ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const pauseLabel = paused ? t('panel.replay.mutation.btn.resume') : t('panel.replay.mutation.btn.pause');

  const columnOptions = columns.length > 0
    ? columns.map((c) => `<option value="${esc(c)}"${filters.column === c ? ' selected' : ''}>${esc(c)}</option>`)
      .join('')
    : `<option value="" selected>${t('panel.replay.mutation.filter.column.none')}</option>`;

  const cards = events.length
    ? events
        .map((e) => {
          const cls = typeClass(e.type);
          const preview = previewFromEvent(e);
          return `
            <div class="card ${cls}" data-event-id="${esc(e.id)}">
              <div class="card-top">
                <div class="card-title">
                  <span class="badge ${cls}">${esc(e.type.toUpperCase())}</span>
                  <span class="tbl">${esc(e.table)}</span>
                  <span class="ts">${esc(e.timestamp)}</span>
                </div>
                <div class="card-actions">
                  <button class="btn" data-action="viewRow" data-event-id="${esc(e.id)}">${t('panel.replay.mutation.card.viewRow')}</button>
                  <details class="sql">
                    <summary>SQL</summary>
                    <pre>${esc(e.sql)}</pre>
                  </details>
                </div>
              </div>
              <div class="preview">
                <pre>${esc(preview)}</pre>
              </div>
            </div>
          `;
        })
        .join('\n')
    : `<p class="empty">${t('panel.replay.mutation.empty')}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${MUTATION_STREAM_STYLES}</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${t('panel.replay.mutation.title')}</div>
      <div class="subtitle">${t('panel.replay.mutation.subtitle', paused ? t('panel.replay.mutation.status.paused') : t('panel.replay.mutation.status.live'))}</div>
    </div>
  </div>

  <div class="toolbar">
    <label>${t('panel.replay.mutation.filter.table')}</label>
    <select id="tableSelect">${tableOptions}</select>
    <label>${t('panel.replay.mutation.filter.operation')}</label>
    <select id="opSelect">${opOptions}</select>

    <label>${t('panel.replay.mutation.filter.mode')}</label>
    <select id="modeSelect">${modeSelect}</select>

    <label id="searchLabel" style="display:${filters.mode === 'freeText' ? 'inline-block' : 'none'};">${t('panel.replay.mutation.filter.search')}</label>
    <input
      id="searchInput"
      type="text"
      placeholder="${t('panel.replay.mutation.filter.search.placeholder')}"
      style="display:${filters.mode === 'freeText' ? 'inline-block' : 'none'};"
      value="${esc(filters.search)}"
    />

    <label id="columnLabel" style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};">${t('panel.replay.mutation.filter.column')}</label>
    <select
      id="columnSelect"
      style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};"
    >
      ${columnOptions}
    </select>

    <label id="valueLabel" style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};">${t('panel.replay.mutation.filter.value')}</label>
    <input
      id="valueInput"
      type="text"
      placeholder="${t('panel.replay.mutation.filter.value.placeholder')}"
      style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};"
      value="${esc(filters.columnValue)}"
    />
    <button class="btn" id="pauseBtn">${esc(pauseLabel)}</button>
    <button class="btn" id="exportBtn">${t('panel.replay.mutation.btn.export')}</button>
  </div>

  <div class="cards" id="cards">
    ${cards}
  </div>

  <script nonce="__CSP_NONCE__">${mutationStreamScript(paused)}</script>
</body>
</html>`;
}

