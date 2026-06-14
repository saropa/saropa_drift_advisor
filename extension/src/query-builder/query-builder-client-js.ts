/**
 * Webview-side client script for the Visual Query Builder. Renders selectors,
 * table cards, join/filter/group-by/order-by lists and results, and posts
 * commands back to the panel. Runs in the webview, not the extension host —
 * keep it framework-free vanilla JS. Split out of query-builder-html.ts.
 */
export function getQueryBuilderClientJs(): string {
  return `
(() => {
  const vscode = acquireVsCodeApi();
  const state = {
    tablesMeta: [],
    tableInstances: [],
    joins: [],
    filters: [],
    model: null,
    capabilities: { notebook: true, snippet: true, dashboard: true, cost: true },
    selectedColumns: new Set(),
    lastRunRequestId: null,
  };
  const byId = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const parseInstance = (value) => value ? value.split('|') : ['', ''];

  function post(command, payload) {
    vscode.postMessage(Object.assign({ command }, payload || {}));
  }
  function uuid() {
    return 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function renderSelectors() {
    const tableOpts = state.tablesMeta.map((t) => '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>').join('');
    byId('addTableSelect').innerHTML = tableOpts;

    const instOpts = state.tableInstances.map((t) => {
      const label = t.alias + ' (' + t.baseTable + ')';
      return '<option value="' + esc(t.id + '|' + t.baseTable) + '">' + esc(label) + '</option>';
    }).join('');
    ['joinLeftTable','joinRightTable','filterTable','gbTable','obTable'].forEach((id) => byId(id).innerHTML = instOpts);
    updateColumnSelects();
  }

  function columnsForSelect(tableSelectId, colSelectId) {
    const [tableId] = parseInstance(byId(tableSelectId).value);
    const inst = state.tableInstances.find((t) => t.id === tableId);
    const cols = (inst?.columns || []).map((c) => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('');
    byId(colSelectId).innerHTML = cols;
  }
  function updateColumnSelects() {
    columnsForSelect('joinLeftTable', 'joinLeftColumn');
    columnsForSelect('joinRightTable', 'joinRightColumn');
    columnsForSelect('filterTable', 'filterColumn');
  }

  function renderGbList() {
    const m = state.model;
    const list = (m && m.groupBy) ? m.groupBy : [];
    const rows = list.map((g, i) => {
      const inst = state.tableInstances.find((t) => t.id === g.tableId);
      const label = (inst ? inst.alias + '.' : '') + g.column;
      return '<div>' + esc(label) + ' <button class="secondary" data-rm-gb="' + i + '">Remove</button></div>';
    });
    byId('gbList').innerHTML = rows.length ? rows.join('') : 'No GROUP BY columns.';
  }

  function renderObList() {
    const m = state.model;
    const list = (m && m.orderBy) ? m.orderBy : [];
    const rows = list.map((o, i) => {
      const inst = state.tableInstances.find((t) => t.id === o.tableId);
      const label = (inst ? inst.alias + '.' : '') + o.column + ' ' + o.direction;
      return '<div>' + esc(label) + ' <button class="secondary" data-rm-ob="' + i + '">Remove</button></div>';
    });
    byId('obList').innerHTML = rows.length ? rows.join('') : 'No ORDER BY clauses.';
  }

  function renderTableCards() {
    const m = state.model;
    const hasGroupBy = m && m.groupBy && m.groupBy.length > 0;
    const cards = state.tableInstances.map((t) => {
      const cols = (t.columns || []).map((c) => {
        const key = t.id + '.' + c.name;
        const checked = state.selectedColumns.has(key) ? 'checked' : '';
        const selMeta = hasGroupBy && checked && m
          ? (m.selectedColumns || []).find((sc) => sc.tableId === t.id && sc.column === c.name)
          : null;
        const cur = (selMeta && selMeta.aggregation) ? selMeta.aggregation : '';
        let aggHtml = '';
        if (hasGroupBy && checked) {
          const opts = ['', 'SUM', 'COUNT', 'AVG', 'MIN', 'MAX'].map((fn) => {
            const label = fn === '' ? '(in GROUP BY)' : fn;
            return '<option value="' + esc(fn) + '"' + (cur === fn ? ' selected' : '') + '>' + esc(label) + '</option>';
          }).join('');
          aggHtml = ' <select class="agg-sel" data-col="' + esc(key) + '">' + opts + '</select>';
        }
        return '<label class="col"><input type="checkbox" data-col="' + esc(key) + '" ' + checked + ' />' + esc(c.name) + aggHtml + '</label>';
      }).join('');
      return '<div class="table-card"><div class="table-title"><span>' + esc(t.alias + ' (' + t.baseTable + ')') + '</span><button class="secondary" data-remove="' + esc(t.id) + '">Remove</button></div><div class="cols">' + cols + '</div></div>';
    }).join('');
    byId('tableCards').innerHTML = cards || '<div class="muted">No table instances yet.</div>';
  }

  function renderJoinList() {
    byId('joinList').innerHTML = state.joins.map((j) => (
      '<div class="muted">' + esc(j.type + ': ' + j.leftAlias + '.' + j.leftColumn + ' = ' + j.rightAlias + '.' + j.rightColumn) +
      ' <button class="secondary" data-remove-join="' + esc(j.id) + '">Remove</button></div>'
    )).join('');
  }

  function renderFilterList() {
    byId('filterList').innerHTML = state.filters.map((f) => (
      '<div class="muted">' + esc(f.description) +
      ' <button class="secondary" data-remove-filter="' + esc(f.id) + '">Remove</button></div>'
    )).join('');
  }

  function renderResults(columns, rows) {
    if (!columns || columns.length === 0) {
      byId('results').innerHTML = '<div class="muted" style="padding:8px;">No results</div>';
      return;
    }
    const head = '<tr>' + columns.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr>';
    const body = rows.map((r) => '<tr>' + r.map((v) => '<td>' + esc(v === null ? 'NULL' : v) + '</td>').join('') + '</tr>').join('');
    byId('results').innerHTML = '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  byId('btnAddTable').addEventListener('click', () => post('addTableInstance', { baseTable: byId('addTableSelect').value }));
  byId('joinLeftTable').addEventListener('change', updateColumnSelects);
  byId('joinRightTable').addEventListener('change', updateColumnSelects);
  byId('filterTable').addEventListener('change', updateColumnSelects);
  byId('gbTable').addEventListener('change', () => columnsForSelect('gbTable', 'gbColumn'));
  byId('obTable').addEventListener('change', () => columnsForSelect('obTable', 'obColumn'));
  byId('btnAddGb').addEventListener('click', () => {
    const [tableId] = parseInstance(byId('gbTable').value);
    post('addGroupBy', { tableId, column: byId('gbColumn').value });
  });
  byId('btnAddOb').addEventListener('click', () => {
    const [tableId] = parseInstance(byId('obTable').value);
    post('addOrderBy', {
      tableId,
      column: byId('obColumn').value,
      direction: byId('obDir').value,
    });
  });
  byId('gbList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-rm-gb]');
    if (btn) post('removeGroupBy', { index: Number(btn.getAttribute('data-rm-gb')) });
  });
  byId('obList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-rm-ob]');
    if (btn) post('removeOrderBy', { index: Number(btn.getAttribute('data-rm-ob')) });
  });
  byId('filterOperator').addEventListener('change', () => {
    const op = byId('filterOperator').value;
    byId('filterValue').disabled = op === 'IS NULL' || op === 'IS NOT NULL';
  });
  byId('btnAddJoin').addEventListener('click', () => {
    const [leftTableId] = parseInstance(byId('joinLeftTable').value);
    const [rightTableId] = parseInstance(byId('joinRightTable').value);
    post('addJoin', {
      join: {
        leftTableId,
        leftColumn: byId('joinLeftColumn').value,
        rightTableId,
        rightColumn: byId('joinRightColumn').value,
        type: byId('joinType').value,
      },
    });
  });
  byId('btnAddFilter').addEventListener('click', () => {
    const [tableId] = parseInstance(byId('filterTable').value);
    post('addFilter', {
      filter: {
        tableId,
        column: byId('filterColumn').value,
        operator: byId('filterOperator').value,
        valueText: byId('filterValue').value,
      },
    });
  });
  byId('limitInput').addEventListener('change', () => post('setLimit', { limit: Number(byId('limitInput').value) || null }));
  byId('btnRun').addEventListener('click', () => {
    const requestId = uuid();
    state.lastRunRequestId = requestId;
    post('runQuery', { requestId });
  });
  byId('btnCopy').addEventListener('click', () => post('copySql'));
  byId('btnNotebook').addEventListener('click', () => post('openInNotebook'));
  byId('btnSaveSnippet').addEventListener('click', () => post('saveAsSnippet'));
  byId('btnCost').addEventListener('click', () => post('analyzeCost'));
  byId('btnDashboard').addEventListener('click', () => post('addToDashboard'));

  byId('tableCards').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-remove]');
    if (btn) post('removeTable', { tableId: btn.getAttribute('data-remove') });
  });
  byId('tableCards').addEventListener('change', (e) => {
    const agg = e.target.closest('select.agg-sel');
    if (agg) {
      const key = agg.getAttribute('data-col');
      const dot = key.indexOf('.');
      const tableId = key.slice(0, dot);
      const column = key.slice(dot + 1);
      post('setAggregation', { tableId, column, aggregation: agg.value || null });
      return;
    }
    const cb = e.target.closest('input[data-col]');
    if (!cb) return;
    const [tableId, column] = cb.getAttribute('data-col').split('.');
    post('toggleColumn', { tableId, column, selected: cb.checked });
  });
  byId('joinList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-remove-join]');
    if (btn) post('removeJoin', { joinId: btn.getAttribute('data-remove-join') });
  });
  byId('filterList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-remove-filter]');
    if (btn) post('removeFilter', { id: btn.getAttribute('data-remove-filter') });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'init') {
      state.tablesMeta = msg.tables || [];
      state.tableInstances = msg.instances || [];
      state.joins = [];
      state.filters = [];
      state.capabilities = msg.capabilities || state.capabilities;
      byId('btnNotebook').disabled = !state.capabilities.notebook;
      byId('btnSaveSnippet').disabled = !state.capabilities.snippet;
      byId('btnDashboard').disabled = !state.capabilities.dashboard;
      byId('btnCost').disabled = !state.capabilities.cost;
      state.model = null;
      renderSelectors();
      renderTableCards();
      renderJoinList();
      renderFilterList();
      renderGbList();
      renderObList();
      return;
    }
    if (msg.command === 'state') {
      state.model = msg.model || null;
      state.tableInstances = msg.model.tables || [];
      state.selectedColumns = new Set((msg.model.selectedColumns || []).map((c) => c.tableId + '.' + c.column));
      state.joins = msg.joinLabels || [];
      state.filters = msg.filterLabels || [];
      byId('sqlPreview').textContent = msg.sql || '';
      byId('validation').textContent = (msg.validationErrors || []).join('\\n');
      byId('queryError').textContent = '';
      renderSelectors();
      renderTableCards();
      renderJoinList();
      renderFilterList();
      renderGbList();
      renderObList();
      return;
    }
    if (msg.command === 'queryResult') {
      if (msg.requestId !== state.lastRunRequestId) return;
      renderResults(msg.columns, msg.rows);
      byId('queryError').textContent = '';
      return;
    }
    if (msg.command === 'queryError') {
      if (msg.requestId !== state.lastRunRequestId) return;
      byId('queryError').textContent = msg.message;
      return;
    }
    if (msg.command === 'integrationError') {
      byId('queryError').textContent = msg.message;
    }
  });
})();
`;
}
