/**
 * Inline JS for schema-aware autocomplete in the SQL Notebook textarea.
 *
 * Triggers:
 * - After `FROM` / `JOIN`: table names (prioritized by recent usage)
 * - After `tableName.`: column names for that table
 * - After `SELECT` / `,`: all columns (prefixed with table name)
 * - Partial word (≥2 chars): SQL keywords + table names + history snippets
 * - After common patterns: suggest common join patterns
 *
 * Injected into the HTML scaffold by {@link getNotebookHtml}.
 */
export function getAutocompleteJs(): string {
  return `
  // --- Autocomplete ---

  var sqlKeywords = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY',
    'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES',
    'UPDATE', 'SET', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE',
    'INDEX', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
    'NULL', 'IS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'EXISTS',
    'UNION', 'ALL', 'ASC', 'DESC'
  ];

  // Query history and patterns (populated by extension via postMessage)
  var queryHistory = [];
  var frequentTables = [];
  var joinPatterns = [];

  var textarea = document.getElementById('sql-input');
  var dropdown = document.getElementById('autocomplete-dropdown');
  var acItems = [];
  var acIndex = -1;

  textarea.addEventListener('input', onAcInput);
  textarea.addEventListener('keydown', onAcKeydown);
  document.addEventListener('click', function (e) {
    if (!dropdown.contains(e.target) && e.target !== textarea) hideDropdown();
  });

  // Listen for query intelligence data from extension
  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (msg.command === 'updateQueryIntelligence') {
      queryHistory = msg.history || [];
      frequentTables = msg.frequentTables || [];
      joinPatterns = msg.joinPatterns || [];
    }
  });

  function onAcInput() {
    var text = textarea.value;
    var pos = textarea.selectionStart;
    var before = text.substring(0, pos);

    var suggestions = getAcSuggestions(before);
    if (suggestions.length === 0) { hideDropdown(); return; }

    acItems = suggestions;
    acIndex = 0;
    renderAcDropdown();
  }

  function getAcSuggestions(before) {
    if (!schema) return [];

    // After FROM/JOIN: prioritize frequently used tables
    if (/(?:FROM|JOIN)\\s+$/i.test(before)) {
      var tableList = schema.map(function (t) { return { label: t.name, type: 'table' }; });
      return prioritizeByFrequency(tableList, frequentTables);
    }

    // After a table name followed by JOIN: suggest join patterns
    var joinMatch = before.match(/(\\w+)\\s+JOIN\\s+$/i);
    if (joinMatch && joinPatterns.length > 0) {
      var fromTable = joinMatch[1].toLowerCase();
      var relevantJoins = joinPatterns.filter(function (j) {
        return j.fromTable.toLowerCase() === fromTable;
      });
      if (relevantJoins.length > 0) {
        var joinSuggestions = relevantJoins.map(function (j) {
          return { label: j.toTable + ' ON ' + j.joinClause, type: 'pattern' };
        });
        var tableSuggestions = schema.map(function (t) { return { label: t.name, type: 'table' }; });
        return joinSuggestions.concat(tableSuggestions).slice(0, 15);
      }
    }

    var dotMatch = before.match(/(\\w+)\\.\\s*$/);
    if (dotMatch) {
      var tableName = dotMatch[1];
      var table = schema.find(function (t) {
        return t.name.toLowerCase() === tableName.toLowerCase();
      });
      if (table) {
        return table.columns.map(function (c) { return { label: c.name, type: c.type }; });
      }
    }

    if (/(?:SELECT|,)\\s+$/i.test(before)) {
      var allCols = [];
      for (var i = 0; i < schema.length; i++) {
        for (var j = 0; j < schema[i].columns.length; j++) {
          allCols.push({
            label: schema[i].name + '.' + schema[i].columns[j].name,
            type: schema[i].columns[j].type
          });
        }
      }
      return allCols.slice(0, 30);
    }

    var wordMatch = before.match(/(\\w+)$/);
    if (wordMatch && wordMatch[1].length >= 2) {
      var prefix = wordMatch[1].toLowerCase();
      var results = [];

      // Add matching history snippets first (higher priority)
      for (var h = 0; h < queryHistory.length && results.length < 5; h++) {
        var query = queryHistory[h];
        if (query.toLowerCase().includes(prefix)) {
          var snippet = query.length > 50 ? query.substring(0, 47) + '...' : query;
          results.push({ label: snippet, type: 'history', fullQuery: query });
        }
      }

      for (var k = 0; k < sqlKeywords.length; k++) {
        if (sqlKeywords[k].toLowerCase().startsWith(prefix)) {
          results.push({ label: sqlKeywords[k], type: 'keyword' });
        }
      }
      for (var m = 0; m < schema.length; m++) {
        if (schema[m].name.toLowerCase().startsWith(prefix)) {
          results.push({ label: schema[m].name, type: 'table' });
        }
      }
      return results.slice(0, 15);
    }

    return [];
  }

  function prioritizeByFrequency(items, frequentList) {
    if (!frequentList || frequentList.length === 0) return items;
    var frequentSet = new Set(frequentList.map(function(t) { return t.toLowerCase(); }));
    var frequent = items.filter(function(i) { return frequentSet.has(i.label.toLowerCase()); });
    var others = items.filter(function(i) { return !frequentSet.has(i.label.toLowerCase()); });
    return frequent.concat(others);
  }

  function onAcKeydown(e) {
    if (dropdown.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acIndex = Math.min(acIndex + 1, acItems.length - 1);
      renderAcDropdown();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acIndex = Math.max(acIndex - 1, 0);
      renderAcDropdown();
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      if (acItems.length > 0 && acIndex >= 0) {
        e.preventDefault();
        applyCompletion(acItems[acIndex]);
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    } else if (e.key === 'Tab') {
      if (acItems.length > 0 && acIndex >= 0) {
        e.preventDefault();
        applyCompletion(acItems[acIndex]);
      }
    }
  }

  function applyCompletion(item) {
    var pos = textarea.selectionStart;
    var text = textarea.value;
    var before = text.substring(0, pos);
    var wordMatch = before.match(/(\\w+)\\.?$/);
    var replaceFrom = wordMatch ? pos - wordMatch[0].length : pos;

    // For history items, replace the entire text with the full query
    if (item.type === 'history' && item.fullQuery) {
      textarea.value = item.fullQuery;
      textarea.selectionStart = textarea.selectionEnd = item.fullQuery.length;
    } else {
      textarea.value = text.substring(0, replaceFrom) + item.label + text.substring(pos);
      textarea.selectionStart = textarea.selectionEnd = replaceFrom + item.label.length;
    }

    hideDropdown();
    textarea.focus();
  }

  function renderAcDropdown() {
    dropdown.style.display = '';
    var html = '';
    for (var i = 0; i < acItems.length; i++) {
      var cls = i === acIndex ? 'ac-item ac-selected' : 'ac-item';
      var badge = '';
      if (acItems[i].type === 'history') {
        badge = '<span class="ac-type ac-history">history</span>';
      } else if (acItems[i].type === 'pattern') {
        badge = '<span class="ac-type ac-pattern">pattern</span>';
      } else if (acItems[i].type !== 'keyword') {
        badge = '<span class="ac-type">' + esc(acItems[i].type) + '</span>';
      }
      html += '<div class="' + cls + '" data-idx="' + i + '">'
        + esc(acItems[i].label) + badge + '</div>';
    }
    dropdown.innerHTML = html;

    dropdown.querySelectorAll('.ac-item').forEach(function (el) {
      el.addEventListener('click', function () {
        acIndex = Number(el.dataset.idx);
        applyCompletion(acItems[acIndex]);
      });
    });
  }

  function hideDropdown() {
    dropdown.style.display = 'none';
    acItems = [];
    acIndex = -1;
  }
`;
}
