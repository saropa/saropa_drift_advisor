/// Inline HTML shell for the single-page viewer UI.
///
/// CSS and JS are loaded from jsDelivr CDN (assets/web/style.css and app.js).
/// CDN URLs use [ServerConstants.packageVersion]; a matching git tag (e.g. v1.6.1)
/// must exist on the repo for the CDN to serve the assets.
import 'server_constants.dart';

abstract final class HtmlContent {
  static String get indexHtml => '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Saropa Drift Adviser</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cellipse cx='16' cy='8' rx='12' ry='5' fill='%23546e7a'/%3E%3Cpath d='M4 8v16c0 2.8 5.4 5 12 5s12-2.2 12-5V8' fill='none' stroke='%23546e7a' stroke-width='2'/%3E%3Cellipse cx='16' cy='24' rx='12' ry='5' fill='none' stroke='%23546e7a' stroke-width='2'/%3E%3Cellipse cx='16' cy='16' rx='12' ry='5' fill='none' stroke='%23546e7a' stroke-width='2'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/style.css">
</head>
<body>
  <!-- Connection-lost banner. Shown by JS when the server becomes unreachable.
       role="alert" ensures screen readers announce it immediately. -->
  <div id="connection-banner" role="alert" aria-live="polite">
    <span id="banner-message">Connection lost — reconnecting…</span>
    <button type="button" class="banner-dismiss" id="banner-dismiss" title="Dismiss banner">Dismiss</button>
  </div>
  <header class="app-header">
    <div class="app-header-brand">
      <h1 class="app-title">Saropa Drift Adviser</h1>
      <span id="version-badge" class="app-version meta" style="opacity:0;" title="Saropa Drift Advisor version"></span>
    </div>
    <div class="app-header-actions">
      <button type="button" id="theme-toggle" class="header-btn" title="Toggle light/dark"><span class="material-symbols-outlined header-icon" aria-hidden="true">dark_mode</span><span id="theme-toggle-label">Theme</span></button>
      <button type="button" id="share-btn" class="header-btn" title="Share current view with your team"><span class="material-symbols-outlined header-icon" aria-hidden="true">share</span>Share</button>
      <button type="button" id="polling-toggle" class="header-pill" title="Toggle database polling on/off">Polling: ON</button>
      <span id="live-indicator" class="header-pill live" title="Table view updates when data changes">● Live</span>
    </div>
  </header>
  <div class="app-layout">
    <aside class="app-sidebar">
      <div class="sidebar-section">
        <h2 class="sidebar-section-title">Search</h2>
      <div class="search-bar">
        <label for="search-input">Search:</label>
        <input type="text" id="search-input" placeholder="Search…" />
        <label for="search-scope">in</label>
        <select id="search-scope">
          <option value="schema">Schema only</option>
          <option value="data">DB data only</option>
          <option value="both">Both</option>
        </select>
        <span id="search-nav" class="search-nav" style="display:none;">
          <button type="button" id="search-prev" title="Previous match (Shift+Enter)">&#9650; Prev</button>
          <span id="search-count"></span>
          <button type="button" id="search-next" title="Next match (Enter)">Next &#9660;</button>
        </span>
        <label for="row-filter">Filter rows:</label>
        <input type="text" id="row-filter" placeholder="Column value…" title="Client-side filter on current table" />
      </div>
      </div>
      <div class="sidebar-section">
        <h2 class="sidebar-section-title">Export</h2>
      <div class="export-toolbar">
        <span class="export-toolbar-label">Export:</span>
        <a href="/api/schema" id="export-schema" class="export-link" download="schema.sql"><span class="material-symbols-outlined export-icon" aria-hidden="true">code</span>Schema</a>
        <a href="#" id="export-dump" class="export-link"><span class="material-symbols-outlined export-icon" aria-hidden="true">download</span>Full dump</a><span id="export-dump-status" class="meta"></span>
        <a href="#" id="export-database" class="export-link"><span class="material-symbols-outlined export-icon" aria-hidden="true">storage</span>Database</a><span id="export-database-status" class="meta"></span>
        <a href="#" id="export-csv" class="export-link"><span class="material-symbols-outlined export-icon" aria-hidden="true">table_chart</span>Table CSV</a><span id="export-csv-status" class="meta"></span>
      </div>
      </div>
      <p id="tables-loading" class="meta">Loading tables…</p>
      <div class="sidebar-section">
        <h2 class="sidebar-section-title">Tools</h2>
      <div class="feature-card">
        <div class="collapsible-header" id="snapshot-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">photo_camera</span><span class="collapsible-title">Snapshot / time travel</span></div>
        <div id="snapshot-collapsible" class="collapsible-body collapsed">
        <p class="meta">Capture current DB state, then compare to now to see what changed.</p>
        <div class="toolbar">
          <button type="button" id="snapshot-take" class="btn-primary">Take snapshot</button>
          <button type="button" id="snapshot-compare" disabled title="Take a snapshot first">Compare to now</button>
          <a href="#" id="snapshot-export-diff" class="export-link" style="display: none;">Export diff (JSON)</a>
          <button type="button" id="snapshot-clear" style="display: none;">Clear snapshot</button>
        </div>
        <p id="snapshot-status" class="meta"></p>
        <pre id="snapshot-compare-result" class="meta diff-result" style="display: none; max-height: 40vh;"></pre>
        </div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="compare-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">compare_arrows</span><span class="collapsible-title">Database diff</span></div>
        <div id="compare-collapsible" class="collapsible-body collapsed">
        <p class="meta">Compare this DB with another (e.g. staging). Requires queryCompare at startup.</p>
        <div class="toolbar">
          <button type="button" id="compare-view">View diff report</button>
          <a href="/api/compare/report?format=download" id="compare-export">Export diff report</a>
          <button type="button" id="migration-preview">Migration Preview</button>
        </div>
        <p id="compare-status" class="meta"></p>
        <pre id="compare-result" class="meta diff-result" style="display: none; max-height: 40vh;"></pre>
        </div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="index-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">format_list_bulleted</span><span class="collapsible-title">Index suggestions</span></div>
        <div id="index-collapsible" class="collapsible-body collapsed">
        <p class="meta">Analyze tables for missing indexes based on schema patterns.</p>
        <div class="toolbar">
          <button type="button" id="index-analyze" class="btn-primary">Analyze</button>
          <button type="button" id="index-save" title="Save this result for later">Save result</button>
          <button type="button" id="index-export" title="Download result as JSON">Export as JSON</button>
          <label for="index-history">History:</label>
          <select id="index-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="index-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="index-results" style="display:none;"></div>
        </div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="size-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">bar_chart</span><span class="collapsible-title">Database size analytics</span></div>
        <div id="size-collapsible" class="collapsible-body collapsed">
        <p class="meta">Analyze database storage: total size, page stats, and per-table breakdown.</p>
        <div class="toolbar">
          <button type="button" id="size-analyze" class="btn-primary">Analyze</button>
          <button type="button" id="size-save" title="Save this result for later">Save result</button>
          <button type="button" id="size-export" title="Download result as JSON">Export as JSON</button>
          <label for="size-history">History:</label>
          <select id="size-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="size-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="size-results" style="display:none;"></div>
        </div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="perf-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">speed</span><span class="collapsible-title">Query performance</span></div>
        <div id="perf-collapsible" class="collapsible-body collapsed">
        <p class="meta">Track query execution times, identify slow queries, and view patterns.</p>
        <div class="toolbar">
          <button type="button" id="perf-refresh">Refresh</button>
          <button type="button" id="perf-clear">Clear</button>
          <button type="button" id="perf-save" title="Save this result for later">Save result</button>
          <button type="button" id="perf-export" title="Download result as JSON">Export as JSON</button>
          <label for="perf-history">History:</label>
          <select id="perf-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="perf-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="perf-results" style="display:none;"></div>
        </div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="anomaly-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">favorite</span><span class="collapsible-title">Data health</span></div>
        <div id="anomaly-collapsible" class="collapsible-body collapsed">
        <p class="meta">Scan all tables for data quality issues: NULLs, empty strings, orphaned FKs, duplicates, outliers.</p>
        <div class="toolbar">
          <button type="button" id="anomaly-analyze" class="btn-primary">Scan for anomalies</button>
          <button type="button" id="anomaly-save" title="Save this result for later">Save result</button>
          <button type="button" id="anomaly-export" title="Download result as JSON">Export as JSON</button>
          <label for="anomaly-history">History:</label>
          <select id="anomaly-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="anomaly-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="anomaly-results" style="display:none;"></div>
        </div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="import-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">upload</span><span class="collapsible-title">Import data (debug only)</span></div>
        <div id="import-collapsible" class="collapsible-body collapsed">
        <p class="meta import-warning">Warning: This modifies the database. Debug use only.</p>
        <div class="sql-runner">
          <div class="sql-toolbar">
            <label>Table:</label>
            <select id="import-table"></select>
            <label>Format:</label>
            <select id="import-format">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="sql">SQL</option>
            </select>
          </div>
          <div class="sql-toolbar" style="margin-top:0.25rem;">
            <input type="file" id="import-file" accept=".json,.csv,.sql" />
            <button type="button" id="import-run" disabled class="btn-primary">Import</button>
          </div>
        </div>
        <div id="import-column-mapping" class="meta" style="display:none;margin-top:0.5rem;">
          <p class="meta" style="font-weight:bold;">Map CSV columns to table columns</p>
          <table id="import-mapping-table" style="border-collapse:collapse;font-size:12px;width:100%;max-width:500px;">
            <thead><tr><th style="border:1px solid var(--border);padding:4px;">CSV column</th><th style="border:1px solid var(--border);padding:4px;">→ Table column</th></tr></thead>
            <tbody id="import-mapping-tbody"></tbody>
          </table>
        </div>
        <pre id="import-preview" class="meta" style="display:none;max-height:15vh;overflow:auto;font-size:11px;"></pre>
        <p id="import-status" class="meta"></p>
        </div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="schema-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">grid_on</span><span class="collapsible-title">Schema</span></div>
        <div id="schema-collapsible" class="collapsible-body collapsed"><pre id="schema-inline-pre" class="meta">Loading…</pre></div>
      </div>
      <div class="feature-card">
        <div class="collapsible-header" id="diagram-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">account_tree</span><span class="collapsible-title">Schema diagram</span></div>
        <div id="diagram-collapsible" class="collapsible-body collapsed">
        <p class="meta">Tables and relationships. Click or press Enter on a table to view its data. Use arrow keys to navigate between tables.</p>
        <div id="diagram-container"></div>
        <div id="diagram-text-alt" class="sr-only"></div>
        </div>
      </div>
      </div>
      <div class="sidebar-section">
      <h2 class="tables-heading">Tables</h2>
      <ul id="tables" class="table-list"></ul>
      </div>
    </aside>
    <div class="app-main-content">
      <div class="feature-card sql-runner-card">
  <div class="collapsible-header sql-runner" id="sql-runner-toggle"><span class="material-symbols-outlined feature-icon" aria-hidden="true">play_arrow</span><span class="collapsible-title">Run SQL (read-only)</span></div>
  <div id="sql-runner-collapsible" class="collapsible-body collapsed sql-runner">
    <div class="sql-toolbar">
      <label for="sql-template">Template:</label>
      <select id="sql-template">
        <option value="custom">Custom</option>
        <option value="select-star-limit">SELECT * FROM table LIMIT 10</option>
        <option value="select-star">SELECT * FROM table</option>
        <option value="count">SELECT COUNT(*) FROM table</option>
        <option value="select-fields">SELECT columns FROM table LIMIT 10</option>
      </select>
      <label for="sql-table">Table:</label>
      <select id="sql-table"><option value="">—</option></select>
      <label for="sql-fields">Fields:</label>
      <select id="sql-fields" multiple title="Hold Ctrl/Cmd to pick multiple"><option value="">—</option></select>
      <button type="button" id="sql-apply-template">Apply template</button>
      <button type="button" id="sql-run" class="btn-primary">Run</button>
      <button type="button" id="sql-explain">Explain</button>
      <label for="sql-history">History:</label>
      <select id="sql-history" title="Recent queries — select to reuse"><option value="">— Recent —</option></select>
    </div>
    <div class="sql-toolbar" style="margin-top:0;">
      <label for="sql-bookmarks">Bookmarks:</label>
      <select id="sql-bookmarks" title="Saved queries" style="max-width:14rem;"><option value="">— Bookmarks —</option></select>
      <button type="button" id="sql-bookmark-save" title="Save current query as bookmark">Save</button>
      <button type="button" id="sql-bookmark-delete" title="Delete selected bookmark">Del</button>
      <button type="button" id="sql-bookmark-export" title="Export bookmarks as JSON">Export</button>
      <button type="button" id="sql-bookmark-import" title="Import bookmarks from JSON">Import</button>
      <label for="sql-result-format">Show as:</label>
      <select id="sql-result-format"><option value="table">Table</option><option value="json">JSON</option></select>
    </div>
    <div class="sql-toolbar" style="margin-bottom:0.35rem;">
      <label for="nl-input">Ask in English:</label>
      <input type="text" id="nl-input" placeholder="e.g. how many users were created today?" style="flex:1;min-width:20rem;" />
      <button type="button" id="nl-convert">Convert to SQL</button>
    </div>
    <textarea id="sql-input" placeholder="SELECT * FROM my_table LIMIT 10"></textarea>
    <div id="sql-error" class="sql-error" style="display: none;"></div>
    <div id="sql-result" class="sql-result" style="display: none;"></div>
    <div id="chart-controls" class="sql-toolbar" style="display:none;margin-top:0.5rem;">
      <label for="chart-type">Chart:</label>
      <select id="chart-type">
        <option value="none">None</option>
        <option value="bar">Bar</option>
        <option value="pie">Pie</option>
        <option value="line">Line / Time series</option>
        <option value="histogram">Histogram</option>
      </select>
      <label for="chart-x">X / Label:</label>
      <select id="chart-x"></select>
      <label for="chart-y">Y / Value:</label>
      <select id="chart-y"></select>
      <button type="button" id="chart-render">Render</button>
    </div>
    <div id="chart-container" style="display:none;margin-top:0.5rem;"></div>
  </div>
  </div>
  <div id="pagination-bar" class="toolbar" style="display: none;">
    <label>Limit</label>
    <select id="pagination-limit"></select>
    <label>Offset</label>
    <input type="number" id="pagination-offset" min="0" step="200" style="width: 5rem;" />
    <button type="button" id="pagination-prev">Prev</button>
    <button type="button" id="pagination-next">Next</button>
    <button type="button" id="pagination-apply">Apply</button>
    <button type="button" id="clear-table-state" title="Reset cached filter/pagination state for this table">Clear state</button>
  </div>
  <div id="display-format-bar" class="toolbar" style="display:none;">
    <label>Display:</label>
    <select id="display-format-toggle">
      <option value="raw">Raw</option>
      <option value="formatted">Formatted</option>
    </select>
    <button type="button" id="column-chooser-btn" title="Show/hide columns, reorder, pin">Columns</button>
  </div>
  <div id="content" class="content-wrap"></div>
    </div>
  </div>
  <div id="column-context-menu" role="menu" aria-hidden="true">
    <button type="button" data-action="hide" role="menuitem">Hide column</button>
    <button type="button" data-action="pin" role="menuitem">Pin column</button>
    <button type="button" data-action="unpin" role="menuitem">Unpin column</button>
  </div>
  <div id="column-chooser" aria-label="Column chooser" aria-modal="true" aria-hidden="true">
    <h3>Columns</h3>
    <ul id="column-chooser-list" class="column-chooser-list"></ul>
    <div class="column-chooser-actions">
      <button type="button" id="column-chooser-reset">Reset to default</button>
      <button type="button" id="column-chooser-close">Close</button>
    </div>
  </div>
  <div id="copy-toast" class="copy-toast">Copied!</div>

  <script src="https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/app.js"></script>
</body></html>
''';
}
