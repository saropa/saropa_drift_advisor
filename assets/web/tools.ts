/**
 * Tool panel init functions: snapshot, compare, migration preview,
 * index suggestions, size analytics, anomaly detection, import.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, highlightSqlSafe, syncFeatureCardExpanded } from './utils.ts';
import { populateHistorySelect, getSavedAnalyses, getSavedAnalysisById, saveAnalysis, downloadJSON, showAnalysisCompare, renderRowDiff } from './analysis.ts';
import { showCopyToast } from './table-view.ts';
import { openTableTab } from './tabs.ts';
import { loadTable } from './table-list.ts';

export function initSnapshot(): void {
  const toggle = document.getElementById('snapshot-toggle');
  const collapsible = document.getElementById('snapshot-collapsible');
  const takeBtn = document.getElementById('snapshot-take');
  const compareBtn = document.getElementById('snapshot-compare');
  const exportLink = document.getElementById('snapshot-export-diff');
  const clearBtn = document.getElementById('snapshot-clear');
  const statusEl = document.getElementById('snapshot-status');
  const resultPre = document.getElementById('snapshot-compare-result');
  // resultPre is a div: holds HTML table (from renderRowDiff) or plain text (JSON fallback)
  function updateSnapshotUI(hasSnapshot: any, createdAt?: any) {
    compareBtn.disabled = !hasSnapshot;
    exportLink.style.display = hasSnapshot ? '' : 'none';
    clearBtn.style.display = hasSnapshot ? '' : 'none';
    if (exportLink.style.display !== 'none' && S.DRIFT_VIEWER_AUTH_TOKEN) {
      exportLink.href = '/api/snapshot/compare?detail=rows&format=download';
    } else if (hasSnapshot) exportLink.href = '/api/snapshot/compare?detail=rows&format=download';
    statusEl.textContent = hasSnapshot ? ('Snapshot: ' + (createdAt || '')) : 'No snapshot.';
  }
  function refreshSnapshotStatus() {
    fetch('/api/snapshot', S.authOpts()).then(r => r.json()).then(function(data) {
      const snap = data.snapshot;
      updateSnapshotUI(!!snap, snap ? snap.createdAt : null);
    }).catch(function() { updateSnapshotUI(false); });
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
      if (isCollapsed) refreshSnapshotStatus();
    });
  }

  if (takeBtn) takeBtn.addEventListener('click', function() {
    takeBtn.disabled = true;
    statusEl.textContent = 'Capturing…';
    fetch('/api/snapshot', S.authOpts({ method: 'POST' }))
      .then(r => r.json().then(function(d) { return { ok: r.ok, data: d }; }))
      .then(function(o) {
        if (o.ok) {
          updateSnapshotUI(true, o.data.createdAt);
          statusEl.textContent = 'Snapshot saved at ' + o.data.createdAt;
        } else statusEl.textContent = o.data.error || 'Failed';
      })
      .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
      .finally(function() { takeBtn.disabled = false; });
  });
  if (compareBtn) compareBtn.addEventListener('click', function() {
    compareBtn.disabled = true;
    resultPre.style.display = 'none';
    resultPre.innerHTML = '';
    statusEl.textContent = 'Comparing…';
    statusEl.setAttribute('aria-busy', 'true');
    fetch('/api/snapshot/compare?detail=rows', S.authOpts())
      .then(r => r.json().then(function(d) { return { ok: r.ok, data: d }; }))
      .then(function(o) {
        if (o.ok) {
          if (o.data.tables) {
            renderRowDiff(resultPre, o.data.tables);
          } else {
            resultPre.textContent = JSON.stringify(o.data, null, 2);
          }
          resultPre.style.display = 'block';
          statusEl.textContent = '';
        } else {
          statusEl.textContent = o.data.error || 'Compare failed';
        }
      })
      .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
      .finally(function() {
        compareBtn.disabled = false;
        statusEl.removeAttribute('aria-busy');
      });
  });
  if (clearBtn) clearBtn.addEventListener('click', function() {
    clearBtn.disabled = true;
    statusEl.textContent = 'Clearing…';
    fetch('/api/snapshot', S.authOpts({ method: 'DELETE' }))
      .then(function() {
        updateSnapshotUI(false);
        resultPre.style.display = 'none';
        resultPre.innerHTML = '';
        refreshSnapshotStatus();
      })
      .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
      .finally(function() { clearBtn.disabled = false; });
  });
  refreshSnapshotStatus();
}

export function initCompare(): void {
  const toggle = document.getElementById('compare-toggle');
  const collapsible = document.getElementById('compare-collapsible');
  const viewBtn = document.getElementById('compare-view');
  const exportLink = document.getElementById('compare-export');
  const statusEl = document.getElementById('compare-status');
  const resultPre = document.getElementById('compare-result');
  if (S.DRIFT_VIEWER_AUTH_TOKEN && exportLink) {
    exportLink.href = '/api/compare/report?format=download';
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (viewBtn) viewBtn.addEventListener('click', function() {
    viewBtn.disabled = true;
    resultPre.style.display = 'none';
    statusEl.textContent = 'Loading…';
    fetch('/api/compare/report', S.authOpts())
      .then(r => r.json().then(function(d) { return { status: r.status, data: d }; }))
      .then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = 'Not configured. A comparison database is needed \u2014 see the setup guide above.';
        } else if (o.status >= 400) {
          statusEl.textContent = o.data.error || 'Request failed';
        } else {
          resultPre.textContent = JSON.stringify(o.data, null, 2);
          resultPre.style.display = 'block';
          statusEl.textContent = '';
        }
      })
      .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
      .finally(function() { viewBtn.disabled = false; });
  });
}

export function initMigrationPreview(): void {
  var btn = document.getElementById('migration-preview');
  var statusEl = document.getElementById('compare-status');
  var resultPre = document.getElementById('compare-result');
  if (!btn) return;
  btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, 'Generating…');
    resultPre.style.display = 'none';
    statusEl.textContent = '';
    fetch('/api/migration/preview', S.authOpts())
      .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
      .then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = 'Not configured. A comparison database is needed \u2014 see the setup guide above.';
       
   return;
        }
        if (o.status >= 400) {
          statusEl.textContent = o.data.error || 'Request failed';
       
   return;
        }
        var sql = o.data.migrationSql || '-- No changes detected.';
        var html = '<p class="meta">' + o.data.changeCount + ' statement(s) generated';
        if (o.data.hasWarnings) html += ' (includes warnings)';
        html += '</p>';
        html += '<pre style="font-size:11px;max-height:30vh;overflow:auto;background:var(--bg-pre);padding:0.5rem;border-radius:4px;">' + highlightSqlSafe(sql) + '</pre>';
        html += '<button type="button" id="migration-copy-sql" title="Copy migration SQL to clipboard">Copy SQL</button>';
        resultPre.innerHTML = html;
        resultPre.style.display = 'block';
        statusEl.textContent = '';
        var copyBtn = document.getElementById('migration-copy-sql');
        if (copyBtn) copyBtn.addEventListener('click', function() {
          navigator.clipboard.writeText(sql);
          this.textContent = 'Copied!';
        });
      })
      .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, 'Migration Preview');
      });
});
}

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
    freeCard: 'Bytes in pages on SQLite’s freelist (PRAGMA freelist_count × page_size). Unused pages inside the file that SQLite can reuse for new data without growing the file.',
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
