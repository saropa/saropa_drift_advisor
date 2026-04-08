/**
 * Schema module: schema loading, rendering, and "both" (schema + data) view.
 *
 * Extracted from app.js — function bodies are unchanged.
 * All shared state accessed via S.*.
 */
import * as S from './state.ts';
import { esc, highlightSqlSafe } from './utils.ts';
import { getScope, filterRows, getTableDisplayData, buildTableFilterMetaSuffix, applySearch } from './search.ts';
import { rowCountText } from './table-list.ts';
import { getColumnConfig } from './persistence.ts';
import { buildDataTableHtml, wrapDataTableInScroll, buildTableStatusBar, getVisibleColumnCount, buildTableDefinitionHtml } from './table-view.ts';

/** Fetches the schema DDL and renders it into the inline <pre> element. */
export function loadSchemaIntoPre() {
      var pre = document.getElementById('schema-inline-pre');
      if (!pre) return;
      fetch('/api/schema', S.authOpts()).then(r => r.text()).then(function(schema) {
        S.setCachedSchema(schema);
        pre.innerHTML = highlightSqlSafe(schema);
      }).catch(function() { pre.textContent = 'Failed to load.'; });
    }

/** Loads and renders the schema-only view into the content area. */
export function loadSchemaView() {
      const content = document.getElementById('content');
      content.innerHTML = '<p class="meta">Loading schema\u2026</p>';
      if (S.cachedSchema !== null) {
        renderSchemaContent(content, S.cachedSchema);
        applySearch();

   return;
      }
      fetch('/api/schema', S.authOpts())
        .then(r => r.text())
        .then(schema => {
          S.setCachedSchema(schema);
          renderSchemaContent(content, schema);
          applySearch();
        })
        .catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }

/** Renders schema content (schema-only or both mode) into the given container. */
export function renderSchemaContent(container, schema) {
      S.setLastRenderedData(null);
      S.setLastRenderedSchema(schema);
      const scope = getScope();
      if (scope === 'both') {
        container.innerHTML = '<div class="search-section-collapsible expanded">' +
          '<div class="collapsible-header" data-collapsible>Schema</div>' +
          '<div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
          '</div>' +
          '<div class="search-section-collapsible expanded" id="both-data-section">' +
          '<div class="collapsible-header" data-collapsible>Table data</div>' +
          '<div class="collapsible-body"><p class="meta">Select a table above to load data.</p></div>' +
          '</div>';
        const dataSection = document.getElementById('both-data-section');
        if (dataSection && S.currentTableName && S.currentTableJson !== null) {
          const displayData = getTableDisplayData(S.currentTableJson);
          const filtered = filterRows(S.currentTableJson);
          const metaText = rowCountText(S.currentTableName) + buildTableFilterMetaSuffix(filtered.length, S.currentTableJson.length);
          var fkMap = {};
          var cachedFks = S.fkMetaCache[S.currentTableName] || [];
          cachedFks.forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = S.tableColumnTypes[S.currentTableName] || {};
          var dataBody = dataSection.querySelector('.collapsible-body');
          var headerEl = dataSection.querySelector('.collapsible-header');
          if (headerEl) headerEl.textContent = 'Table data: ' + S.currentTableName;
          /* Keep column-definition block in sync with renderTableView / table tabs. */
          if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + '</p>' + buildTableDefinitionHtml(S.currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(S.currentTableName))) + buildTableStatusBar(S.tableCounts[S.currentTableName], S.offset, S.limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(S.currentTableName)));
        }
      } else {
        container.innerHTML = '<p class="meta">Schema</p><pre id="content-pre">' + highlightSqlSafe(schema) + '</pre>';
      }
    }

/**
 * Builds HTML for the "both" (schema + table data) view with collapsible sections.
 * @param {string} defHtml - Table definition block from buildTableDefinitionHtml (may be empty).
 */
export function buildBothViewSectionsHtml(tableName, metaText, qbHtml, tableHtml, schema, defHtml) {
      defHtml = defHtml || '';
      return '<div class="search-section-collapsible expanded">' +
        '<div class="collapsible-header" data-collapsible>Schema</div>' +
        '<div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
        '</div>' +
        '<div class="search-section-collapsible expanded" id="both-data-section">' +
        '<div class="collapsible-header" data-collapsible>Table data: ' + esc(tableName) + '</div>' +
        '<div class="collapsible-body"><p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml + '</div>' +
        '</div>';
    }

/** Loads the combined schema + table data view. */
export function loadBothView() {
      const content = document.getElementById('content');
      content.innerHTML = '<p class="meta">Loading\u2026</p>';
      (S.cachedSchema !== null ? Promise.resolve(S.cachedSchema) : fetch('/api/schema', S.authOpts()).then(r => r.text()))
      .then(schema => {
        if (S.cachedSchema === null) S.setCachedSchema(schema);
        S.setLastRenderedSchema(schema);
        let dataHtml = '';
        if (S.currentTableName && S.currentTableJson !== null) {
          const displayData = getTableDisplayData(S.currentTableJson);
          const filtered = filterRows(S.currentTableJson);
          const metaText = rowCountText(S.currentTableName) + buildTableFilterMetaSuffix(filtered.length, S.currentTableJson.length);
          var fkMap = {};
          var cachedFks = S.fkMetaCache[S.currentTableName] || [];
          cachedFks.forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
          var colTypes = S.tableColumnTypes[S.currentTableName] || {};
          dataHtml = '<p class="meta">' + metaText + '</p>' + buildTableDefinitionHtml(S.currentTableName) + wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(S.currentTableName))) + buildTableStatusBar(S.tableCounts[S.currentTableName], S.offset, S.limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(S.currentTableName)));
        } else {
          S.setLastRenderedData(null);
          dataHtml = '<p class="meta">Select a table above to load data.</p>';
        }
        content.innerHTML = '<div class="search-section-collapsible expanded">' +
          '<div class="collapsible-header" data-collapsible>Schema</div>' +
          '<div class="collapsible-body"><pre id="schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
          '</div>' +
          '<div class="search-section-collapsible expanded" id="both-data-section">' +
          '<div class="collapsible-header" data-collapsible>Table data</div>' +
          '<div class="collapsible-body">' + dataHtml + '</div>' +
          '</div>';
        applySearch();
      }).catch(e => { content.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>'; });
    }
