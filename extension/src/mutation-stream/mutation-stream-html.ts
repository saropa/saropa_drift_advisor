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

export function buildMutationStreamLoadingHtml(args?: {
  message?: string;
}): string {
  const message = args?.message ?? 'Loading schema…';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${MUTATION_STREAM_LOADING_STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="title">Mutation Stream</div>
    <div class="msg">${esc(message)}</div>
    <div class="spinner" aria-label="Loading"></div>
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
    `<option value=""${filters.table === '' ? ' selected' : ''}>All tables</option>`,
    ...tables.map((t) => `<option value="${esc(t)}"${optionSelected(filters.table, t)}>${esc(t)}</option>`),
  ].join('');

  const typeOptions: Array<[MutationStreamFilters['type'], string]> = [
    ['all', 'All operations'],
    ['insert', 'INSERT'],
    ['update', 'UPDATE'],
    ['delete', 'DELETE'],
  ];

  const opOptions = typeOptions
    .map(([v, label]) => `<option value="${v}"${filters.type === v ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const modeOptions: Array<[MutationStreamFilters['mode'], string]> = [
    ['freeText', 'Free-text Search'],
    ['columnValue', 'Column value'],
  ];
  const modeSelect = modeOptions
    .map(([v, label]) => `<option value="${v}"${filters.mode === v ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const pauseLabel = paused ? 'Resume' : 'Pause';

  const columnOptions = columns.length > 0
    ? columns.map((c) => `<option value="${esc(c)}"${filters.column === c ? ' selected' : ''}>${esc(c)}</option>`)
      .join('')
    : `<option value="" selected>No columns available</option>`;

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
                  <button class="btn" data-action="viewRow" data-event-id="${esc(e.id)}">View Row</button>
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
    : `<p class="empty">No events yet (or filtered out).</p>`;

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
      <div class="title">Mutation Stream</div>
      <div class="subtitle">${paused ? 'Paused' : 'Live'} — filter and inspect semantic INSERT/UPDATE/DELETE events.</div>
    </div>
  </div>

  <div class="toolbar">
    <label>Table</label>
    <select id="tableSelect">${tableOptions}</select>
    <label>Operation</label>
    <select id="opSelect">${opOptions}</select>

    <label>Filter</label>
    <select id="modeSelect">${modeSelect}</select>

    <label id="searchLabel" style="display:${filters.mode === 'freeText' ? 'inline-block' : 'none'};">Search</label>
    <input
      id="searchInput"
      type="text"
      placeholder="Search values…"
      style="display:${filters.mode === 'freeText' ? 'inline-block' : 'none'};"
      value="${esc(filters.search)}"
    />

    <label id="columnLabel" style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};">Column</label>
    <select
      id="columnSelect"
      style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};"
    >
      ${columnOptions}
    </select>

    <label id="valueLabel" style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};">Value</label>
    <input
      id="valueInput"
      type="text"
      placeholder="Match value…"
      style="display:${filters.mode === 'columnValue' ? 'inline-block' : 'none'};"
      value="${esc(filters.columnValue)}"
    />
    <button class="btn" id="pauseBtn">${esc(pauseLabel)}</button>
    <button class="btn" id="exportBtn">Export JSON</button>
  </div>

  <div class="cards" id="cards">
    ${cards}
  </div>

  <script>${mutationStreamScript(paused)}</script>
</body>
</html>`;
}

