/**
 * Comparison tool panel init functions: snapshot, compare, migration preview.
 *
 * Split from tools.ts for modularity — each tool group gets its own file.
 * These three tools share a common pattern: fetch from /api, render results,
 * and support export links.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, highlightSqlSafe, syncFeatureCardExpanded } from './utils.ts';
import { renderRowDiff } from './analysis.ts';

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

  // Latest list fetched from /api/snapshots; drives the picker + list rendering.
  var snapshotItems: any[] = [];

  // The list + from/to selectors are injected here so the static HTML template
  // (html_content.dart) needs no change. Created once, reused across refreshes.
  function listHost(): any {
    var host = document.getElementById('snapshot-list');
    if (!host && statusEl && statusEl.parentNode) {
      host = document.createElement('div');
      host.id = 'snapshot-list';
      host.style.margin = '0.5rem 0';
      statusEl.parentNode.insertBefore(host, resultPre || null);
    }
    return host;
  }

  function fmtSnapshotLabel(s: any): string {
    var when = s.createdAt || s.id || '';
    return (s.label ? (s.label + ' — ') : '') + when;
  }

  // `to` selector includes "now (live DB)" (empty value) so the legacy
  // snapshot-vs-current comparison is still one click; `from` lists snapshots.
  function buildExportHref(): string {
    var from = (document.getElementById('snapshot-from') as any);
    var to = (document.getElementById('snapshot-to') as any);
    var qs = 'detail=rows&format=download';
    if (from && from.value) qs += '&from=' + encodeURIComponent(from.value);
    if (to && to.value) qs += '&to=' + encodeURIComponent(to.value);
    return '/api/snapshot/compare?' + qs;
  }

  function renderSnapshotList() {
    var host = listHost();
    if (!host) return;
    var has = snapshotItems.length > 0;
    compareBtn.disabled = !has;
    exportLink.style.display = has ? '' : 'none';
    clearBtn.style.display = has ? '' : 'none';
    if (has) exportLink.href = buildExportHref();

    if (!has) {
      host.innerHTML = '<p class="meta">No snapshots yet. Capture one to start comparing.</p>';
      return;
    }

    var html = '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:0.4rem;">';
    html += '<label class="meta">From <select id="snapshot-from">';
    snapshotItems.forEach(function(s) {
      html += '<option value="' + esc(s.id) + '">' + esc(fmtSnapshotLabel(s)) + '</option>';
    });
    html += '</select></label>';
    html += '<label class="meta">To <select id="snapshot-to"><option value="">now (live DB)</option>';
    snapshotItems.forEach(function(s) {
      html += '<option value="' + esc(s.id) + '">' + esc(fmtSnapshotLabel(s)) + '</option>';
    });
    html += '</select></label>';
    html += '</div>';

    html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
    html += '<tr><th style="border:1px solid var(--border);padding:4px;text-align:left;">Snapshot</th><th style="border:1px solid var(--border);padding:4px;">Tables</th><th style="border:1px solid var(--border);padding:4px;">Actions</th></tr>';
    snapshotItems.forEach(function(s) {
      html += '<tr>';
      html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(fmtSnapshotLabel(s)) + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;">' + (s.tableCount != null ? s.tableCount : '') + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;">';
      html += '<button class="btn snapshot-rename" data-id="' + esc(s.id) + '">Rename</button> ';
      html += '<button class="btn snapshot-del" data-id="' + esc(s.id) + '">Delete</button>';
      html += '</td></tr>';
    });
    html += '</table>';
    host.innerHTML = html;

    // Default the From selector to the most recent snapshot for a sensible
    // "latest vs now" out of the box (matches the old single-snapshot default).
    var fromSel = document.getElementById('snapshot-from') as any;
    if (fromSel && snapshotItems.length) fromSel.value = snapshotItems[snapshotItems.length - 1].id;
    var toSel = document.getElementById('snapshot-to') as any;
    if (toSel) toSel.addEventListener('change', function() { exportLink.href = buildExportHref(); });
    if (fromSel) fromSel.addEventListener('change', function() { exportLink.href = buildExportHref(); });
  }

  function refreshSnapshotList() {
    fetch('/api/snapshots', S.authOpts())
      .then(r => r.json())
      .then(function(data) {
        snapshotItems = (data && data.snapshots) || [];
        renderSnapshotList();
      })
      .catch(function() { snapshotItems = []; renderSnapshotList(); });
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
      if (isCollapsed) refreshSnapshotList();
    });
  }

  if (takeBtn) takeBtn.addEventListener('click', function() {
    var label = window.prompt('Optional label for this snapshot (leave blank for none):') || '';
    takeBtn.disabled = true;
    statusEl.textContent = 'Capturing…';
    fetch('/api/snapshot', S.authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim() }),
    }))
      .then(r => r.json().then(function(d) { return { ok: r.ok, data: d }; }))
      .then(function(o) {
        if (o.ok) {
          statusEl.textContent = 'Snapshot saved at ' + o.data.createdAt;
          refreshSnapshotList();
        } else statusEl.textContent = o.data.error || 'Failed';
      })
      .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
      .finally(function() { takeBtn.disabled = false; });
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    var from = (document.getElementById('snapshot-from') as any);
    var to = (document.getElementById('snapshot-to') as any);
    var qs = 'detail=rows';
    if (from && from.value) qs += '&from=' + encodeURIComponent(from.value);
    if (to && to.value) qs += '&to=' + encodeURIComponent(to.value);
    compareBtn.disabled = true;
    resultPre.style.display = 'none';
    resultPre.innerHTML = '';
    statusEl.textContent = 'Comparing…';
    statusEl.setAttribute('aria-busy', 'true');
    fetch('/api/snapshot/compare?' + qs, S.authOpts())
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
    if (!window.confirm('Delete ALL snapshots?')) return;
    clearBtn.disabled = true;
    statusEl.textContent = 'Clearing…';
    fetch('/api/snapshot', S.authOpts({ method: 'DELETE' }))
      .then(function() {
        resultPre.style.display = 'none';
        resultPre.innerHTML = '';
        statusEl.textContent = 'All snapshots cleared.';
        refreshSnapshotList();
      })
      .catch(function(e) { statusEl.textContent = 'Error: ' + e.message; })
      .finally(function() { clearBtn.disabled = false; });
  });

  // Delegated rename/delete on the dynamically-rendered list (survives re-render).
  var host = listHost();
  if (host) {
    host.addEventListener('click', function(e: any) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var id = t.getAttribute('data-id');
      if (!id) return;
      if (t.classList.contains('snapshot-del')) {
        if (!window.confirm('Delete this snapshot?')) return;
        fetch('/api/snapshot/' + encodeURIComponent(id), S.authOpts({ method: 'DELETE' }))
          .then(function() { refreshSnapshotList(); })
          .catch(function(err) { statusEl.textContent = 'Error: ' + err.message; });
      } else if (t.classList.contains('snapshot-rename')) {
        var label = window.prompt('New label (leave blank to clear):') || '';
        fetch('/api/snapshot/' + encodeURIComponent(id), S.authOpts({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label.trim() }),
        }))
          .then(function() { refreshSnapshotList(); })
          .catch(function(err) { statusEl.textContent = 'Error: ' + err.message; });
      }
    });
  }

  refreshSnapshotList();
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
