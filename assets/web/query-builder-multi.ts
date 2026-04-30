/**
 * Multi-table visual query builder for the debug web viewer.
 *
 * Builds an in-memory model aligned with [renderQuerySql] / [validateQueryModel]
 * in query-builder-sql.ts so preview and POST /api/sql match the extension VQB.
 */
import * as S from './state.ts';
import { esc } from './utils.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import { loadFkMeta } from './fk-nav.ts';
import { renderQuerySql, validateQueryModel, getWhereOpsForType } from './query-builder-sql.ts';

/** One table instance in a multi-table model (alias disambiguates self-joins). */
export interface WebQbTable {
  id: string;
  baseTable: string;
  alias: string;
  columns: Array<{ name: string; type?: string; pk?: boolean }>;
}

export interface WebQbJoin {
  id: string;
  leftTableId: string;
  leftColumn: string;
  rightTableId: string;
  rightColumn: string;
  type: 'INNER' | 'LEFT' | 'RIGHT';
}

export interface WebQbModel {
  modelVersion: 1;
  tables: WebQbTable[];
  joins: WebQbJoin[];
  selectedColumns: Array<{ tableId: string; column: string; aggregation?: string; alias?: string }>;
  filters: Array<{
    id: string;
    tableId: string;
    column: string;
    operator: string;
    value?: string | number | boolean;
    values?: Array<string | number | boolean>;
    conjunction?: string;
  }>;
  groupBy: Array<{ tableId: string; column: string }>;
  orderBy: Array<{ tableId: string; column: string; direction: 'ASC' | 'DESC' }>;
  limit: number | null;
}

let _scope: 'single' | 'multi' = 'single';
let _multiModel: WebQbModel | null = null;
let _multiRootTable: string | null = null;
let _onChange: () => void = () => {};

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function schemaTableByName(name: string): { name: string; columns?: Array<{ name: string; type?: string; pk?: boolean }> } | null {
  const meta = S.schemaMeta;
  if (!meta || !meta.tables || !name) return null;
  const tables = meta.tables as Array<{ name: string; columns?: Array<{ name: string; type?: string; pk?: boolean }> }>;
  for (let i = 0; i < tables.length; i++) {
    if (tables[i]!.name === name) return tables[i]!;
  }
  return null;
}

function tableColumnsFromSchema(baseTable: string): Array<{ name: string; type?: string; pk?: boolean }> {
  const t = schemaTableByName(baseTable);
  if (!t || !t.columns) return [];
  return t.columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk }));
}

function buildFreshModel(rootTable: string, colTypes: Record<string, string>): WebQbModel {
  const tid = makeId('tb');
  const keys = Object.keys(colTypes || {});
  const columns = keys.map((name) => ({ name, type: colTypes[name] || '', pk: false }));
  return {
    modelVersion: 1,
    tables: [{ id: tid, baseTable: rootTable, alias: 't0', columns }],
    joins: [],
    selectedColumns: keys.map((name) => ({ tableId: tid, column: name })),
    filters: [],
    groupBy: [],
    orderBy: [],
    limit: 200,
  };
}

/** Notifies the host (query-builder preview) after model or scope UI changes. */
export function setMultiChangeHandler(fn: () => void): void {
  _onChange = fn;
}

function notify(): void {
  _onChange();
}

export function getQbScope(): 'single' | 'multi' {
  return _scope;
}

export function getMultiModel(): WebQbModel | null {
  return _multiModel;
}

/**
 * Resets multi-model when the active table tab changes so aliases and root stay consistent.
 */
export function initMultiForTable(rootTable: string, colTypes: Record<string, string>): void {
  if (_multiRootTable !== rootTable || !_multiModel) {
    _multiRootTable = rootTable;
    _multiModel = buildFreshModel(rootTable, colTypes);
  }
}

/** Force rebuild multi-model from the current root (e.g. after full restore). */
export function resetMultiModel(rootTable: string, colTypes: Record<string, string>): void {
  _multiRootTable = rootTable;
  _multiModel = buildFreshModel(rootTable, colTypes);
}

export function setQbScope(next: 'single' | 'multi'): void {
  _scope = next;
  const simple = document.getElementById('qb-simple-visual');
  const multi = document.getElementById('qb-multi-panel');
  const btnS = document.getElementById('qb-scope-single');
  const btnM = document.getElementById('qb-scope-multi');
  if (simple) simple.style.display = next === 'single' ? '' : 'none';
  if (multi) multi.style.display = next === 'multi' ? '' : 'none';
  if (btnS) btnS.classList.toggle('active', next === 'single');
  if (btnM) btnM.classList.toggle('active', next === 'multi');
  if (next === 'multi') renderMultiRoot();
  notify();
}

/** SQL text for preview, or validation errors (does not throw). */
export function getMultiPreviewText(): string {
  if (!_multiModel) return '';
  const errs = validateQueryModel(_multiModel);
  if (errs.length > 0) return '-- ' + errs.join('; ');
  try {
    return renderQuerySql(_multiModel);
  } catch (e: unknown) {
    return '-- ' + (e instanceof Error ? e.message : String(e));
  }
}

/** Returns executable SQL or null if invalid. */
export function tryGetMultiSql(): string | null {
  if (!_multiModel) return null;
  const errs = validateQueryModel(_multiModel);
  if (errs.length > 0) return null;
  try {
    return renderQuerySql(_multiModel).trim();
  } catch {
    return null;
  }
}

function tableById(id: string): WebQbTable | undefined {
  return _multiModel?.tables.find((t) => t.id === id);
}

function nextAlias(): string {
  const n = _multiModel?.tables.length ?? 0;
  return `t${n}`;
}

function syncSelectedColumnsAfterTableRemoved(removedId: string): void {
  if (!_multiModel) return;
  _multiModel.selectedColumns = _multiModel.selectedColumns.filter((s) => s.tableId !== removedId);
  _multiModel.groupBy = _multiModel.groupBy.filter((g) => g.tableId !== removedId);
  _multiModel.orderBy = _multiModel.orderBy.filter((o) => o.tableId !== removedId);
  _multiModel.filters = _multiModel.filters.filter((f) => f.tableId !== removedId);
}

/** Renders the multi-table form into [#qb-multi-root]. */
export function renderMultiRoot(): void {
  const host = document.getElementById('qb-multi-root');
  if (!host || !_multiModel) return;
  const m = _multiModel;
  const instOpts = m.tables
    .map((t) => `<option value="${esc(t.id)}">${esc(t.alias)} (${esc(t.baseTable)})</option>`)
    .join('');
  const schemaTables: string[] = (S.schemaMeta?.tables || []).map((x: { name: string }) => x.name).sort();
  const schemaOpts = schemaTables.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

  const tablesHtml = m.tables
    .map((t) => {
      const isRoot = m.tables[0]?.id === t.id;
      const rm = isRoot
        ? ''
        : ` <button type="button" class="qb-m-remove-table" data-table-id="${esc(t.id)}" title="Remove this table instance">Remove</button>`;
      return `<li><strong>${esc(t.alias)}</strong> — ${esc(t.baseTable)}${rm}</li>`;
    })
    .join('');

  const joinsHtml =
    m.joins.length === 0
      ? '<p class="meta">No JOINs yet. Add one before selecting columns from a second table.</p>'
      : m.joins
          .map((j) => {
            const lt = tableById(j.leftTableId);
            const rt = tableById(j.rightTableId);
            const label = `${lt?.alias ?? '?'}.${j.leftColumn} ${j.type} JOIN ${rt?.alias ?? '?'}.${j.rightColumn}`;
            return `<div class="qb-m-join-row">${esc(label)} <button type="button" class="qb-m-remove-join" data-join-id="${esc(j.id)}">\u00D7</button></div>`;
          })
          .join('');

  const selColsHtml = m.selectedColumns
    .map((sc, idx) => {
      const t = tableById(sc.tableId);
      const instOptsRow = m.tables
        .map((tb) => `<option value="${esc(tb.id)}"${tb.id === sc.tableId ? ' selected' : ''}>${esc(tb.alias)} (${esc(tb.baseTable)})</option>`)
        .join('');
      const colOpts = (t?.columns || [])
        .map((c) => `<option value="${esc(c.name)}"${c.name === sc.column ? ' selected' : ''}>${esc(c.name)}</option>`)
        .join('');
      const aggOpts = ['', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX']
        .map((a) => `<option value="${esc(a)}"${(sc.aggregation || '') === a ? ' selected' : ''}>${a ? esc(a) : '(none)'}</option>`)
        .join('');
      const showAgg = m.groupBy.length > 0;
      const aggHtml = showAgg
        ? `<select class="qb-m-sel-agg" data-sel-idx="${idx}" title="Aggregate (required when GROUP BY is non-empty)">${aggOpts}</select>`
        : '';
      return `<div class="qb-row qb-m-sel-row">
        <select class="qb-m-sel-table" data-sel-idx="${idx}">${instOptsRow}</select>
        <select class="qb-m-sel-col" data-sel-idx="${idx}">${colOpts}</select>
        ${aggHtml}
        <button type="button" class="qb-m-remove-sel" data-sel-idx="${idx}" title="Remove column">\u00D7</button>
      </div>`;
    })
    .join('');

  const filtersHtml = m.filters
    .map((f, fi) => {
      const t = tableById(f.tableId);
      const type = (t?.columns.find((c) => c.name === f.column)?.type || '') as string;
      const ops = getWhereOpsForType(type);
      const opOpts = ops.map((o) => `<option value="${esc(o.val)}"${f.operator === o.val ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
      const conn =
        fi === 0
          ? ''
          : `<select class="qb-m-flt-conn" data-flt-id="${esc(f.id)}"><option value="AND"${(f.conjunction || 'AND') === 'AND' ? ' selected' : ''}>AND</option><option value="OR"${f.conjunction === 'OR' ? ' selected' : ''}>OR</option></select>`;
      const valDisplay = f.operator === 'IN' ? (f.values || []).join(', ') : (f.value != null ? String(f.value) : '');
      const valHidden = f.operator === 'IS NULL' || f.operator === 'IS NOT NULL' ? ' style="display:none"' : '';
      return `<div class="qb-m-filter-row">${conn}
        <select class="qb-m-flt-table" data-flt-id="${esc(f.id)}">${m.tables.map((tb) => `<option value="${esc(tb.id)}"${tb.id === f.tableId ? ' selected' : ''}>${esc(tb.alias)}</option>`).join('')}</select>
        <select class="qb-m-flt-col" data-flt-id="${esc(f.id)}">${(t?.columns || []).map((c) => `<option value="${esc(c.name)}"${c.name === f.column ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select class="qb-m-flt-op" data-flt-id="${esc(f.id)}">${opOpts}</select>
        <input type="text" class="qb-m-flt-val" data-flt-id="${esc(f.id)}" value="${esc(valDisplay)}" placeholder="value or comma-separated (IN)"${valHidden}/>
        <button type="button" class="qb-m-remove-flt" data-flt-id="${esc(f.id)}">\u00D7</button>
      </div>`;
    })
    .join('');

  const gbHtml = m.groupBy
    .map((g, gi) => {
      const t = tableById(g.tableId);
      const colOpts = (t?.columns || [])
        .map((c) => `<option value="${esc(c.name)}"${c.name === g.column ? ' selected' : ''}>${esc(c.name)}</option>`)
        .join('');
      return `<div class="qb-row"><select class="qb-m-gb-table" data-gb-idx="${gi}">${m.tables.map((tb) => `<option value="${esc(tb.id)}"${tb.id === g.tableId ? ' selected' : ''}>${esc(tb.alias)}</option>`).join('')}</select><select class="qb-m-gb-col" data-gb-idx="${gi}">${colOpts}</select><button type="button" class="qb-m-remove-gb" data-gb-idx="${gi}">\u00D7</button></div>`;
    })
    .join('');

  const obHtml = m.orderBy
    .map((o, oi) => {
      const t = tableById(o.tableId);
      const colOpts = (t?.columns || [])
        .map((c) => `<option value="${esc(c.name)}"${c.name === o.column ? ' selected' : ''}>${esc(c.name)}</option>`)
        .join('');
      return `<div class="qb-row"><select class="qb-m-ob-table" data-ob-idx="${oi}">${m.tables.map((tb) => `<option value="${esc(tb.id)}"${tb.id === o.tableId ? ' selected' : ''}>${esc(tb.alias)}</option>`).join('')}</select><select class="qb-m-ob-col" data-ob-idx="${oi}">${colOpts}</select><select class="qb-m-ob-dir" data-ob-idx="${oi}"><option value="ASC"${o.direction === 'ASC' ? ' selected' : ''}>ASC</option><option value="DESC"${o.direction === 'DESC' ? ' selected' : ''}>DESC</option></select><button type="button" class="qb-m-remove-ob" data-ob-idx="${oi}">\u00D7</button></div>`;
    })
    .join('');

  host.innerHTML = `
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC Tables</div>
  <div class="qb-body">
    <ul class="qb-m-table-list">${tablesHtml}</ul>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC JOINs</div>
  <div class="qb-body">
    ${joinsHtml}
    <div class="qb-row" style="margin-top:0.5rem;flex-wrap:wrap;align-items:flex-end;">
      <label>Left</label>
      <select id="qb-m-join-left-t">${instOpts}</select>
      <select id="qb-m-join-left-c"></select>
      <select id="qb-m-join-type"><option value="INNER">INNER</option><option value="LEFT">LEFT</option><option value="RIGHT">RIGHT</option></select>
      <label>Right table</label>
      <select id="qb-m-join-right-base">${schemaOpts ? `<option value="">— pick —</option>${schemaOpts}` : '<option value="">(load schema)</option>'}</select>
      <select id="qb-m-join-right-c"></select>
      <button type="button" id="qb-m-join-add">Add JOIN</button>
    </div>
    <p class="meta" style="margin-top:0.35rem;">Connects the <em>right</em> base table as a new instance (<code>tN</code>) or joins two existing instances when the right table already exists and you pick matching columns.</p>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC SELECT columns</div>
  <div class="qb-body">
    ${selColsHtml || '<p class="meta">No columns selected.</p>'}
    <button type="button" id="qb-m-add-sel">+ Add column</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC WHERE</div>
  <div class="qb-body">
    ${filtersHtml || '<p class="meta">No filters.</p>'}
    <button type="button" id="qb-m-add-flt">+ Add condition</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC GROUP BY</div>
  <div class="qb-body">
    ${gbHtml || '<p class="meta">None</p>'}
    <button type="button" id="qb-m-add-gb">+ Add GROUP BY</button>
  </div>
</div>
<div class="qb-multi-section qb-section">
  <div class="qb-header">\u25BC ORDER BY</div>
  <div class="qb-body">
    ${obHtml || '<p class="meta">None</p>'}
    <button type="button" id="qb-m-add-ob">+ Add ORDER BY</button>
  </div>
</div>
<div class="qb-row" style="margin-top:0.5rem;"><label>LIMIT</label><input type="number" id="qb-m-limit" min="1" max="1000" value="${m.limit ?? 200}"/></div>
`;

  fillJoinColumnSelects();
  wireMultiRoot(host);
}

function fillJoinColumnSelects(): void {
  if (!_multiModel) return;
  const leftT = document.getElementById('qb-m-join-left-t') as HTMLSelectElement | null;
  const leftC = document.getElementById('qb-m-join-left-c') as HTMLSelectElement | null;
  const rightB = document.getElementById('qb-m-join-right-base') as HTMLSelectElement | null;
  const rightC = document.getElementById('qb-m-join-right-c') as HTMLSelectElement | null;
  if (!leftT || !leftC) return;
  const tid = leftT.value;
  const t = tableById(tid);
  const prevL = leftC.value;
  leftC.innerHTML = (t?.columns || []).map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  if (prevL && (t?.columns || []).some((c) => c.name === prevL)) leftC.value = prevL;
  if (rightB && rightC) {
    const base = rightB.value;
    if (base) {
      const cols = tableColumnsFromSchema(base);
      const prevR = rightC.value;
      rightC.innerHTML = cols.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
      if (prevR && cols.some((c) => c.name === prevR)) rightC.value = prevR;
    } else {
      rightC.innerHTML = '';
    }
  }
}

async function suggestFkForJoin(): Promise<void> {
  const leftT = document.getElementById('qb-m-join-left-t') as HTMLSelectElement | null;
  const leftC = document.getElementById('qb-m-join-left-c') as HTMLSelectElement | null;
  const rightB = document.getElementById('qb-m-join-right-base') as HTMLSelectElement | null;
  const rightC = document.getElementById('qb-m-join-right-c') as HTMLSelectElement | null;
  if (!leftT || !leftC || !rightB || !rightC || !_multiModel) return;
  const tbl = tableById(leftT.value);
  if (!tbl) return;
  const fks = await loadFkMeta(tbl.baseTable);
  const fk = (fks || []).find((x: { fromColumn: string }) => x.fromColumn === leftC.value);
  if (fk && fk.toTable) {
    rightB.value = fk.toTable;
    fillJoinColumnSelects();
    if (fk.toColumn) rightC.value = fk.toColumn;
  }
}

function wireMultiRoot(host: HTMLElement): void {
  const leftT = document.getElementById('qb-m-join-left-t');
  const leftC = document.getElementById('qb-m-join-left-c');
  const rightB = document.getElementById('qb-m-join-right-base');
  if (leftT) leftT.addEventListener('change', () => { fillJoinColumnSelects(); void suggestFkForJoin(); });
  if (leftC) leftC.addEventListener('change', () => { void suggestFkForJoin(); });
  if (rightB) rightB.addEventListener('change', () => fillJoinColumnSelects());

  host.querySelector('#qb-m-join-add')?.addEventListener('click', () => {
    if (!_multiModel) return;
    const ltid = (document.getElementById('qb-m-join-left-t') as HTMLSelectElement).value;
    const lc = (document.getElementById('qb-m-join-left-c') as HTMLSelectElement).value;
    const jt = (document.getElementById('qb-m-join-type') as HTMLSelectElement).value as WebQbJoin['type'];
    const rb = (document.getElementById('qb-m-join-right-base') as HTMLSelectElement).value;
    const rc = (document.getElementById('qb-m-join-right-c') as HTMLSelectElement).value;
    if (!ltid || !lc || !rb || !rc) {
      alert('Pick left column, right table, and right column for the JOIN.');
      return;
    }
    const leftInst = tableById(ltid);
    if (!leftInst) return;
    // Prefer another instance of the same base table (excludes self-join to same row id).
    let rightInst = _multiModel.tables.find((t) => t.baseTable === rb && t.id !== ltid);
    if (!rightInst) {
      const alias = nextAlias();
      const cols = tableColumnsFromSchema(rb);
      rightInst = { id: makeId('tb'), baseTable: rb, alias, columns: cols };
      _multiModel.tables.push(rightInst);
      for (const c of cols) {
        _multiModel.selectedColumns.push({ tableId: rightInst.id, column: c.name });
      }
    }
    _multiModel.joins.push({
      id: makeId('jn'),
      leftTableId: ltid,
      leftColumn: lc,
      rightTableId: rightInst.id,
      rightColumn: rc,
      type: jt === 'LEFT' || jt === 'RIGHT' || jt === 'INNER' ? jt : 'INNER',
    });
    renderMultiRoot();
    notify();
  });

  host.querySelectorAll('.qb-m-remove-join').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).getAttribute('data-join-id');
      if (!_multiModel || !id) return;
      _multiModel.joins = _multiModel.joins.filter((j) => j.id !== id);
      renderMultiRoot();
      notify();
    });
  });

  host.querySelectorAll('.qb-m-remove-table').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).getAttribute('data-table-id');
      if (!_multiModel || !id || _multiModel.tables[0]?.id === id) return;
      _multiModel.joins = _multiModel.joins.filter((j) => j.leftTableId !== id && j.rightTableId !== id);
      _multiModel.tables = _multiModel.tables.filter((t) => t.id !== id);
      syncSelectedColumnsAfterTableRemoved(id);
      renderMultiRoot();
      notify();
    });
  });

  host.querySelector('#qb-m-add-sel')?.addEventListener('click', () => {
    if (!_multiModel || !_multiModel.tables[0]) return;
    const t0 = _multiModel.tables[0];
    const c0 = t0.columns[0]?.name;
    if (!c0) return;
    _multiModel.selectedColumns.push({ tableId: t0.id, column: c0 });
    renderMultiRoot();
    notify();
  });

  host.querySelectorAll('.qb-m-sel-table').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.selIdx);
      const tid = (el as HTMLSelectElement).value;
      if (!_multiModel || Number.isNaN(idx)) return;
      const t = tableById(tid);
      const col = t?.columns[0]?.name;
      if (!col) return;
      _multiModel.selectedColumns[idx] = { tableId: tid, column: col, aggregation: _multiModel.selectedColumns[idx]?.aggregation };
      renderMultiRoot();
      notify();
    });
  });
  host.querySelectorAll('.qb-m-sel-col').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.selIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.selectedColumns[idx]!.column = (el as HTMLSelectElement).value;
      renderMultiRoot();
      notify();
    });
  });
  host.querySelectorAll('.qb-m-sel-agg').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.selIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      const v = (el as HTMLSelectElement).value;
      const cur = _multiModel.selectedColumns[idx]!;
      _multiModel.selectedColumns[idx] = { ...cur, aggregation: v || undefined };
      notify();
      renderMultiRoot();
    });
  });
  host.querySelectorAll('.qb-m-remove-sel').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number((el as HTMLElement).dataset.selIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.selectedColumns.splice(idx, 1);
      renderMultiRoot();
      notify();
    });
  });

  host.querySelector('#qb-m-add-flt')?.addEventListener('click', () => {
    if (!_multiModel || !_multiModel.tables[0]) return;
    const t0 = _multiModel.tables[0];
    const c0 = t0.columns[0]?.name;
    if (!c0) return;
    _multiModel.filters.push({
      id: makeId('flt'),
      tableId: t0.id,
      column: c0,
      operator: '=',
      value: '',
      conjunction: 'AND',
    });
    renderMultiRoot();
    notify();
  });

  host.querySelectorAll('.qb-m-flt-table').forEach((el) => {
    el.addEventListener('change', () => {
      const id = (el as HTMLElement).dataset.fltId;
      const f = _multiModel?.filters.find((x) => x.id === id);
      if (!f) return;
      f.tableId = (el as HTMLSelectElement).value;
      const t = tableById(f.tableId);
      f.column = t?.columns[0]?.name || f.column;
      renderMultiRoot();
      notify();
    });
  });
  host.querySelectorAll('.qb-m-flt-col').forEach((el) => {
    el.addEventListener('change', () => {
      const id = (el as HTMLElement).dataset.fltId;
      const f = _multiModel?.filters.find((x) => x.id === id);
      if (!f) return;
      f.column = (el as HTMLSelectElement).value;
      renderMultiRoot();
      notify();
    });
  });
  host.querySelectorAll('.qb-m-flt-op').forEach((el) => {
    el.addEventListener('change', () => {
      const id = (el as HTMLElement).dataset.fltId;
      const f = _multiModel?.filters.find((x) => x.id === id);
      if (!f) return;
      f.operator = (el as HTMLSelectElement).value;
      if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
        delete f.value;
        delete f.values;
      } else if (f.operator === 'IN') {
        delete f.value;
        f.values = [];
      } else {
        delete f.values;
        if (f.value === undefined) f.value = '';
      }
      renderMultiRoot();
      notify();
    });
  });
  host.querySelectorAll('.qb-m-flt-val').forEach((el) => {
    el.addEventListener('input', () => {
      const id = (el as HTMLElement).dataset.fltId;
      const f = _multiModel?.filters.find((x) => x.id === id);
      if (!f) return;
      const raw = (el as HTMLInputElement).value;
      if (f.operator === 'IN') {
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
        f.values = parts.map((p) => {
          const n = Number(p);
          return !Number.isNaN(n) && p !== '' && String(n) === p ? n : p;
        });
      } else {
        const n = Number(raw);
        f.value = !Number.isNaN(n) && raw.trim() !== '' && String(n) === raw.trim() ? n : raw;
      }
      notify();
    });
  });
  host.querySelectorAll('.qb-m-flt-conn').forEach((el) => {
    el.addEventListener('change', () => {
      const id = (el as HTMLElement).dataset.fltId;
      const f = _multiModel?.filters.find((x) => x.id === id);
      if (!f) return;
      f.conjunction = (el as HTMLSelectElement).value as 'AND' | 'OR';
      notify();
    });
  });
  host.querySelectorAll('.qb-m-remove-flt').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.fltId;
      if (!_multiModel || !id) return;
      _multiModel.filters = _multiModel.filters.filter((x) => x.id !== id);
      renderMultiRoot();
      notify();
    });
  });

  host.querySelector('#qb-m-add-gb')?.addEventListener('click', () => {
    if (!_multiModel || !_multiModel.tables[0]) return;
    const t0 = _multiModel.tables[0];
    const c0 = t0.columns[0]?.name;
    if (!c0) return;
    _multiModel.groupBy.push({ tableId: t0.id, column: c0 });
    renderMultiRoot();
    notify();
  });
  host.querySelectorAll('.qb-m-gb-table').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.gbIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.groupBy[idx]!.tableId = (el as HTMLSelectElement).value;
      const t = tableById(_multiModel.groupBy[idx]!.tableId);
      _multiModel.groupBy[idx]!.column = t?.columns[0]?.name || '';
      renderMultiRoot();
      notify();
    });
  });
  host.querySelectorAll('.qb-m-gb-col').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.gbIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.groupBy[idx]!.column = (el as HTMLSelectElement).value;
      notify();
    });
  });
  host.querySelectorAll('.qb-m-remove-gb').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number((el as HTMLElement).dataset.gbIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.groupBy.splice(idx, 1);
      renderMultiRoot();
      notify();
    });
  });

  host.querySelector('#qb-m-add-ob')?.addEventListener('click', () => {
    if (!_multiModel || !_multiModel.tables[0]) return;
    const t0 = _multiModel.tables[0];
    const c0 = t0.columns[0]?.name;
    if (!c0) return;
    _multiModel.orderBy.push({ tableId: t0.id, column: c0, direction: 'ASC' });
    renderMultiRoot();
    notify();
  });
  host.querySelectorAll('.qb-m-ob-table').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.obIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.orderBy[idx]!.tableId = (el as HTMLSelectElement).value;
      const t = tableById(_multiModel.orderBy[idx]!.tableId);
      _multiModel.orderBy[idx]!.column = t?.columns[0]?.name || '';
      renderMultiRoot();
      notify();
    });
  });
  host.querySelectorAll('.qb-m-ob-col').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.obIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.orderBy[idx]!.column = (el as HTMLSelectElement).value;
      notify();
    });
  });
  host.querySelectorAll('.qb-m-ob-dir').forEach((el) => {
    el.addEventListener('change', () => {
      const idx = Number((el as HTMLElement).dataset.obIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.orderBy[idx]!.direction = (el as HTMLSelectElement).value as 'ASC' | 'DESC';
      notify();
    });
  });
  host.querySelectorAll('.qb-m-remove-ob').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number((el as HTMLElement).dataset.obIdx);
      if (!_multiModel || Number.isNaN(idx)) return;
      _multiModel.orderBy.splice(idx, 1);
      renderMultiRoot();
      notify();
    });
  });

  const lim = document.getElementById('qb-m-limit') as HTMLInputElement | null;
  if (lim) {
    lim.addEventListener('input', () => {
      if (!_multiModel) return;
      const n = parseInt(lim.value, 10);
      _multiModel.limit = Number.isFinite(n) && n > 0 ? n : null;
      notify();
    });
  }
}

export function captureMultiPersistable(): Record<string, unknown> | null {
  if (!_multiModel) return null;
  return {
    modelVersion: 1,
    tables: _multiModel.tables.map((t) => ({ id: t.id, baseTable: t.baseTable, alias: t.alias })),
    joins: _multiModel.joins,
    selectedColumns: _multiModel.selectedColumns,
    filters: _multiModel.filters,
    groupBy: _multiModel.groupBy,
    orderBy: _multiModel.orderBy,
    limit: _multiModel.limit,
  };
}

/**
 * Rehydrates column metadata from [loadSchemaMeta] and restores UI.
 */
/** Rebuilds [_multiModel] from a [captureMultiPersistable] blob; requires schema metadata. */
export async function restoreMultiFromPersistable(blob: Record<string, unknown> | null | undefined): Promise<void> {
  if (!blob || blob.modelVersion !== 1 || !Array.isArray(blob.tables)) return;
  await loadSchemaMeta();
  const tables: WebQbTable[] = (blob.tables as Array<{ id: string; baseTable: string; alias: string }>).map((row) => ({
    id: row.id,
    baseTable: row.baseTable,
    alias: row.alias,
    columns: tableColumnsFromSchema(row.baseTable),
  }));
  _multiModel = {
    modelVersion: 1,
    tables,
    joins: (blob.joins as WebQbModel['joins']) || [],
    selectedColumns: (blob.selectedColumns as WebQbModel['selectedColumns']) || [],
    filters: (blob.filters as WebQbModel['filters']) || [],
    groupBy: (blob.groupBy as WebQbModel['groupBy']) || [],
    orderBy: (blob.orderBy as WebQbModel['orderBy']) || [],
    limit: typeof blob.limit === 'number' ? blob.limit : 200,
  };
  _multiRootTable = tables[0]?.baseTable ?? null;
  renderMultiRoot();
  notify();
}
