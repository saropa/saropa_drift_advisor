/**
 * Analytics tool panel init functions: index suggestions, size analytics,
 * anomaly detection.
 *
 * Split from tools.ts for modularity — each tool group gets its own file.
 * These three tools share a common pattern: fetch from /api, render results,
 * and support save/export/compare via analysis.ts helpers.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, syncFeatureCardExpanded } from './utils.ts';
import { populateHistorySelect, getSavedAnalyses, getSavedAnalysisById, saveAnalysis, downloadJSON, showAnalysisCompare } from './analysis.ts';
import { showCopyToast } from './table-view.ts';
import { openTableTab } from './tabs.ts';

export function initIndexSuggestions(): void {
  const toggle = document.getElementById('index-toggle');
  const collapsible = document.getElementById('index-collapsible');
  const btn = document.getElementById('index-analyze');
  const container = document.getElementById('index-results');
  const saveBtn = document.getElementById('index-save');
  const exportBtn = document.getElementById('index-export');
  const historySel = document.getElementById('index-history');
  const compareBtn = document.getElementById('index-compare');
  var lastIndexData = null;

  function renderIndexData(data) {
    if (!data) return '<p class="meta">No current result. Run Analyze first.</p>';
    var suggestions = data.suggestions || [];
    if (suggestions.length === 0) {
      return '<p class="meta" style="color:#7cb342;">No index suggestions — schema looks good!</p>';
    }
    var priorityColors = { high: '#e57373', medium: '#ffb74d', low: '#7cb342' };
    var priorityIcons = { high: '!!', medium: '!', low: '\u2713' };
    var html = '<p class="meta">' + suggestions.length + ' suggestion(s) across ' + (data.tablesAnalyzed || 0) + ' tables:</p>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
    html += '<tr><th style="border:1px solid var(--border);padding:4px;">Priority</th><th style="border:1px solid var(--border);padding:4px;">Table.Column</th><th style="border:1px solid var(--border);padding:4px;">Reason</th><th style="border:1px solid var(--border);padding:4px;">SQL</th></tr>';
    suggestions.forEach(function(s) {
      var color = priorityColors[s.priority] || 'var(--fg)';
      var icon = priorityIcons[s.priority] || '';
      html += '<tr>';
      html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ';font-weight:bold;">[' + esc(icon) + '] ' + esc(s.priority).toUpperCase() + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(s.table) + '.' + esc(s.column) + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(s.reason) + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;"><code style="font-size:11px;cursor:pointer;" title="Click to copy" onclick="navigator.clipboard.writeText(this.textContent)">' + esc(s.sql) + '</code></td>';
      html += '</tr>';
    });
    html += '</table>';
    return html;
  }

  function showIndexResult(html: any, isError?: any) {
    container.innerHTML = html;
    container.style.display = 'block';
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (historySel) {
    populateHistorySelect(historySel, 'index');
    historySel.addEventListener('change', function() {
      var id = this.value;
      if (!id) return;
      var saved = getSavedAnalysisById('index', id);
      if (saved && saved.data) {
        lastIndexData = saved.data;
        showIndexResult(renderIndexData(saved.data));
      }
    });
  }

  if (btn) btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, 'Analyzing…');
    container.style.display = 'none';
    fetch('/api/index-suggestions', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
        return r.json();
      })
      .then(function(data) {
        lastIndexData = data;
        showIndexResult(renderIndexData(data));
        populateHistorySelect(historySel, 'index');
      })
      .catch(function(e) {
        showIndexResult('<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>');
      })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, 'Analyze');
      });
  });

  if (saveBtn) saveBtn.addEventListener('click', function() {
    if (!lastIndexData) return;
    var id = saveAnalysis('index', lastIndexData);
    showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
    populateHistorySelect(historySel, 'index');
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!lastIndexData) return;
    downloadJSON(lastIndexData, 'index-suggestions-' + (new Date().toISOString().slice(0, 10)) + '.json');
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    showAnalysisCompare('index', 'Index suggestions', getSavedAnalyses('index'), lastIndexData, renderIndexData, function(a, b) {
      var sa = (a && a.suggestions) ? a.suggestions.length : 0;
      var sb = (b && b.suggestions) ? b.suggestions.length : 0;
      return 'Before: ' + sa + ' suggestion(s) · After: ' + sb + ' suggestion(s)';
    });
  });
}

export function initSizeAnalytics(): void {
  const toggle = document.getElementById('size-toggle');
  const collapsible = document.getElementById('size-collapsible');
  const btn = document.getElementById('size-analyze');
  const container = document.getElementById('size-results');
  const saveBtn = document.getElementById('size-save');
  const exportBtn = document.getElementById('size-export');
  const historySel = document.getElementById('size-history');
  const compareBtn = document.getElementById('size-compare');

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  /**
   * Native `title` tooltips for Size analytics (matches PRAGMA semantics in analytics_handler).
   * Shown on hover for read-only labels, values, headers, and cells.
   */
  var SIZE_TT = {
    totalCard: 'Total size of the SQLite database file: PRAGMA page_count × PRAGMA page_size. Matches the main .db file size on disk.',
    usedCard: 'Bytes in pages that store data: total file size minus bytes in freelist pages (see Free). Same as totalSizeBytes − freeSpaceBytes from the server.',
    freeCard: 'Bytes in pages on SQLite\u2019s freelist (PRAGMA freelist_count × page_size). Unused pages inside the file that SQLite can reuse for new data without growing the file.',
    journalCard: 'SQLite PRAGMA journal_mode. wal means WAL (write-ahead logging): new writes go to a separate .wal file and are merged into the main database at checkpoint; readers can run at the same time as one writer. Other modes include delete, truncate, persist, memory, and off.',
    pagesTotal: 'Total bytes in all pages: page_count × page_size. Same number as Total Size.',
    pagesFormula: 'PRAGMA page_count (number of pages) × PRAGMA page_size (bytes per page, often 4096).',
    thTable: 'Name of this table in SQLite.',
    thRows: 'Row count for each table (SELECT COUNT(*) FROM table). Bar length is relative to the largest table in this list.',
    thColumns: 'Number of columns defined on the table (rows from PRAGMA table_info).',
    thIndexes: 'Number of indexes on the table (PRAGMA index_list), plus each index name.',
    tdTableLink: 'SQLite table name. Click to open this table in its own tab.',
    tdRows: 'Approximate number of rows in this table.',
    tdColumns: 'How many columns this table has.',
    tdIndexes: 'Index count and names from PRAGMA index_list for this table.'
  };

  function renderSizeData(data) {
    if (!data) return '<p class="meta">No data.</p>';
    var html = '<div style="margin:0.5rem 0;">';
    html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.totalCard) + '">';
    html += '<div class="meta">Total Size</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.totalSizeBytes) + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.usedCard) + '">';
    html += '<div class="meta">Used</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.usedSizeBytes) + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.freeCard) + '">';
    html += '<div class="meta">Free</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.freeSpaceBytes) + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.journalCard) + '">';
    html += '<div class="meta">Journal</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + esc(data.journalMode || '') + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.pagesTotal) + '">';
    html += '<div class="meta">Pages</div>';
    var pc = data.pageCount || 0;
    var ps = data.pageSize || 0;
    var pageBytes = pc * ps;
    html += '<div style="font-size:1.2rem;font-weight:bold;line-height:1.2;" title="' + esc(SIZE_TT.pagesTotal) + '">' + pageBytes.toLocaleString() + '</div>';
    html += '<div class="meta size-pages-formula" title="' + esc(SIZE_TT.pagesFormula) + '">(' + pc.toLocaleString() + ' × ' + ps.toLocaleString() + ')</div></div>';
    html += '</div>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
    html += '<tr><th style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.thTable) + '">Table</th>';
    html += '<th style="border:1px solid var(--border);padding:4px;min-width:8rem;" title="' + esc(SIZE_TT.thRows) + '">Rows</th>';
    html += '<th style="border:1px solid var(--border);padding:4px;text-align:right;" title="' + esc(SIZE_TT.thColumns) + '">Columns</th>';
    html += '<th style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.thIndexes) + '">Indexes</th></tr>';
    var tables = data.tables || [];
    var maxRows = Math.max.apply(null, tables.map(function(t) { return t.rowCount; }).concat([1]));
    tables.forEach(function(t) {
      var barWidth = Math.max(1, (t.rowCount / maxRows) * 100);
      html += '<tr>';
      html += '<td style="border:1px solid var(--border);padding:4px;"><a href="#" class="table-link size-table-link" data-table="' + esc(t.table) + '" title="' + esc(SIZE_TT.tdTableLink) + '">' + esc(t.table) + '</a></td>';
      html += '<td style="border:1px solid var(--border);padding:4px;white-space:nowrap;" title="' + esc(SIZE_TT.tdRows) + '">';
      html += '<div style="background:var(--link);height:12px;width:' + barWidth + '%;opacity:0.3;display:inline-block;vertical-align:middle;margin-right:4px;"></div>';
      html += t.rowCount.toLocaleString() + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;font-variant-numeric:tabular-nums;" title="' + esc(SIZE_TT.tdColumns) + '">' + t.columnCount + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.tdIndexes) + '">' + t.indexCount;
      if (t.indexes && t.indexes.length > 0) html += ' <span class="size-index-names">(' + t.indexes.map(esc).join(', ') + ')</span>';
      html += '</td></tr>';
    });
    html += '</table></div>';
    return html;
  }

  // Table names link to openTableTab (same as sidebar); delegated because rows are innerHTML.
  if (container) {
    container.addEventListener('click', function(e) {
      var a = e.target.closest('a.size-table-link');
      if (!a || !container.contains(a)) return;
      e.preventDefault();
      var name = a.getAttribute('data-table');
      if (name) openTableTab(name);
    });
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (historySel) {
    populateHistorySelect(historySel, 'size');
    historySel.addEventListener('change', function() {
      var id = this.value;
      if (!id) return;
      var saved = getSavedAnalysisById('size', id);
      if (saved && saved.data) {
        S.setLastSizeAnalyticsData(saved.data);
        container.innerHTML = renderSizeData(saved.data);
        container.style.display = 'block';
      }
    });
  }

  if (btn) btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, 'Analyzing…');
    container.style.display = 'none';
    fetch('/api/analytics/size', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
        return r.json();
      })
      .then(function(data) {
        S.setLastSizeAnalyticsData(data);
        container.innerHTML = renderSizeData(data);
        container.style.display = 'block';
        populateHistorySelect(historySel, 'size');
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, 'Analyze');
      });
  });

  if (saveBtn) saveBtn.addEventListener('click', function() {
    if (!S.lastSizeAnalyticsData) return;
    var id = saveAnalysis('size', S.lastSizeAnalyticsData);
    showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
    populateHistorySelect(historySel, 'size');
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!S.lastSizeAnalyticsData) return;
    downloadJSON(S.lastSizeAnalyticsData, 'size-analytics-' + (new Date().toISOString().slice(0, 10)) + '.json');
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    showAnalysisCompare('size', 'Database size analytics', getSavedAnalyses('size'), S.lastSizeAnalyticsData, renderSizeData, function(a, b) {
      var ta = (a && a.totalSizeBytes) != null ? formatBytes(a.totalSizeBytes) : '—';
      var tb = (b && b.totalSizeBytes) != null ? formatBytes(b.totalSizeBytes) : '—';
      return 'Before: ' + ta + ' total · After: ' + tb + ' total';
    });
  });
}

export function initAnomalyDetection(): void {
  const toggle = document.getElementById('anomaly-toggle');
  const collapsible = document.getElementById('anomaly-collapsible');
  const btn = document.getElementById('anomaly-analyze');
  const container = document.getElementById('anomaly-results');
  const saveBtn = document.getElementById('anomaly-save');
  const exportBtn = document.getElementById('anomaly-export');
  const historySel = document.getElementById('anomaly-history');
  const compareBtn = document.getElementById('anomaly-compare');
  var lastAnomalyData = null;

  /**
   * Computes a health score (0-100) and letter grade (A-F) from anomaly results.
   * Errors deduct 15pts each, warnings 5pts, info 1pt.  Score floors at 0.
   */
  function computeHealthScore(anomalies) {
    var score = 100;
    (anomalies || []).forEach(function(a) {
      if (a.severity === 'error') score -= 15;
      else if (a.severity === 'warning') score -= 5;
      else score -= 1;
    });
    if (score < 0) score = 0;
    var grade;
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';
    var color;
    if (score >= 80) color = '#81c784';
    else if (score >= 60) color = '#ffb74d';
    else color = '#e57373';
    return { score: score, grade: grade, color: color };
  }

  function renderAnomalyData(data) {
    if (!data) return '<p class="meta">No current result. Run Scan first.</p>';
    var anomalies = data.anomalies || [];
    var health = computeHealthScore(anomalies);
    // Health score pill: always shown after a scan (even when clean)
    var html = '<div class="health-score-pill" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.8rem;margin:0.4rem 0;border-radius:6px;background:rgba(0,0,0,0.15);font-size:14px;">';
    html += '<span style="font-size:1.6em;font-weight:700;color:' + health.color + ';">' + health.grade + '</span>';
    html += '<span style="color:' + health.color + ';font-weight:600;">' + health.score + '/100</span>';
    html += '<span class="meta" style="margin-left:0.3rem;">across ' + (data.tablesScanned || 0) + ' tables</span>';
    html += '</div>';
    if (anomalies.length === 0) {
      html += '<p class="meta" style="color:#7cb342;">No anomalies detected. Data looks clean!</p>';
      return html;
    }
    // Breakdown: count by severity
    var errCount = 0, warnCount = 0, infoCount = 0;
    anomalies.forEach(function(a) {
      if (a.severity === 'error') errCount++;
      else if (a.severity === 'warning') warnCount++;
      else infoCount++;
    });
    var breakdown = [];
    if (errCount) breakdown.push('<span style="color:#e57373;">' + errCount + ' error' + (errCount > 1 ? 's' : '') + '</span>');
    if (warnCount) breakdown.push('<span style="color:#ffb74d;">' + warnCount + ' warning' + (warnCount > 1 ? 's' : '') + '</span>');
    if (infoCount) breakdown.push('<span style="color:#7cb342;">' + infoCount + ' info</span>');
    html += '<p class="meta">' + anomalies.length + ' finding(s): ' + breakdown.join(', ') + '</p>';
    var icons = { error: '!!', warning: '!', info: 'i' };
    var colors = { error: '#e57373', warning: '#ffb74d', info: '#7cb342' };
    anomalies.forEach(function(a) {
      var color = colors[a.severity] || 'var(--fg)';
      var icon = icons[a.severity] || '';
      html += '<div style="padding:0.3rem 0.5rem;margin:0.2rem 0;border-left:3px solid ' + color + ';background:rgba(0,0,0,0.1);">';
      html += '<span style="color:' + color + ';font-weight:bold;">[' + icon + '] ' + esc(a.severity).toUpperCase() + '</span> ';
      html += esc(a.message);
      if (a.count) html += ' <span class="meta">(' + a.count + ')</span>';
      html += '</div>';
    });
    return html;
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (historySel) {
    populateHistorySelect(historySel, 'anomaly');
    historySel.addEventListener('change', function() {
      var id = this.value;
      if (!id) return;
      var saved = getSavedAnalysisById('anomaly', id);
      if (saved && saved.data) {
        lastAnomalyData = saved.data;
        container.innerHTML = renderAnomalyData(saved.data);
        container.style.display = 'block';
      }
    });
  }

  if (btn) btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, 'Scanning\u2026');
    container.style.display = 'none';
    fetch('/api/analytics/anomalies', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
        return r.json();
      })
      .then(function(data) {
        lastAnomalyData = data;
        container.innerHTML = renderAnomalyData(data);
        container.style.display = 'block';
        populateHistorySelect(historySel, 'anomaly');
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, 'Scan for anomalies');
      });
  });

  if (saveBtn) saveBtn.addEventListener('click', function() {
    if (!lastAnomalyData) return;
    var id = saveAnalysis('anomaly', lastAnomalyData);
    showCopyToast(id != null ? 'Saved' : 'Save failed (storage may be full)');
    populateHistorySelect(historySel, 'anomaly');
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!lastAnomalyData) return;
    downloadJSON(lastAnomalyData, 'anomaly-scan-' + (new Date().toISOString().slice(0, 10)) + '.json');
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    showAnalysisCompare('anomaly', 'Data health', getSavedAnalyses('anomaly'), lastAnomalyData, renderAnomalyData, function(a, b) {
      var na = (a && a.anomalies) ? a.anomalies.length : 0;
      var nb = (b && b.anomalies) ? b.anomalies.length : 0;
      return 'Before: ' + na + ' finding(s) · After: ' + nb + ' finding(s)';
    });
  });
}
