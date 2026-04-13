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
