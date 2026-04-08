/**
 * Search tab init — event handlers for the self-contained Search panel.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, highlightSqlSafe, formatTableRowCountDisplay, syncFeatureCardExpanded } from './utils.ts';
import { getDisplayValue, isPiiMaskEnabled, isPiiColumn } from './pii.ts';
import { applySearch, nextMatch, prevMatch, highlightText, getScope, getSearchTerm, getRowFilter, filterRows, getTableDisplayData, buildTableFilterMetaSuffix, expandSectionContaining } from './search.ts';
import { openTableTab, switchTab } from './tabs.ts';
import { showCopyToast, buildDataTableHtml, wrapDataTableInScroll, buildTableStatusBar, getVisibleColumnCount, buildTableDefinitionHtml, renderTableView } from './table-view.ts';
import { getColumnConfig } from './persistence.ts';
import { loadTable } from './table-list.ts';
import { loadFkMeta } from './fk-nav.ts';
import { loadColumnTypes } from './table-view.ts';

export function initSearchTab(): void {
  // --- Search-tab DOM handles ---
  var stTableSel  = document.getElementById('st-table');
  var stInput     = document.getElementById('st-input');
  var stScopeSel  = document.getElementById('st-scope');
  var stFilterEl  = document.getElementById('st-filter');
  var stNavEl     = document.getElementById('st-nav');
  var stCountEl   = document.getElementById('st-count');
  var stPrevBtn   = document.getElementById('st-prev');
  var stNextBtn   = document.getElementById('st-next');
  var stRowToggle = document.getElementById('st-row-toggle-wrap');
  var stRowAll    = document.getElementById('st-row-all');
  var stRowMatch  = document.getElementById('st-row-matching');
  var stPanel     = document.getElementById('search-results-content');
  if (!stTableSel || !stInput || !stPanel) return;

  // --- Search-tab–specific state (independent of Tables tab) ---
  var stTableName = null;      // currently selected table
  var stTableJson = null;      // fetched row data for that table
  var stSchemaText = null;     // rendered schema text (for highlighting)
  var stCachedFks = null;      // cached FK metadata for current table
  var stCachedColTypes = null; // cached column types for current table
  var stMatches = [];          // highlighted spans
  var stMatchIdx = -1;         // active match index
  var stOnlyMatching = true;   // row-display toggle
  // FIX #2: Independent pagination so Tables tab pagination doesn't bleed
  var stLimit = 500;
  var stOffset = 0;

  // --- Accessors for search-tab controls ---
  function stScope()  { return stScopeSel.value || ''; }
  function stTerm()   { return String(stInput.value || '').trim(); }
  function stFilter() { return String(stFilterEl.value || '').trim(); }

  // --- Populate table dropdown from master table list ---
  // Called by renderTableList whenever the table list updates.
  window._stPopulateTables = function(tables) {
    var prev = stTableSel.value;
    stTableSel.innerHTML = '<option value="">-- select --</option>';
    (tables || []).forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = (S.tableCounts[t] != null)
        ? (t + ' (' + formatTableRowCountDisplay(S.tableCounts[t]) + ')')
        : t;
      stTableSel.appendChild(opt);
    });
    // Preserve previous selection if still valid
    if (prev) stTableSel.value = prev;
  };

  // --- Sync: when sidebar table changes, update dropdown selection ---
  window._stSyncTable = function(name) {
    if (name && stTableSel.querySelector('option[value="' + CSS.escape(name) + '"]')) {
      stTableSel.value = name;
    }
  };

  // FIX #13: Update a single dropdown option label when async count arrives
  window._stUpdateCount = function(table, count) {
    var opts = stTableSel.options;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === table) {
        opts[i].textContent = table + ' (' + formatTableRowCountDisplay(count) + ')';
        break;
      }
    }
  };

  // --- Row filtering (mirrors main filterRows but uses search-tab filter) ---
  function stFilterRows(data) {
    var term = stFilter();
    if (!term || !data || data.length === 0) return data || [];
    var lower = term.toLowerCase();
    return data.filter(function(row) {
      return Object.values(row).some(function(v) {
        return v != null && String(v).toLowerCase().includes(lower);
      });
    });
  }

  /**
   * Builds the search-tab content DOM from data/schema already in memory.
   * Extracted from the fetch .then() callback so it can be reused when
   * re-rendering from cache (e.g. filter or row-toggle changes).
   * FIX #1: Avoids the old recursive stRender() call after count fetch.
   * FIX #5: Uses id="st-data-table" to avoid duplicate id with Tables panel.
   * FIX #11: Filters data once and reuses the result (no double stFilterRows).
   */
  function stBuildContent(data, schema, fks, colTypes, tableName) {
    stTableJson = data;
    stCachedFks = fks;
    stCachedColTypes = colTypes;
    if (schema && S.cachedSchema === null) S.setCachedSchema(schema);

    var scope = stScope();
    // FIX #11: Compute filtered rows once and reuse for display
    var filtered = stFilterRows(data);
    var display = (stOnlyMatching && stFilter()) ? filtered : data;
    if (!display || display.length === 0) display = data;
    var fkMap = {};
    (fks || []).forEach(function(fk) { fkMap[fk.fromColumn] = fk; });

    // Build meta text using search-tab-local pagination (FIX #2)
    var total = S.tableCounts[tableName];
    var len = data.length;
    var metaText = esc(tableName);
    if (total != null) {
      var rangeText = len > 0 ? ('showing ' + (stOffset + 1) + '\u2013' + (stOffset + len)) : 'no rows in this range';
      metaText = esc(tableName) + ' (' + total + ' row' + (total !== 1 ? 's' : '') + '; ' + rangeText + ')';
    } else {
      metaText = esc(tableName) + ' (up to ' + stLimit + ' rows)';
    }
    var filterSuffix = '';
    if (stFilter()) {
      filterSuffix = stOnlyMatching
        ? ' (filtered: ' + filtered.length + ' of ' + data.length + ')'
        : ' (showing all rows; filter: ' + filtered.length + ' match)';
    }
    metaText += filterSuffix;

    // FIX #5: Replace id="data-table" with id="st-data-table" to avoid
    // duplicate ids when both Tables and Search panels are in the DOM.
    var rawTableHtml = buildDataTableHtml(display, fkMap, colTypes, getColumnConfig(tableName));
    var tableHtml = wrapDataTableInScroll(rawTableHtml.replace('id="data-table"', 'id="st-data-table"'))
      + buildTableStatusBar(total, stOffset, stLimit, display.length,
          getVisibleColumnCount(Object.keys(display[0] || {}), getColumnConfig(tableName)));

    if (scope === 'both' && schema) {
      stSchemaText = schema;
      stPanel.innerHTML =
        '<div class="search-section-collapsible expanded">' +
          '<div class="collapsible-header" data-collapsible>Schema</div>' +
          '<div class="collapsible-body"><pre id="st-schema-pre">' + highlightSqlSafe(schema) + '</pre></div>' +
        '</div>' +
        '<div class="search-section-collapsible expanded">' +
          '<div class="collapsible-header" data-collapsible>Table data: ' + esc(tableName) + '</div>' +
          '<div class="collapsible-body"><p class="meta st-meta">' + metaText + '</p>' + tableHtml + '</div>' +
        '</div>';
    } else {
      stSchemaText = null;
      stPanel.innerHTML = '<p class="meta st-meta">' + metaText + '</p>' + tableHtml;
    }

    // Show/hide row display toggle
    if (stRowToggle) {
      stRowToggle.style.display = (scope === 'data' || scope === 'both') ? 'flex' : 'none';
    }

    stHighlight();
  }

  // --- Render content into #search-results-content ---
  function stRender() {
    if (!stPanel) return;
    var scope = stScope();
    var tableName = stTableName;

    // Nothing selected yet → show prompt
    if (!tableName && scope !== 'schema') {
      stPanel.innerHTML = '<p class="meta">Select a table and type a search term.</p>';
      return;
    }

    // Schema-only view
    if (scope === 'schema') {
      stPanel.innerHTML = '<p class="meta">Loading schema\u2026</p>';
      var schemaPromise = S.cachedSchema !== null
        ? Promise.resolve(S.cachedSchema)
        : fetch('/api/schema', S.authOpts()).then(function(r) { return r.text(); });
      schemaPromise.then(function(schema) {
        if (S.cachedSchema === null) S.setCachedSchema(schema);
        stSchemaText = schema;
        stTableJson = null; // FIX #3: was stDataJson (undeclared → implicit global)
        stPanel.innerHTML = '<p class="meta">Schema</p><pre id="st-schema-pre">' + highlightSqlSafe(schema) + '</pre>';
        stHighlight();
      }).catch(function(e) {
        stPanel.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>';
      });
      return;
    }

    // Data or Both: need table data
    if (!tableName) {
      stPanel.innerHTML = '<p class="meta">Select a table above.</p>';
      return;
    }

    // FIX #12: Use cached data when available (filter/toggle changes skip the network)
    if (stTableJson && stCachedFks !== null && stCachedColTypes !== null) {
      // Schema might still be needed for 'both' scope
      if (scope === 'both' && !S.cachedSchema) {
        // Fetch schema only, then render with cached table data
        stPanel.innerHTML = '<p class="meta">Loading schema\u2026</p>';
        fetch('/api/schema', S.authOpts()).then(function(r) { return r.text(); }).then(function(schema) {
          S.setCachedSchema(schema);
          if (stTableName === tableName) stBuildContent(stTableJson, schema, stCachedFks, stCachedColTypes, tableName);
        }).catch(function(e) {
          stPanel.innerHTML = '<p class="meta">Error loading schema</p><pre>' + esc(String(e)) + '</pre>';
        });
        return;
      }
      stBuildContent(stTableJson, (scope === 'both') ? S.cachedSchema : null, stCachedFks, stCachedColTypes, tableName);
      return;
    }

    // Fresh fetch: show loading indicator
    stPanel.innerHTML = '<p class="meta">Loading ' + esc(tableName) + '\u2026</p>';

    // FIX #2: Use search-tab-local limit/offset (not global)
    var dataFetch = fetch('/api/table/' + encodeURIComponent(tableName) + '?limit=' + stLimit + '&offset=' + stOffset, S.authOpts())
      .then(function(r) { return r.json(); });
    var schemaFetch = (scope === 'both')
      ? (S.cachedSchema !== null ? Promise.resolve(S.cachedSchema) : fetch('/api/schema', S.authOpts()).then(function(r) { return r.text(); }))
      : Promise.resolve(null);

    Promise.all([dataFetch, schemaFetch, loadFkMeta(tableName), loadColumnTypes(tableName).catch(function() { return {}; })])
      .then(function(results) {
        var data = results[0];
        var schema = results[1];
        var fks = results[2];
        var colTypes = results[3];
        if (stTableName !== tableName) return; // user switched tables

        stBuildContent(data, schema, fks, colTypes, tableName);

        // FIX #1: Fetch total count and update meta text only (no recursive stRender).
        // The old code called stRender() again which fired 4 duplicate fetches.
        var total = S.tableCounts[tableName];
        if (total == null) {
          fetch('/api/table/' + encodeURIComponent(tableName) + '/count', S.authOpts())
            .then(function(r) { return r.json(); })
            .then(function(o) {
              S.tableCounts[tableName] = o.count;
              // Surgically update only the meta text element
              if (stTableName === tableName) {
                var metaEl = stPanel.querySelector('.st-meta');
                if (metaEl) {
                  var len = stTableJson ? stTableJson.length : 0;
                  var rangeText = len > 0 ? ('showing ' + (stOffset + 1) + '\u2013' + (stOffset + len)) : 'no rows in this range';
                  metaEl.textContent = tableName + ' (' + o.count + ' row' + (o.count !== 1 ? 's' : '') + '; ' + rangeText + ')';
                }
              }
            }).catch(function() {});
        }
      })
      .catch(function(e) {
        stPanel.innerHTML = '<p class="meta">Error</p><pre>' + esc(String(e)) + '</pre>';
      });
  }

  // --- Apply search highlighting within the search tab panel ---
  function stHighlight() {
    var term = stTerm();
    var scope = stScope();

    // Highlight schema text
    var schemaPre = stPanel.querySelector('#st-schema-pre');
    if (schemaPre && stSchemaText && (scope === 'schema' || scope === 'both')) {
      schemaPre.innerHTML = term ? highlightText(stSchemaText, term) : highlightSqlSafe(stSchemaText);
    }

    // FIX #5: Use st-data-table (not data-table) to target Search panel only
    var dataTable = stPanel.querySelector('#st-data-table');
    if (dataTable && (scope === 'data' || scope === 'both')) {
      dataTable.querySelectorAll('td').forEach(function(td) {
        if (!td.querySelector('.fk-link')) {
          var copyBtn = td.querySelector('.cell-copy-btn');
          var textNodes = [];
          td.childNodes.forEach(function(n) { if (n !== copyBtn) textNodes.push(n.textContent || ''); });
          var text = textNodes.join('');
          var highlighted = term ? highlightText(text, term) : esc(text);
          if (copyBtn) {
            td.innerHTML = highlighted + copyBtn.outerHTML;
          } else {
            td.innerHTML = highlighted;
          }
        }
      });
    }

    // Build match list from highlight spans
    stMatches = term ? Array.from(stPanel.querySelectorAll('.highlight')) : [];
    stMatchIdx = -1;

    if (stMatches.length > 0) {
      stNavEl.style.display = 'flex';
      stNavigate(0);
    } else {
      stNavEl.style.display = term ? 'flex' : 'none';
      stCountEl.textContent = term ? 'No matches' : '';
      stPrevBtn.disabled = true;
      stNextBtn.disabled = true;
    }
  }

  // --- Navigate matches ---
  function stNavigate(index) {
    if (stMatches.length === 0) return;
    if (index < 0) index = stMatches.length - 1;
    if (index >= stMatches.length) index = 0;
    if (stMatchIdx >= 0 && stMatchIdx < stMatches.length) {
      stMatches[stMatchIdx].classList.remove('highlight-active');
    }
    stMatchIdx = index;
    var el = stMatches[stMatchIdx];
    el.classList.add('highlight-active');
    expandSectionContaining(el);
    el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    stCountEl.textContent = (stMatchIdx + 1) + ' of ' + stMatches.length;
    stPrevBtn.disabled = false;
    stNextBtn.disabled = false;
  }
  function stNext() { if (stMatches.length) stNavigate(stMatchIdx + 1); }
  function stPrev() { if (stMatches.length) stNavigate(stMatchIdx - 1); }

  // --- Event listeners for search-tab controls ---
  // Table selection change → clear cache and fetch fresh data
  stTableSel.addEventListener('change', function() {
    stTableName = stTableSel.value || null;
    stTableJson = null;
    stCachedFks = null;
    stCachedColTypes = null;
    stRender();
  });

  // FIX #14: Debounce timers for keystroke-driven handlers
  var stInputTimer = null;
  var stFilterTimer = null;

  // Live search highlighting with short debounce to avoid jank on large tables
  stInput.addEventListener('input', function() {
    clearTimeout(stInputTimer);
    stInputTimer = setTimeout(function() {
      // If content is already rendered, just re-highlight (no re-fetch)
      if (stPanel.querySelector('#st-data-table, #st-schema-pre')) {
        stHighlight();
      } else {
        // No content yet — trigger full render if table selected
        if (stTableName || stScope() === 'schema') stRender();
      }
    }, 150);
  });

  // Keyboard navigation: Enter = next, Shift+Enter = prev, Escape = clear
  stInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) { stPrev(); } else { stNext(); }
    }
    if (e.key === 'Escape') {
      stInput.value = '';
      clearTimeout(stInputTimer);
      stHighlight();
      stInput.blur();
    }
  });

  // Scope change → may need different data; clear cache and re-render
  stScopeSel.addEventListener('change', function() { stRender(); });

  // FIX #12: Row filter re-renders from cached data (no network), debounced
  stFilterEl.addEventListener('input', function() {
    clearTimeout(stFilterTimer);
    stFilterTimer = setTimeout(function() {
      if (stTableName && stTableJson) stRender(); // uses cache path
    }, 200);
  });

  // Match navigation buttons
  stPrevBtn.addEventListener('click', stPrev);
  stNextBtn.addEventListener('click', stNext);

  // Row display toggle (All / Matching) — re-renders from cache
  if (stRowAll) stRowAll.addEventListener('click', function() {
    stOnlyMatching = false;
    stRowAll.classList.add('active');
    if (stRowMatch) stRowMatch.classList.remove('active');
    if (stTableName && stTableJson) stRender(); // uses cache path
  });
  if (stRowMatch) stRowMatch.addEventListener('click', function() {
    stOnlyMatching = true;
    stRowMatch.classList.add('active');
    if (stRowAll) stRowAll.classList.remove('active');
    if (stTableName && stTableJson) stRender(); // uses cache path
  });

  // --- Public: called from onTabSwitch when Search tab becomes active ---
  window._stOnActivate = function() {
    // If no content yet and we have a current table, pre-select it
    if (!stTableName && S.currentTableName) {
      stTableSel.value = S.currentTableName;
      stTableName = S.currentTableName;
      stRender();
    }
    // Focus search input for immediate typing
    stInput.focus();
  };

  // --- Public: focus search input (for Ctrl+F) ---
  window._stFocusInput = function() {
    stInput.focus();
    stInput.select();
  };
}
