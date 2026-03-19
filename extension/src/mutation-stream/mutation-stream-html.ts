/**
 * Builds self-contained HTML for the mutation stream panel.
 */

import type { MutationEvent, MutationType } from '../api-types';
import type { MutationStreamFilters } from './mutation-stream-types';

function esc(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) {
    s = '';
  } else if (typeof value === 'string') {
    s = value;
  } else if (
    typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  ) {
    s = String(value);
  } else if (typeof value === 'object') {
    try {
      s = JSON.stringify(value);
    } catch {
      s = '"[unserializable object]"';
    }
  } else if (typeof value === 'function') {
    s = '[function]';
  } else if (typeof value === 'symbol') {
    s = value.toString();
  } else {
    s = '[unhandled]';
  }
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function typeClass(type: MutationType): string {
  switch (type) {
    case 'insert':
      return 'insert';
    case 'update':
      return 'update';
    case 'delete':
      return 'delete';
  }
}

function previewFromEvent(event: MutationEvent): string {
  if (event.type === 'insert') {
    return event.after?.[0] ? JSON.stringify(event.after[0]) : 'No row snapshot';
  }
  if (event.type === 'delete') {
    return event.before?.[0] ? JSON.stringify(event.before[0]) : 'No row snapshot';
  }
  // update
  const after0 = event.after?.[0];
  const before0 = event.before?.[0];
  if (before0 && after0) {
    return `${JSON.stringify(before0)} -> ${JSON.stringify(after0)}`;
  }
  if (after0) return JSON.stringify(after0);
  if (before0) return JSON.stringify(before0);
  return 'No row snapshot';
}

function optionSelected(selected: string, value: string): string {
  return selected === value ? ' selected' : '';
}

export function buildMutationStreamLoadingHtml(args?: {
  message?: string;
}): string {
  const message = args?.message ?? 'Loading schema…';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-editor-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 12px;
      margin: 0;
      line-height: 1.4;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 140px;
      text-align: center;
    }
    .wrap { width: 100%; max-width: 420px; }
    .title { font-weight: 800; margin-bottom: 8px; opacity: 0.95; }
    .msg { opacity: 0.8; font-size: 12px; margin-bottom: 14px; }
    .spinner {
      margin: 0 auto 10px auto;
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: 3px solid rgba(255,255,255,0.12);
      border-top-color: rgba(30,144,255,0.85);
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
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
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-editor-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 12px;
      margin: 0;
      line-height: 1.4;
    }
    .header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom: 10px; }
    .title { font-size: 14px; font-weight: 700; opacity: 0.95; }
    .subtitle { font-size: 12px; opacity: 0.7; margin-top: 2px; }
    .toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin: 8px 0 12px; padding: 10px; border: 1px solid var(--vscode-panel-border, #333); border-radius: 6px; }
    label { font-size: 12px; opacity: 0.85; }
    select, input {
      background: var(--vscode-input-background, #2d2d2d);
      color: var(--vscode-input-foreground, #ccc);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
    }
    .btn {
      background: var(--vscode-button-background, #1e90ff);
      color: var(--vscode-button-foreground, #fff);
      border: none;
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      white-space:nowrap;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground, #3a9cff); }
    .cards { display:flex; flex-direction:column; gap: 10px; }
    .card {
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 8px;
      padding: 10px;
      background: rgba(255,255,255,0.02);
    }
    .card.insert { border-color: rgba(40,167,69,0.35); }
    .card.update { border-color: rgba(255,193,7,0.35); }
    .card.delete { border-color: rgba(220,53,69,0.35); }
    .card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .card-title { display:flex; align-items:center; gap: 10px; flex-wrap:wrap; }
    .badge {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.3px;
      background: rgba(255,255,255,0.06);
    }
    .badge.insert { background: rgba(40,167,69,0.18); color: #7CFFB0; }
    .badge.update { background: rgba(255,193,7,0.14); color: #FFE68A; }
    .badge.delete { background: rgba(220,53,69,0.14); color: #FF9BA2; }
    .tbl { font-weight: 800; }
    .ts { font-size: 12px; opacity: 0.75; }
    .card-actions { display:flex; gap: 10px; align-items:flex-start; flex-wrap:wrap; justify-content:flex-end; }
    details.sql { font-size: 12px; opacity: 0.9; }
    pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
    .preview { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(128,128,128,0.18); }
    .empty { opacity: 0.65; font-style: italic; margin: 20px 0; }
  </style>
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

  <script>
    const vscode = acquireVsCodeApi();
    const tableSelect = document.getElementById('tableSelect');
    const opSelect = document.getElementById('opSelect');
    const modeSelect = document.getElementById('modeSelect');
    const searchInput = document.getElementById('searchInput');
    const columnSelect = document.getElementById('columnSelect');
    const valueInput = document.getElementById('valueInput');
    const pauseBtn = document.getElementById('pauseBtn');
    const exportBtn = document.getElementById('exportBtn');

    function debounceFactory(ms) {
      let t = undefined;
      return (fn) => {
        if (t) clearTimeout(t);
        t = setTimeout(fn, ms);
      };
    }

    function postFilters() {
      const next = {
        command: 'filters',
        filters: {
          table: tableSelect.value,
          type: opSelect.value,
          mode: modeSelect.value,
          search: searchInput?.value || '',
          column: columnSelect?.value || '',
          columnValue: valueInput?.value || ''
        }
      };
      vscode.postMessage(next);
    }

    tableSelect.addEventListener('change', postFilters);
    opSelect.addEventListener('change', postFilters);
    const debouncedFreeText = debounceFactory(150);
    searchInput.addEventListener('input', () => debouncedFreeText(postFilters));
    modeSelect.addEventListener('change', postFilters);
    columnSelect.addEventListener('change', postFilters);

    const debouncedColumnValue = debounceFactory(150);
    valueInput.addEventListener('input', () => debouncedColumnValue(postFilters));

    // Immediate toggle for perceived responsiveness; the panel will re-render
    // to keep the button label/filters in sync.
    let isPaused = ${paused ? 'true' : 'false'};
    function updatePauseLabel() {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    }
    updatePauseLabel();
    pauseBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      updatePauseLabel();
      vscode.postMessage({ command: 'togglePause', paused: isPaused });
    });

    exportBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportJson' });
    });

    document.getElementById('cards').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action="viewRow"]');
      if (!btn) return;
      const eventId = Number(btn.dataset.eventId);
      vscode.postMessage({ command: 'viewRow', eventId });
    });

    // Initial ready handshake.
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}

