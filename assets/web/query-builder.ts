/**
 * Query builder module.
 * Provides the visual SQL query builder UI: column selection, WHERE clauses,
 * ORDER BY, LIMIT, live preview, and state capture/restore.
 * Supports single-table (legacy) and multi-table visual scopes (see query-builder-multi.ts).
 */
import { esc, setButtonBusy } from './utils.ts';
import * as S from './state.ts';
import * as MQ from './query-builder-multi.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import { getColumnConfig, saveTableState } from './persistence.ts';
import { wrapDataTableInScroll, buildDataTableHtml, buildTableStatusBar, getVisibleColumnCount, renderTableView, bindResultsToggle } from './table-view.ts';
import { bindColumnTableEvents } from './pagination.ts';

    /** Column type map for the current query builder instance. */
    export var _qbColTypes = {};

    export function buildQueryBuilderHtml(tableName, colTypes) {
      var cols = Object.keys(colTypes || {});
      if (cols.length === 0) return '';
      _qbColTypes = colTypes;
      var html = '<div class="qb-section">';
      html += '<div class="qb-header" id="qb-toggle">\u25BC Query builder</div>';
      html += '<div id="qb-body" class="qb-body collapsed">';

      // Visual/Raw mode toggle
      html += '<div class="qb-mode-toggle">';
      html += '<button type="button" id="qb-mode-visual" class="qb-mode-btn active" title="Visual query builder">Visual</button>';
      html += '<button type="button" id="qb-mode-raw" class="qb-mode-btn" title="Edit SQL directly">Raw SQL</button>';
      html += '</div>';

      // Single-table vs multi-table scope (multi uses shared SQL renderer in query-builder-sql.ts).
      html += '<div class="qb-mode-toggle qb-scope-toggle" title="Single-table keeps the classic form; multi-table adds JOINs, GROUP BY, and multi ORDER BY">';
      html += '<button type="button" id="qb-scope-single" class="qb-mode-btn active">Single table</button>';
      html += '<button type="button" id="qb-scope-multi" class="qb-mode-btn">Multi-table</button>';
      html += '</div>';

      // Visual mode panel — the existing form controls
      html += '<div id="qb-visual-panel">';
      html += '<div id="qb-simple-visual">';
      html += '<div class="qb-row"><label>SELECT</label><div class="qb-columns" id="qb-columns">';
      cols.forEach(function(c) {
        html += '<label><input type="checkbox" value="' + esc(c) + '" checked> ' + esc(c) + '</label>';
      });
      html += '</div></div>';
      html += '<div class="qb-row"><label>WHERE</label><div style="flex:1;">';
      html += '<div id="qb-where-list"></div>';
      html += '<button type="button" id="qb-add-where" style="font-size:11px;" title="Add another WHERE condition">+ Add condition</button>';
      html += '</div></div>';
      html += '<div class="qb-row"><label>ORDER BY</label>';
      html += '<select id="qb-order-col"><option value="">None</option>';
      cols.forEach(function(c) { html += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
      html += '</select>';
      html += '<select id="qb-order-dir"><option value="ASC">ASC</option><option value="DESC">DESC</option></select>';
      html += '</div>';
      html += '<div class="qb-row"><label>LIMIT</label>';
      html += '<input type="number" id="qb-limit" value="200" min="1" max="1000" style="width:5rem;">';
      html += '</div>';
      html += '</div>'; // end #qb-simple-visual

      html += '<div id="qb-multi-panel" style="display:none;">';
      html += '<p class="meta" style="margin:0 0 0.5rem 0;">Build JOINs from the root table. Preview shows validation errors until the graph is valid.</p>';
      html += '<div id="qb-multi-root"></div>';
      html += '</div>';

      html += '<div class="qb-preview" id="qb-preview"></div>';
      html += '</div>'; // end #qb-visual-panel

      // Raw SQL panel — hidden by default, shown when user switches to Raw mode.
      // Textarea is pre-filled with the visual builder's generated SQL on switch.
      html += '<div id="qb-raw-panel" style="display:none;">';
      html += '<textarea id="qb-raw-input" class="qb-raw-textarea" rows="4" spellcheck="false" placeholder="SELECT * FROM &quot;' + esc(tableName) + '&quot; LIMIT 200"></textarea>';
      html += '</div>';

      // Shared action buttons — used by both Visual and Raw modes
      html += '<div class="qb-row" style="margin-top:0.35rem;">';
      html += '<button type="button" id="qb-run" title="Execute the built query">Run query</button>';
      html += '<button type="button" id="qb-reset" title="Return to table view">Reset to table view</button>';
      html += '</div>';
      html += '</div></div>';
      return html;
    }

    export function getWhereOps(columnType) {
      var type = (columnType || '').toUpperCase();
      if (type === 'TEXT' || type.indexOf('VARCHAR') >= 0 || type.indexOf('CHAR') >= 0) {
        return [
          { val: 'LIKE', label: 'contains' }, { val: '=', label: 'equals' },
          { val: 'NOT_LIKE', label: 'not contains' }, { val: 'LIKE_START', label: 'starts with' },
          { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
        ];
      } else if (type === 'INTEGER' || type === 'REAL' || type.indexOf('INT') >= 0 || type.indexOf('FLOAT') >= 0 || type.indexOf('DOUBLE') >= 0 || type.indexOf('NUM') >= 0 || type.indexOf('DECIMAL') >= 0) {
        return [
          { val: '=', label: '=' }, { val: '!=', label: '!=' },
          { val: '>', label: '>' }, { val: '<', label: '<' },
          { val: '>=', label: '>=' }, { val: '<=', label: '<=' },
          { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
        ];
      } else if (type === 'BLOB') {
        return [
          { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
        ];
      }
      return [
        { val: '=', label: '=' }, { val: '!=', label: '!=' },
        { val: 'LIKE', label: 'contains' },
        { val: 'IS NULL', label: 'is null' }, { val: 'IS NOT NULL', label: 'is not null' }
      ];
    }

    /**
     * Adds one WHERE condition row. For the 2nd and subsequent rows, prepends an
     * AND/OR connector dropdown so users can combine conditions.
     * @param {Object} colTypes - Map of column name to type (for operators).
     * @param {Object} [preset] - Optional { column, op, value, connector } to restore state.
     */
    export function addWhereClause(colTypes: any, preset?: any) {
      var list = document.getElementById('qb-where-list');
      if (!list) return;
      var cols = Object.keys(colTypes || {});
      if (cols.length === 0) return;
      var isFirst = list.children.length === 0;
      var div = document.createElement('div');
      div.className = 'qb-where-item';
      if (!isFirst) {
        var connSel = document.createElement('select');
        connSel.className = 'qb-where-connector';
        connSel.title = 'Combine with previous condition';
        var optAnd = document.createElement('option');
        optAnd.value = 'AND';
        optAnd.textContent = 'AND';
        var optOr = document.createElement('option');
        optOr.value = 'OR';
        optOr.textContent = 'OR';
        connSel.appendChild(optAnd);
        connSel.appendChild(optOr);
        if (preset && (preset.connector === 'OR')) connSel.value = 'OR';
        connSel.addEventListener('change', updateQbPreview);
        div.appendChild(connSel);
      }
      var colSel = document.createElement('select');
      colSel.className = 'qb-where-col';
      cols.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        colSel.appendChild(opt);
      });
      if (preset && preset.column) colSel.value = preset.column;
      var opSel = document.createElement('select');
      opSel.className = 'qb-where-op';
      var valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.className = 'qb-where-val';
      valInput.placeholder = 'value';
      valInput.style.width = '8rem';
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '\u00D7';
      removeBtn.title = 'Remove condition';
      removeBtn.addEventListener('click', function() { div.remove(); updateQbPreview(); });
      var presetValue = preset ? preset.value : null;
      function updateOps() {
        var type = colTypes[colSel.value] || '';
        var ops = getWhereOps(type);
        opSel.innerHTML = '';
        ops.forEach(function(o) {
          var opt = document.createElement('option');
          opt.value = o.val; opt.textContent = o.label;
          opSel.appendChild(opt);
        });
        if (preset && preset.op) { opSel.value = preset.op; preset = null; }
        var op = opSel.value;
        valInput.style.display = (op === 'IS NULL' || op === 'IS NOT NULL') ? 'none' : '';
      }
      colSel.addEventListener('change', function() { updateOps(); updateQbPreview(); });
      opSel.addEventListener('change', function() {
        var op = this.value;
        valInput.style.display = (op === 'IS NULL' || op === 'IS NOT NULL') ? 'none' : '';
        updateQbPreview();
      });
      valInput.addEventListener('input', updateQbPreview);
      div.appendChild(colSel);
      div.appendChild(opSel);
      div.appendChild(valInput);
      div.appendChild(removeBtn);
      list.appendChild(div);
      updateOps();
      if (presetValue) valInput.value = presetValue;
      updateQbPreview();
    }

    export function buildQueryFromBuilder(tableName) {
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      var selectedCols = [];
      checkboxes.forEach(function(cb) { if (cb.checked) selectedCols.push(cb.value); });
      var selectPart = selectedCols.length > 0
        ? selectedCols.map(function(c) { return '"' + c + '"'; }).join(', ')
        : '*';
      var whereParts = [];
      var whereConnectors = []; // AND/OR for 2nd+ conditions (first has no connector in DOM)
      var whereItems = document.querySelectorAll('#qb-where-list .qb-where-item');
      whereItems.forEach(function(item) {
        var connSel = item.querySelector('.qb-where-connector');
        if (connSel) whereConnectors.push(connSel.value);
        var col = item.querySelector('.qb-where-col').value;
        var op = item.querySelector('.qb-where-op').value;
        var val = item.querySelector('.qb-where-val').value;
        var part;
        if (op === 'IS NULL') { part = '"' + col + '" IS NULL'; }
        else if (op === 'IS NOT NULL') { part = '"' + col + '" IS NOT NULL'; }
        else if (op === 'LIKE') { part = '"' + col + '" LIKE \'%' + val.replace(/'/g, "''") + '%\''; }
        else if (op === 'NOT_LIKE') { part = '"' + col + '" NOT LIKE \'%' + val.replace(/'/g, "''") + '%\''; }
        else if (op === 'LIKE_START') { part = '"' + col + '" LIKE \'' + val.replace(/'/g, "''") + '%\''; }
        else {
          var isNum = !isNaN(Number(val)) && val.trim() !== '';
          var sqlVal = isNum ? val : "'" + val.replace(/'/g, "''") + "'";
          part = '"' + col + '" ' + op + ' ' + sqlVal;
        }
        whereParts.push(part);
      });
      var orderCol = document.getElementById('qb-order-col').value;
      var orderDir = document.getElementById('qb-order-dir').value;
      var qbLimit = parseInt(document.getElementById('qb-limit').value || '200', 10) || 200;
      var sql = 'SELECT ' + selectPart + ' FROM "' + tableName + '"';
      if (whereParts.length > 0) {
        var whereClause = whereParts[0];
        for (var i = 1; i < whereParts.length; i++) {
          whereClause += ' ' + (whereConnectors[i - 1] || 'AND') + ' ' + whereParts[i];
        }
        sql += ' WHERE ' + whereClause;
      }
      if (orderCol) sql += ' ORDER BY "' + orderCol + '" ' + orderDir;
      sql += ' LIMIT ' + qbLimit;
      return sql;
    }

    export function updateQbPreview() {
      var preview = document.getElementById('qb-preview');
      if (!preview || !S.currentTableName) return;
      if (MQ.getQbScope() === 'multi') {
        preview.textContent = MQ.getMultiPreviewText();
        return;
      }
      preview.textContent = buildQueryFromBuilder(S.currentTableName);
    }

    export function runQueryBuilder() {
      // In Raw mode, use the textarea content directly instead of the visual builder
      var rawPanel = document.getElementById('qb-raw-panel');
      var rawInput = document.getElementById('qb-raw-input') as HTMLTextAreaElement | null;
      var isRawMode = rawPanel && rawPanel.style.display !== 'none';
      var sql: string;
      if (isRawMode && rawInput) {
        sql = rawInput.value.trim();
      } else if (MQ.getQbScope() === 'multi') {
        var multiSql = MQ.tryGetMultiSql();
        if (!multiSql) {
          alert('Fix validation errors shown in the preview, or switch to Raw SQL.');
          return;
        }
        sql = multiSql;
      } else {
        sql = buildQueryFromBuilder(S.currentTableName);
      }
      if (!sql) return;
      var runBtn = document.getElementById('qb-run');
      if (runBtn) { runBtn.disabled = true; setButtonBusy(runBtn, true, 'Running\u2026'); }
      var savedState = captureQueryBuilderState();
      fetch('/api/sql', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql })
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(result) {
          if (!result.ok) {
            alert('Query error: ' + (result.data.error || 'Unknown error'));
            return;
          }
          S.setQueryBuilderActive(true);
          S.setQueryBuilderState(savedState);
          var rows = result.data.rows || [];
          var content = document.getElementById('content');
          var fkMap = {};
          var cachedFks = S.fkMetaCache[S.currentTableName] || [];
          (cachedFks || []).forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = S.tableColumnTypes[S.currentTableName] || {};
          var html = '<p class="meta">Query builder result: ' + rows.length + ' row(s)</p>';
          html += '<p class="meta" style="font-family:monospace;font-size:11px;color:var(--muted);">' + esc(sql) + '</p>';
          html += buildQueryBuilderHtml(S.currentTableName, colTypes);
          // Wrap query builder results in the same collapsible expander
          // used by the main table view, expanded by default.
          var rawTableHtml = wrapDataTableInScroll(buildDataTableHtml(rows, fkMap, colTypes, getColumnConfig(S.currentTableName)));
          rawTableHtml += buildTableStatusBar(S.tableCounts[S.currentTableName] || null, 0, rows.length, rows.length, getVisibleColumnCount(Object.keys(rows[0] || {}), getColumnConfig(S.currentTableName)));
          var resultsLabel = rows.length + ' row' + (rows.length !== 1 ? 's' : '');
          html += '<div class="results-table-wrap" role="region" aria-label="Results">' +
            '<div class="results-table-heading">\u25B2 Results \u2014 ' + resultsLabel + '</div>' +
            '<div class="results-table-body">' + rawTableHtml + '</div></div>';
          content.innerHTML = html;
          bindQueryBuilderEvents(colTypes);
          restoreQueryBuilderUIState(savedState);
          bindColumnTableEvents();
          bindResultsToggle();
          // Expand the QB body since user is actively using it
          var body = document.getElementById('qb-body');
          var toggle = document.getElementById('qb-toggle');
          if (body) body.classList.remove('collapsed');
          if (toggle) toggle.textContent = '\u25B2 Query builder';
          saveTableState(S.currentTableName);
        })
        .catch(function(e) { alert('Error: ' + e.message); })
        .finally(function() {
          if (runBtn) { runBtn.disabled = false; setButtonBusy(runBtn, false, 'Run query'); }
        });
    }

    export function resetQueryBuilder() {
      S.setQueryBuilderActive(false);
      S.setQueryBuilderState(null);
      // NOTE: renderTableView is defined in app.js
      saveTableState(S.currentTableName);
      if (S.currentTableName && S.currentTableJson) {
        renderTableView(S.currentTableName, S.currentTableJson);
      }
    }

    export function bindQueryBuilderEvents(colTypes) {
      var toggle = document.getElementById('qb-toggle');
      var body = document.getElementById('qb-body');
      if (toggle && body) {
        toggle.addEventListener('click', function() {
          var collapsed = body.classList.contains('collapsed');
          body.classList.toggle('collapsed', !collapsed);
          toggle.textContent = collapsed ? '\u25B2 Query builder' : '\u25BC Query builder';
        });
      }
      var addBtn = document.getElementById('qb-add-where');
      if (addBtn) addBtn.addEventListener('click', function() { addWhereClause(colTypes); });
      var runBtn = document.getElementById('qb-run');
      if (runBtn) runBtn.addEventListener('click', runQueryBuilder);
      var resetBtn = document.getElementById('qb-reset');
      if (resetBtn) resetBtn.addEventListener('click', resetQueryBuilder);
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      checkboxes.forEach(function(cb) { cb.addEventListener('change', updateQbPreview); });
      var orderCol = document.getElementById('qb-order-col');
      var orderDir = document.getElementById('qb-order-dir');
      var qbLimit = document.getElementById('qb-limit');
      if (orderCol) orderCol.addEventListener('change', updateQbPreview);
      if (orderDir) orderDir.addEventListener('change', updateQbPreview);
      if (qbLimit) qbLimit.addEventListener('input', updateQbPreview);
      updateQbPreview();

      // Visual/Raw mode toggle wiring
      var visualBtn = document.getElementById('qb-mode-visual');
      var rawBtn = document.getElementById('qb-mode-raw');
      var visualPanel = document.getElementById('qb-visual-panel');
      var rawPanel = document.getElementById('qb-raw-panel');
      var rawInput = document.getElementById('qb-raw-input') as HTMLTextAreaElement | null;
      var scopeSingle = document.getElementById('qb-scope-single');
      var scopeMulti = document.getElementById('qb-scope-multi');
      if (scopeSingle && scopeMulti) {
        MQ.setMultiChangeHandler(updateQbPreview);
        MQ.initMultiForTable(S.currentTableName, colTypes);
        void loadSchemaMeta().then(function() {
          if (MQ.getQbScope() === 'multi') MQ.renderMultiRoot();
        });
        scopeSingle.addEventListener('click', function() { MQ.setQbScope('single'); updateQbPreview(); });
        scopeMulti.addEventListener('click', function() {
          MQ.initMultiForTable(S.currentTableName, colTypes);
          void loadSchemaMeta().then(function() {
            MQ.setQbScope('multi');
            updateQbPreview();
          });
        });
      }

      if (visualBtn && rawBtn && visualPanel && rawPanel) {
        visualBtn.addEventListener('click', function() {
          // Switch to Visual mode
          visualBtn.classList.add('active');
          rawBtn.classList.remove('active');
          visualPanel.style.display = '';
          rawPanel.style.display = 'none';
        });
        rawBtn.addEventListener('click', function() {
          // Switch to Raw mode — pre-fill textarea with the current
          // visual builder SQL so the user can refine it manually.
          rawBtn.classList.add('active');
          visualBtn.classList.remove('active');
          visualPanel.style.display = 'none';
          rawPanel.style.display = '';
          if (rawInput && S.currentTableName) {
            if (MQ.getQbScope() === 'multi') {
              var ms = MQ.tryGetMultiSql();
              rawInput.value = ms || MQ.getMultiPreviewText();
            } else {
              rawInput.value = buildQueryFromBuilder(S.currentTableName);
            }
            rawInput.focus();
          }
        });
      }
    }

    export function captureQueryBuilderState() {
      var state: any = {
        active: S.queryBuilderActive,
        qbScope: MQ.getQbScope(),
        multi: MQ.captureMultiPersistable(),
        selectedColumns: [],
        whereClauses: [],
        orderBy: '',
        orderDir: 'ASC',
        limit: 200,
      };
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      checkboxes.forEach(function(cb) { if (cb.checked) state.selectedColumns.push(cb.value); });
      var whereItems = document.querySelectorAll('#qb-where-list .qb-where-item');
      whereItems.forEach(function(item) {
        var connSel = item.querySelector('.qb-where-connector');
        state.whereClauses.push({
          column: item.querySelector('.qb-where-col').value,
          op: item.querySelector('.qb-where-op').value,
          value: item.querySelector('.qb-where-val').value,
          connector: connSel ? connSel.value : 'AND'
        });
      });
      var orderCol = document.getElementById('qb-order-col');
      var orderDir = document.getElementById('qb-order-dir');
      var qbLimit = document.getElementById('qb-limit');
      if (orderCol) state.orderBy = orderCol.value;
      if (orderDir) state.orderDir = orderDir.value;
      if (qbLimit) state.limit = parseInt(qbLimit.value || '200', 10) || 200;
      return state;
    }

    export function restoreQueryBuilderUIState(state) {
      if (!state) return;
      if (state.qbScope === 'multi' && state.multi) {
        void loadSchemaMeta()
          .then(function() {
            return MQ.restoreMultiFromPersistable(state.multi as Record<string, unknown>);
          })
          .then(function() {
            MQ.setQbScope('multi');
            updateQbPreview();
          });
        return;
      }
      MQ.initMultiForTable(S.currentTableName, _qbColTypes);
      MQ.setQbScope('single');
      var checkboxes = document.querySelectorAll('#qb-columns input[type="checkbox"]');
      if (state.selectedColumns && state.selectedColumns.length > 0) {
        checkboxes.forEach(function(cb) {
          cb.checked = state.selectedColumns.indexOf(cb.value) >= 0;
        });
      }
      if (state.whereClauses && state.whereClauses.length > 0) {
        state.whereClauses.forEach(function(wc) {
          addWhereClause(_qbColTypes, {
            column: wc.column,
            op: wc.op,
            value: wc.value,
            connector: wc.connector || 'AND'
          });
        });
      }
      var orderCol = document.getElementById('qb-order-col');
      var orderDir = document.getElementById('qb-order-dir');
      var qbLimit = document.getElementById('qb-limit');
      if (orderCol && state.orderBy) orderCol.value = state.orderBy;
      if (orderDir && state.orderDir) orderDir.value = state.orderDir;
      if (qbLimit && state.limit) qbLimit.value = String(state.limit);
      updateQbPreview();
    }
