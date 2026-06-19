import type { IDiagramData, IDiagramTable } from '../api-types';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

const BOX_W = 220;
const BOX_GAP = 40;
const COLS = 3;

/** Build HTML for the schema diagram webview panel. */
export function buildDiagramHtml(data: IDiagramData): string {
  if (data.tables.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); }
.empty { padding: 32px; text-align: center; opacity: 0.6; }</style>
</head><body><div class="empty">${t('panel.schema.diagram.empty')}</div></body></html>`;
  }

  const positions = layoutTables(data.tables);
  const boxes = data.tables.map((t, i) => buildTableBox(t, positions[i]));
  const lines = data.foreignKeys.map((fk) => {
    const fromIdx = data.tables.findIndex((t) => t.name === fk.fromTable);
    const toIdx = data.tables.findIndex((t) => t.name === fk.toTable);
    if (fromIdx < 0 || toIdx < 0) return '';
    return buildFkLine(positions[fromIdx], positions[toIdx], fk.fromTable, fk.toTable);
  });

  const maxX = Math.max(...positions.map((p) => p.x)) + BOX_W + BOX_GAP;
  const maxY = Math.max(...positions.map((p) => p.y + p.h)) + BOX_GAP;

  // Distinct column types feed the type-filter dropdown. Sorted case-insensitively
  // for a stable, scannable list; the raw type string is the option value so the
  // client filter can match exactly.
  const typeSet = new Set<string>();
  for (const tbl of data.tables) {
    for (const c of tbl.columns) {
      if (c.type) typeSet.add(c.type);
    }
  }
  const typeOptions = [...typeSet]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((ty) => `<option value="${esc(ty)}">${esc(ty)}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); margin: 0; overflow: auto; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 6px;
             align-items: center; padding: 8px 12px;
             background: var(--vscode-editor-background);
             border-bottom: 1px solid var(--vscode-widget-border); }
  .toolbar input, .toolbar select {
             padding: 4px 8px; border: 1px solid var(--vscode-widget-border);
             border-radius: 3px; font-size: 12px; }
  .toolbar input { background: var(--vscode-input-background);
                   color: var(--vscode-input-foreground); min-width: 180px; }
  .toolbar select { background: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground); }
  .toolbar .btn { padding: 4px 10px; border-radius: 3px; cursor: pointer;
                  font-size: 12px;
                  border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
                  background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
                  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); }
  .toolbar .btn.active { background: var(--vscode-button-background);
                         color: var(--vscode-button-foreground);
                         border-color: var(--vscode-button-background); }
  .canvas { position: relative; min-width: ${maxX}px; min-height: ${maxY}px; }
  .tbl { position: absolute; width: ${BOX_W}px;
         border: 1px solid var(--vscode-widget-border);
         border-radius: 4px; background: var(--vscode-editor-background); }
  .tbl-header { padding: 6px 10px; font-weight: bold; font-size: 13px;
                background: var(--vscode-sideBarSectionHeader-background);
                border-bottom: 1px solid var(--vscode-widget-border);
                border-radius: 4px 4px 0 0; cursor: pointer; }
  .tbl-cols { padding: 4px 0; font-size: 12px; }
  .col-row { display: flex; padding: 2px 10px; gap: 6px; }
  .col-name { flex: 1; }
  .col-type { opacity: 0.6; }
  .pk { font-weight: bold; }
  svg { position: absolute; top: 0; left: 0; pointer-events: none; }
  line { stroke: var(--vscode-charts-blue); stroke-width: 1.5; }
  /* Field-filter states: highlight emphasizes matches and dims the rest; hidden
     removes the element entirely (used by the "Hide non-matching" toggle). */
  .col-row.match { color: var(--vscode-focusBorder); font-weight: bold; }
  .tbl.match { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
  .dim { opacity: 0.3; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="toolbar">
  <input type="search" id="fieldSearch"
    placeholder="${esc(t('panel.schema.filter.search.placeholder'))}"
    aria-label="${esc(t('panel.schema.filter.search.aria'))}" />
  <select id="typeFilter" aria-label="${esc(t('panel.schema.filter.type.aria'))}">
    <option value="">${t('panel.schema.filter.type.all')}</option>
    ${typeOptions}
  </select>
  <button class="btn active" id="highlightToggle" aria-pressed="true">${t('panel.schema.filter.highlight')}</button>
  <button class="btn" id="hideToggle" aria-pressed="false">${t('panel.schema.filter.hide')}</button>
</div>
<div class="canvas">
  <svg width="${maxX}" height="${maxY}">${lines.join('')}</svg>
  ${boxes.join('\n')}
</div>
<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('.tbl-header').forEach(el => {
    el.addEventListener('click', () => {
      vscode.postMessage({ command: 'copyTableName', name: el.dataset.table || el.textContent });
    });
  });

  // --- Field filter (search by field name/type, type dropdown, two toggles) ---
  // All matching is client-side: tables/columns carry data-name/data-type, and
  // FK lines carry data-from/data-to so they can be hidden with their endpoints.
  let filterText = '';
  let filterType = '';
  let highlightOn = true;
  let hideOn = false;

  function filterActive() {
    return filterText.trim() !== '' || filterType !== '';
  }
  function colMatches(name, type) {
    const q = filterText.trim().toLowerCase();
    const textHit = !q || name.toLowerCase().indexOf(q) >= 0 || type.toLowerCase().indexOf(q) >= 0;
    const typeHit = !filterType || type.toLowerCase() === filterType.toLowerCase();
    return textHit && typeHit;
  }
  function tableNameMatches(name) {
    const q = filterText.trim().toLowerCase();
    return !filterType && q !== '' && name.toLowerCase().indexOf(q) >= 0;
  }

  function applyFilter() {
    const active = filterActive();
    const visibleTables = {};
    document.querySelectorAll('.tbl').forEach(tbl => {
      const tableName = tbl.dataset.table || '';
      const rows = Array.prototype.slice.call(tbl.querySelectorAll('.col-row'));
      // First pass: does any column match? That decides table visibility and
      // whether hide-mode trims rows (a name-only match keeps every column).
      const rowMatch = rows.map(row => colMatches(row.dataset.name || '', row.dataset.type || ''));
      const anyColMatch = rowMatch.indexOf(true) >= 0;
      const nameOnly = tableNameMatches(tableName) && !anyColMatch;
      const tableMatched = anyColMatch || tableNameMatches(tableName);

      rows.forEach((row, i) => {
        const matched = rowMatch[i];
        // Highlight mode marks/dims columns in place.
        row.classList.toggle('match', highlightOn && active && matched);
        row.classList.toggle('dim', highlightOn && active && !matched);
        // Hide mode removes non-matching rows, except when the table is kept
        // only by its name (then all its columns stay visible).
        row.classList.toggle('hidden', hideOn && active && !matched && !nameOnly);
      });

      tbl.classList.toggle('match', highlightOn && active && tableMatched);
      tbl.classList.toggle('dim', highlightOn && active && !tableMatched);
      const hideTable = hideOn && active && !tableMatched;
      tbl.classList.toggle('hidden', hideTable);
      visibleTables[tableName] = !hideTable;
    });
    // Drop FK lines whose endpoint table is hidden so no line dangles in space.
    document.querySelectorAll('line[data-from]').forEach(ln => {
      const ok = visibleTables[ln.dataset.from] !== false && visibleTables[ln.dataset.to] !== false;
      ln.classList.toggle('hidden', !ok);
    });
  }

  document.getElementById('fieldSearch').addEventListener('input', e => {
    filterText = e.target.value; applyFilter();
  });
  document.getElementById('typeFilter').addEventListener('change', e => {
    filterType = e.target.value; applyFilter();
  });
  const hlBtn = document.getElementById('highlightToggle');
  hlBtn.addEventListener('click', () => {
    highlightOn = !highlightOn;
    hlBtn.classList.toggle('active', highlightOn);
    hlBtn.setAttribute('aria-pressed', String(highlightOn));
    applyFilter();
  });
  const hideBtn = document.getElementById('hideToggle');
  hideBtn.addEventListener('click', () => {
    hideOn = !hideOn;
    hideBtn.classList.toggle('active', hideOn);
    hideBtn.setAttribute('aria-pressed', String(hideOn));
    applyFilter();
  });
</script>
</body>
</html>`;
}

interface Pos { x: number; y: number; h: number }

function layoutTables(tables: IDiagramTable[]): Pos[] {
  const positions: Pos[] = [];
  let col = 0;
  let row = 0;
  const rowHeights: number[] = [];

  for (const t of tables) {
    const h = 30 + t.columns.length * 24 + 8;
    const x = col * (BOX_W + BOX_GAP) + BOX_GAP;
    const rowY = rowHeights.slice(0, row).reduce((a, b) => a + b, 0);
    const y = rowY + row * BOX_GAP + BOX_GAP;
    positions.push({ x, y, h });

    if (!rowHeights[row] || h > rowHeights[row]) {
      rowHeights[row] = h;
    }
    col++;
    if (col >= COLS) {
      col = 0;
      row++;
    }
  }
  return positions;
}

function buildTableBox(t: IDiagramTable, pos: Pos): string {
  const cols = t.columns.map((c) => {
    const pkCls = c.pk ? ' pk' : '';
    // data-name/data-type drive the client-side field filter.
    return `<div class="col-row" data-name="${esc(c.name)}" data-type="${esc(c.type)}">
      <span class="col-name${pkCls}">${esc(c.name)}${c.pk ? ' \u{1F511}' : ''}</span>
      <span class="col-type">${esc(c.type)}</span>
    </div>`;
  }).join('');

  return `<div class="tbl" data-table="${esc(t.name)}" style="left:${pos.x}px;top:${pos.y}px">
    <div class="tbl-header" data-table="${esc(t.name)}">${esc(t.name)}</div>
    <div class="tbl-cols">${cols}</div>
  </div>`;
}

function buildFkLine(from: Pos, to: Pos, fromTable: string, toTable: string): string {
  const x1 = from.x + BOX_W;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  // data-from/data-to let the filter hide a line when either endpoint is hidden.
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" data-from="${esc(fromTable)}" data-to="${esc(toTable)}"/>`;
}

const esc = escapeHtml;
