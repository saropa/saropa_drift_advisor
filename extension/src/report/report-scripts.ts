/** Returns client-side JavaScript for the portable report. */
export function getReportJs(): string {
  return `
'use strict';
var currentTable = null;
var currentPage = 0;
var filterText = '';
var PAGE_SIZE = 50;

function esc(v) {
  if (v === null || v === undefined) return '<span class="null">NULL</span>';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showTable(name) {
  currentTable = DATA.find(function(t) { return t.name === name; });
  if (!currentTable) return;
  currentPage = 0;
  filterText = '';
  var searchEl = document.getElementById('search');
  if (searchEl) searchEl.value = '';
  var btns = document.querySelectorAll('.table-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-table') === name);
  }
  renderTable();
  showSection('data');
}

function getFilteredRows() {
  if (!currentTable) return [];
  if (!filterText) return currentTable.rows;
  var lower = filterText.toLowerCase();
  return currentTable.rows.filter(function(row) {
    return currentTable.columns.some(function(c) {
      return String(row[c.name] == null ? '' : row[c.name]).toLowerCase().indexOf(lower) !== -1;
    });
  });
}

function renderTable() {
  if (!currentTable) return;
  var filtered = getFilteredRows();
  var start = currentPage * PAGE_SIZE;
  var pageRows = filtered.slice(start, start + PAGE_SIZE);
  var cols = currentTable.columns.map(function(c) { return c.name; });

  var html = '<div class="table-header">';
  html += '<h2>' + esc(currentTable.name) + '</h2>';
  html += '<span class="row-info">' + currentTable.totalRowCount + ' rows';
  if (currentTable.truncated) html += ' (showing ' + currentTable.rows.length + ')';
  html += '</span></div>';

  html += '<div class="search-bar"><input type="text" id="search" placeholder="Filter rows\\u2026" value="'
    + esc(filterText) + '" oninput="onFilter(this.value)"></div>';

  html += '<div class="table-scroll"><table><thead><tr>';
  for (var ci = 0; ci < cols.length; ci++) {
    html += '<th>' + esc(cols[ci]) + '</th>';
  }
  html += '</tr></thead><tbody>';
  for (var ri = 0; ri < pageRows.length; ri++) {
    html += '<tr>';
    for (var ci2 = 0; ci2 < cols.length; ci2++) {
      html += '<td>' + esc(pageRows[ri][cols[ci2]]) + '</td>';
    }
    html += '</tr>';
  }
  if (pageRows.length === 0) {
    html += '<tr><td colspan="' + cols.length + '" class="empty">'
      + (filterText ? 'No matching rows.' : 'Table is empty.') + '</td></tr>';
  }
  html += '</tbody></table></div>';

  html += renderPagination(filtered.length);
  document.getElementById('table-view').innerHTML = html;
}

function renderPagination(total) {
  var pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return '';
  var html = '<div class="pagination">';
  html += '<button onclick="goPage(' + (currentPage - 1) + ')"'
    + (currentPage === 0 ? ' disabled' : '') + '>\\u25C0 Prev</button>';
  html += '<span>Page ' + (currentPage + 1) + ' of ' + pages
    + ' (' + total + ' rows)</span>';
  html += '<button onclick="goPage(' + (currentPage + 1) + ')"'
    + (currentPage >= pages - 1 ? ' disabled' : '') + '>Next \\u25B6</button>';
  html += '</div>';
  return html;
}

function goPage(p) {
  var filtered = getFilteredRows();
  var pages = Math.ceil(filtered.length / PAGE_SIZE);
  if (p < 0 || p >= pages) return;
  currentPage = p;
  renderTable();
}

function onFilter(text) {
  filterText = text;
  currentPage = 0;
  renderTable();
}

function showSection(section) {
  var sections = ['data', 'schema', 'anomalies'];
  for (var i = 0; i < sections.length; i++) {
    var el = document.getElementById('section-' + sections[i]);
    if (el) el.style.display = sections[i] === section ? 'block' : 'none';
  }
  var tabs = document.querySelectorAll('.nav-tab');
  for (var j = 0; j < tabs.length; j++) {
    tabs[j].classList.toggle('active', tabs[j].getAttribute('data-section') === section);
  }
}

function toggleTheme() {
  var html = document.documentElement;
  if (html.getAttribute('data-theme') === 'dark') {
    html.removeAttribute('data-theme');
    try { localStorage.setItem('drift-report-theme', 'light'); } catch(e) {}
  } else {
    html.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('drift-report-theme', 'dark'); } catch(e) {}
  }
}

(function() {
  try {
    var saved = localStorage.getItem('drift-report-theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch(e) {}
})();

if (DATA.length > 0) showTable(DATA[0].name);
`;
}
