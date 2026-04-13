/**
 * Import tool panel init function: CSV/JSON/TSV data import with column
 * mapping, clipboard paste, and session history.
 *
 * Split from tools.ts for modularity — each tool group gets its own file.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, syncFeatureCardExpanded } from './utils.ts';
import { loadTable } from './table-list.ts';

export function initImport(): void {
  const toggle = document.getElementById('import-toggle');
  const collapsible = document.getElementById('import-collapsible');
  const tableSel = document.getElementById('import-table');
  const formatSel = document.getElementById('import-format');
  const fileInput = document.getElementById('import-file');
  const runBtn = document.getElementById('import-run');
  const previewEl = document.getElementById('import-preview');
  const statusEl = document.getElementById('import-status');
  const mappingContainer = document.getElementById('import-column-mapping');
  const mappingTbody = document.getElementById('import-mapping-tbody');

  let importFileData = null;
  let importCsvHeaders = [];

  // --- Import history: track all import operations in this session ---
  var importHistory = [];
  var historyDetailsEl = document.getElementById('import-history-details');
  var historyListEl = document.getElementById('import-history-list');

  /** Record an import attempt and update the history UI. */
  function addImportHistory(table, format, imported, errors) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString();
    var entry = { time: timeStr, table: table, format: format, imported: imported, errors: errors || [] };
    importHistory.unshift(entry);
    renderImportHistory();
  }

  /** Render the import history list. */
  function renderImportHistory() {
    if (!historyListEl || !historyDetailsEl) return;
    if (importHistory.length === 0) { historyDetailsEl.style.display = 'none'; return; }
    historyDetailsEl.style.display = 'block';
    var html = '';
    for (var i = 0; i < importHistory.length; i++) {
      var h = importHistory[i];
      var errText = h.errors.length > 0 ? ' <span style="color:#e57373;">(' + h.errors.length + ' error(s))</span>' : '';
      html += '<div style="padding:2px 0;border-bottom:1px solid var(--border,#333);">'
        + '<span style="opacity:0.6;">' + esc(h.time) + '</span> '
        + '<strong>' + esc(h.table) + '</strong> '
        + '(' + esc(h.format) + ') &mdash; '
        + h.imported + ' row(s)' + errText
        + '</div>';
    }
    historyListEl.innerHTML = html;
  }

  function parseCsvHeaderLine(line) {
    var fields = [];
    var cur = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        fields.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    fields.push(cur.trim());
    return fields;
  }

  function renderMappingTable() {
    if (!mappingTbody || importCsvHeaders.length === 0) return;
    var tableName = tableSel && tableSel.value;
    if (!tableName) {
      mappingContainer.style.display = 'none';
      return;
    }
    var requestedTable = tableName;
    mappingTbody.innerHTML = '<tr><td colspan="2" class="meta">Loading columns…</td></tr>';
    mappingContainer.style.display = 'block';
    fetch('/api/table/' + encodeURIComponent(tableName) + '/columns', S.authOpts())
      .then(function(r) { return r.json(); })
      .then(function(tableColumns) {
        if (tableSel.value !== requestedTable) return;
        if (!Array.isArray(tableColumns)) { mappingContainer.style.display = 'none'; return; }
        var html = '';
        importCsvHeaders.forEach(function(csvCol) {
          var optHtml = '<option value="">(skip)</option>' + tableColumns.map(function(tc) {
            return '<option value="' + esc(tc) + '">' + esc(tc) + '</option>';
          }).join('');
          html += '<tr><td style="border:1px solid var(--border);padding:4px;">' + esc(csvCol) + '</td>';
          html += '<td style="border:1px solid var(--border);padding:4px;"><select class="import-map-select" data-csv-header="' + esc(csvCol) + '">' + optHtml + '</select></td></tr>';
        });
        mappingTbody.innerHTML = html;
      })
      .catch(function() {
        if (tableSel.value !== requestedTable) return;
        mappingTbody.innerHTML = '<tr><td colspan="2" class="meta" style="color:#e57373;">Failed to load table columns.</td></tr>';
      });
  }

  function updateImportState() {
    var hasFile = importFileData !== null && importFileData !== '';
    var table = tableSel && tableSel.value;
    runBtn.disabled = !hasFile || !table;
    if (hasFile && previewEl) {
      previewEl.style.display = 'block';
      previewEl.textContent = importFileData.length > 2000 ? importFileData.slice(0, 2000) + '\n…' : importFileData;
    }
    var fmt = formatSel && formatSel.value;
    if (fmt === 'csv' && hasFile && importCsvHeaders.length > 0) {
      renderMappingTable();
    } else {
      if (mappingContainer) mappingContainer.style.display = 'none';
    }
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      var isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', function() {
      var f = this.files && this.files[0];
      if (!f) { importFileData = null; importCsvHeaders = []; updateImportState(); return; }
      var reader = new FileReader();
      reader.onload = function() {
        importFileData = reader.result;
        if (typeof importFileData !== 'string') importFileData = null;
        importCsvHeaders = [];
        if (importFileData && (formatSel && formatSel.value) === 'csv') {
          var firstLine = importFileData.split(/\r?\n/)[0] || '';
          importCsvHeaders = parseCsvHeaderLine(firstLine);
        }
        updateImportState();
      };
      reader.readAsText(f);
    });
  }

  // Paste from clipboard: auto-detect format (TSV, CSV, JSON) and populate import data.
  var pasteBtn = document.getElementById('import-paste');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', function() {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        alert('Clipboard API not available (requires HTTPS or localhost).');
        return;
      }
      navigator.clipboard.readText().then(function(text) {
        if (!text || !text.trim()) { alert('Clipboard is empty.'); return; }
        importFileData = text;
        // Auto-detect format: JSON starts with [ or {, TSV has tabs, else CSV.
        var trimmed = text.trim();
        var detectedFormat = 'csv';
        if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
          detectedFormat = 'json';
        } else if (trimmed.indexOf('\t') >= 0) {
          // TSV: convert each line to CSV by splitting on tabs and
          // quoting any field that contains commas or quotes.
          detectedFormat = 'csv';
          importFileData = text.split(/\r?\n/).map(function(line) {
            return line.split('\t').map(function(field) {
              if (field.indexOf(',') >= 0 || field.indexOf('"') >= 0) {
                return '"' + field.replace(/"/g, '""') + '"';
              }
              return field;
            }).join(',');
          }).join('\n');
        }
        if (formatSel) formatSel.value = detectedFormat;
        importCsvHeaders = [];
        if (detectedFormat === 'csv') {
          var firstLine = importFileData.split(/\r?\n/)[0] || '';
          importCsvHeaders = parseCsvHeaderLine(firstLine);
        }
        // Clear file input so there's no confusion about the data source
        if (fileInput) fileInput.value = '';
        updateImportState();
      }).catch(function(e) {
        alert('Failed to read clipboard: ' + (e.message || 'Permission denied'));
      });
    });
  }

  if (formatSel) formatSel.addEventListener('change', function() {
    if (this.value === 'csv' && importFileData) {
      var firstLine = importFileData.split(/\r?\n/)[0] || '';
      importCsvHeaders = parseCsvHeaderLine(firstLine);
    } else importCsvHeaders = [];
    updateImportState();
  });

  if (tableSel) tableSel.addEventListener('change', updateImportState);

  if (runBtn) {
    runBtn.addEventListener('click', function() {
      var table = tableSel && tableSel.value;
      var format = formatSel && formatSel.value;
      if (!table || !importFileData) return;
      if (!confirm('Import data into table "' + esc(table) + '"? This cannot be undone.')) return;
      runBtn.disabled = true;
      var runBtnOrigText = runBtn.textContent;
      setButtonBusy(runBtn, true, 'Importing…');
      statusEl.textContent = 'Importing…';
      var body = { format: format, data: importFileData, table: table };
      if (format === 'csv' && mappingContainer && mappingContainer.style.display !== 'none') {
        var mapping = {};
        mappingContainer.querySelectorAll('.import-map-select').forEach(function(sel) {
          var csvHeader = sel.getAttribute('data-csv-header');
          var tableCol = sel.value;
          if (csvHeader && tableCol) mapping[csvHeader] = tableCol;
        });
        if (Object.keys(mapping).length > 0) (body as any).columnMapping = mapping;
      }
      fetch('/api/import', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }))
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(o) {
          if (!o.ok) {
            statusEl.textContent = 'Error: ' + (o.data.error || 'Request failed');
            statusEl.style.color = '#e57373';
            addImportHistory(table, format, 0, [o.data.error || 'Request failed']);
            return;
          }
          var d = o.data;
          var msg = 'Imported ' + d.imported + ' row(s).';
          if (d.errors && d.errors.length > 0) msg += ' ' + d.errors.length + ' error(s): ' + d.errors.slice(0, 3).join('; ');
          statusEl.textContent = msg;
          statusEl.style.color = '';
          addImportHistory(table, format, d.imported, d.errors || []);
          if (d.imported > 0 && S.currentTableName === table) loadTable(table);
        })
        .catch(function(e) {
          statusEl.textContent = 'Error: ' + (e.message || 'Import failed');
          statusEl.style.color = '#e57373';
          addImportHistory(table, format, 0, [e.message || 'Import failed']);
        })
        .finally(function() {
          runBtn.disabled = !importFileData || !tableSel || !tableSel.value;
          setButtonBusy(runBtn, false, runBtnOrigText || 'Import');
        });
    });
  }
}
