/// Inline HTML shell for the single-page viewer UI.
///
/// ## Static assets (CSS / JS)
///
/// The shell references same-origin paths `/assets/web/style.css` and
/// `/assets/web/app.js`, which the debug server streams from the package
/// (`generation_handler.dart`: `sendWebStyle` / `sendWebApp`). If those
/// requests fail (404 or network error), each tag uses `onerror` to switch
/// to a version-pinned jsDelivr URL so the UI still loads without embedding
/// CSS/JS duplicates in consumer binaries.
///
/// ## UX notes
///
/// The script tag uses `defer` so parsing is not blocked by large `app.js`;
/// this reduces "layout forced before load" warnings when combined with
/// stylesheets that load before body content.
///
/// Buttons and collapsible headers include [title] attributes for hover tooltips.
import 'server_constants.dart';

abstract final class HtmlContent {
  static String get indexHtml =>
      '''
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
  <!-- Favicon: inline SVG database cylinder matching extension store icon (purple-pink to cyan gradient). -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='cyl' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23cd87cd'/%3E%3Cstop offset='50%25' stop-color='%239e8eda'/%3E%3Cstop offset='100%25' stop-color='%235ac6e4'/%3E%3C/linearGradient%3E%3CradialGradient id='cap' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='%23e8c6e8'/%3E%3Cstop offset='100%25' stop-color='%23cd87cd'/%3E%3C/radialGradient%3E%3ClinearGradient id='bot' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%235ac6e4'/%3E%3Cstop offset='100%25' stop-color='%234dbdd8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='7' y='6' width='18' height='16' fill='url(%23cyl)'/%3E%3Cellipse cx='16' cy='6' rx='9' ry='2' fill='url(%23cap)' stroke='%235f3773' stroke-width='0.6'/%3E%3Cpath d='M7 6v16' fill='none' stroke='%235f3773' stroke-width='0.6'/%3E%3Cpath d='M25 6v16' fill='none' stroke='%235f3773' stroke-width='0.6'/%3E%3Cellipse cx='16' cy='14' rx='9' ry='1.2' fill='none' stroke='%235f3773' stroke-width='0.6'/%3E%3Cellipse cx='16' cy='22' rx='9' ry='2' fill='url(%23bot)' stroke='%235f3773' stroke-width='0.6'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="/assets/web/style.css" onerror="this.onerror=null;this.href='https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/style.css';">
</head>
<body>
  <!-- Connection-lost banner. Shown by JS when the server becomes unreachable.
       role="alert" ensures screen readers announce it immediately.
       Message, diagnostics (interval/next retry), Retry now, and Dismiss. -->
  <div id="connection-banner" role="alert" aria-live="polite">
    <div class="banner-text">
      <span id="banner-message">Connection lost — reconnecting…</span>
      <span id="banner-diagnostics" class="banner-diagnostics" aria-live="polite"></span>
    </div>
    <div class="banner-actions">
      <button type="button" class="banner-btn banner-retry" id="banner-retry" title="Try to reconnect now">Retry now</button>
      <button type="button" class="banner-dismiss banner-btn" id="banner-dismiss" title="Dismiss banner">Dismiss</button>
    </div>
  </div>
  <header class="app-header">
    <div class="app-header-brand">
      <h1 class="app-title">Saropa Drift Adviser</h1>
      <!-- Version badge links to VS Code Marketplace changelog; text filled by JS from /api/health. -->
      <a id="version-badge" class="app-version meta" style="opacity:0;" href="https://marketplace.visualstudio.com/items/Saropa.drift-viewer/changelog" target="_blank" rel="noopener noreferrer" title="View changelog"> </a>
    </div>
    <div class="app-header-actions">
      <button type="button" id="theme-toggle" class="header-btn" title="Toggle light/dark"><span class="material-symbols-outlined header-icon" aria-hidden="true">dark_mode</span><span id="theme-toggle-label">Theme</span></button>
      <button type="button" id="share-btn" class="header-btn" title="Share current view with your team"><span class="material-symbols-outlined header-icon" aria-hidden="true">share</span>Share</button>
      <label class="header-mask-toggle" title="When on, PII columns (e.g. email, phone) are masked in table view and exports">
        <input type="checkbox" id="pii-mask-toggle" aria-label="Mask sensitive data" />
        <span class="material-symbols-outlined header-icon" aria-hidden="true">visibility_off</span>
        <span id="pii-mask-label">Mask data</span>
      </label>
      <button type="button" id="live-indicator" class="header-pill connection-status" title="Connection status. When live, click to pause; when paused, click to resume." aria-live="polite">● Live</button>
    </div>
  </header>
  <div class="app-layout">
    <aside class="app-sidebar">
      <!-- Search options: collapsed by default; toolbar Search button toggles visibility. -->
      <div id="sidebar-search-wrap" class="sidebar-section search-options-wrap collapsed" aria-hidden="true">
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
        <div id="row-display-toggle-wrap" class="row-display-toggle" style="display:none;">
          <span class="row-display-label">Show:</span>
          <button type="button" id="row-display-all" class="row-display-btn" title="Show all rows">All rows</button>
          <button type="button" id="row-display-matching" class="row-display-btn active" title="Show only rows matching filter">Matching</button>
        </div>
      </div>
      </div>
      <div class="sidebar-section">
        <p class="meta" style="margin:0 0 0.5rem 0;">Export schema, dumps, and table data from the <strong>Export</strong> tab (toolbar button above).</p>
      </div>
      <p id="tables-loading" class="meta">Loading tables…</p>
      <div id="sidebar-tables-wrap" class="sidebar-section sidebar-tables-wrap">
      <h2 class="tables-heading"><button type="button" id="tables-heading-toggle" aria-expanded="true" title="Click to collapse/expand table list">Tables</button></h2>
      <ul id="tables" class="table-list"></ul>
      </div>
    </aside>
    <div class="app-main-content">
      <!-- Tools toolbar: each button has data-tool so openTool() switches to that tab. Tables and Search use fixed tabs; others get dynamic tabs with close button. -->
      <div id="tools-toolbar" class="tools-toolbar" role="toolbar" aria-label="Tools">
        <button type="button" class="toolbar-tool-btn" data-tool="tables" title="Open Tables view"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">table_chart</span><span class="toolbar-tool-label">Tables</span></button>
        <button type="button" id="search-toggle-btn" class="toolbar-tool-btn" data-tool="search" title="Open Search tab and show search options"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">search</span><span class="toolbar-tool-label">Search</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="snapshot" title="Snapshot / time travel"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">photo_camera</span><span class="toolbar-tool-label">Snapshot</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="compare" title="Database diff"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">compare_arrows</span><span class="toolbar-tool-label">DB diff</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="index" title="Index suggestions"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">format_list_bulleted</span><span class="toolbar-tool-label">Index</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="size" title="Database size analytics"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">bar_chart</span><span class="toolbar-tool-label">Size</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="perf" title="Query performance"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">speed</span><span class="toolbar-tool-label">Perf</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="anomaly" title="Data health"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">favorite</span><span class="toolbar-tool-label">Health</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="import" title="Import data (debug only)"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">upload</span><span class="toolbar-tool-label">Import</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="schema" title="Schema"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">grid_on</span><span class="toolbar-tool-label">Schema</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="diagram" title="Schema diagram"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">account_tree</span><span class="toolbar-tool-label">Diagram</span></button>
        <button type="button" class="toolbar-tool-btn" data-tool="export" title="Export schema, data, or database"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">download</span><span class="toolbar-tool-label">Export</span></button>
      </div>
      <div id="tab-bar" class="tab-bar" role="tablist" aria-label="Views">
        <button type="button" class="tab-btn active" data-tab="tables" role="tab" aria-selected="true" aria-controls="panel-tables" id="tab-tables">Tables</button>
        <button type="button" class="tab-btn" data-tab="search" role="tab" aria-selected="false" aria-controls="panel-search" id="tab-search">Search</button>
        <button type="button" class="tab-btn" data-tab="sql" role="tab" aria-selected="false" aria-controls="panel-sql" id="tab-sql">Run SQL</button>
      </div>
      <div id="tab-panels" class="tab-panels">
        <div id="panel-tables" class="tab-panel active" role="tabpanel" aria-labelledby="tab-tables">
      <!-- Browse-all table list: shown when the "Tables" tab is active (no specific table selected).
           Populated dynamically by renderTablesBrowse() in app.js with clickable table cards. -->
      <div id="tables-browse" class="tables-browse"></div>
      <div id="pagination-bar" class="toolbar pagination-toolbar" style="display: none;" role="navigation" aria-label="Table pagination">
        <label for="pagination-limit">Rows per page</label>
        <select id="pagination-limit" aria-label="Rows per page"></select>
        <span id="pagination-status" class="pagination-status" aria-live="polite"></span>
        <div class="pagination-nav" role="group" aria-label="Page navigation">
          <button type="button" id="pagination-first" title="First page" aria-label="First page">First</button>
          <button type="button" id="pagination-prev" title="Previous page" aria-label="Previous page">Prev</button>
          <span id="pagination-pages" class="pagination-pages" aria-label="Current page"></span>
          <button type="button" id="pagination-next" title="Next page" aria-label="Next page">Next</button>
          <button type="button" id="pagination-last" title="Last page" aria-label="Last page">Last</button>
        </div>
        <button type="button" id="pagination-advanced-toggle" class="pagination-advanced-toggle" title="Show raw offset (advanced)">Advanced</button>
        <div id="pagination-advanced" class="pagination-advanced collapsed" aria-hidden="true">
          <label for="pagination-offset">Offset</label>
          <input type="number" id="pagination-offset" min="0" step="1" aria-label="Row offset (advanced)" style="width: 5rem;" />
          <button type="button" id="pagination-apply" title="Apply offset and reload">Apply</button>
        </div>
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
        <div id="panel-search" class="tab-panel" role="tabpanel" aria-labelledby="tab-search" hidden>
          <!-- Self-contained search controls: table picker, search input, scope, filter, navigation -->
          <div class="search-tab-toolbar">
            <label for="st-table">Table:</label>
            <select id="st-table" aria-label="Select table to search"><option value="">-- select --</option></select>
            <label for="st-input">Search:</label>
            <input type="text" id="st-input" placeholder="Search…" />
            <label for="st-scope">in</label>
            <select id="st-scope" aria-label="Search scope">
              <option value="schema">Schema only</option>
              <option value="data">DB data only</option>
              <option value="both">Both</option>
            </select>
            <span id="st-nav" class="search-nav" style="display:none;">
              <button type="button" id="st-prev" title="Previous match (Shift+Enter)">&#9650; Prev</button>
              <span id="st-count"></span>
              <button type="button" id="st-next" title="Next match (Enter)">Next &#9660;</button>
            </span>
            <label for="st-filter">Filter rows:</label>
            <input type="text" id="st-filter" placeholder="Column value…" title="Client-side filter on current table" />
            <div id="st-row-toggle-wrap" class="row-display-toggle" style="display:none;">
              <span class="row-display-label">Show:</span>
              <button type="button" id="st-row-all" class="row-display-btn" title="Show all rows">All rows</button>
              <button type="button" id="st-row-matching" class="row-display-btn active" title="Show only rows matching filter">Matching</button>
            </div>
          </div>
          <div id="search-results-content" class="content-wrap search-results-content"></div>
        </div>
        <div id="panel-sql" class="tab-panel" role="tabpanel" aria-labelledby="tab-sql" hidden>
      <div class="feature-card sql-runner-card">
  <div class="collapsible-header sql-runner" id="sql-runner-toggle" title="Expand or collapse Run SQL"><span class="material-symbols-outlined feature-icon" aria-hidden="true">play_arrow</span><span class="collapsible-title">Run SQL (read-only)</span></div>
  <div id="sql-runner-collapsible" class="collapsible-body sql-runner">
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
      <button type="button" id="sql-apply-template" title="Insert template query into editor">Apply template</button>
      <button type="button" id="sql-run" class="btn-primary" title="Execute the SQL query">Run</button>
      <button type="button" id="sql-explain" title="Show query execution plan">Explain</button>
      <label for="sql-history">History:</label>
      <select id="sql-history" title="Recent queries — select to reuse"><option value="">— Recent —</option></select>
    </div>
    <div class="sql-toolbar" style="margin-top:0;">
      <label for="sql-bookmarks">Saved queries:</label>
      <select id="sql-bookmarks" title="Load a saved query" style="max-width:14rem;"><option value="">— Saved queries —</option></select>
      <button type="button" id="sql-bookmark-save" title="Save current query">Save</button>
      <button type="button" id="sql-bookmark-delete" title="Delete selected">Del</button>
      <button type="button" id="sql-bookmark-export" title="Export as JSON">Export</button>
      <button type="button" id="sql-bookmark-import" title="Import from JSON">Import</button>
      <label for="sql-result-format">Show as:</label>
      <select id="sql-result-format"><option value="table">Table</option><option value="json">JSON</option></select>
    </div>
    <div class="sql-toolbar nl-ask-toolbar" style="margin-bottom:0.35rem;">
      <button type="button" id="nl-open" title="Describe your question in plain English; preview SQL updates in the dialog as you type">Ask in English…</button>
    </div>
    <!-- NL question in a modal: live NL→SQL preview stays inside the dialog; Use copies into #sql-input. -->
    <div id="nl-modal" class="nl-modal" hidden aria-hidden="true">
      <div class="nl-modal-backdrop" id="nl-modal-backdrop" tabindex="-1"></div>
      <div class="nl-modal-panel" role="dialog" aria-modal="true" aria-labelledby="nl-modal-title" tabindex="-1">
        <h3 id="nl-modal-title" class="nl-modal-title">Ask in English</h3>
        <p class="meta nl-modal-hint">Preview updates as you type. Use copies the preview into the main SQL editor; Cancel or Escape closes without changing it.</p>
        <label for="nl-modal-input" class="nl-modal-label">Your question</label>
        <textarea id="nl-modal-input" class="nl-modal-input" rows="6" placeholder="e.g. how many users were created today?"></textarea>
        <label for="nl-modal-sql-preview" class="nl-modal-label">Generated SQL (preview)</label>
        <textarea id="nl-modal-sql-preview" class="nl-modal-sql-preview" readonly rows="5" aria-readonly="true" title="Live preview; not applied to the runner until you click Use"></textarea>
        <p id="nl-modal-error" class="sql-error nl-modal-error" style="display:none;" role="status"></p>
        <div class="nl-modal-actions">
          <button type="button" id="nl-use" class="btn-primary" title="Copy preview SQL into the main editor and close">Use</button>
          <button type="button" id="nl-cancel" title="Close without changing the main SQL editor">Cancel</button>
        </div>
      </div>
    </div>
    <textarea id="sql-input" placeholder="SELECT * FROM my_table LIMIT 10"></textarea>
    <div id="sql-error" class="sql-error" style="display: none;"></div>
    <div id="sql-result" class="sql-result" style="display: none;"></div>
    <div id="chart-controls" class="sql-toolbar" style="display:none;margin-top:0.5rem;">
      <label for="chart-type">Chart:</label>
      <select id="chart-type">
        <option value="none">None</option>
        <option value="bar">Bar</option>
        <option value="stacked-bar">Stacked bar</option>
        <option value="pie">Pie</option>
        <option value="line">Line / Time series</option>
        <option value="area">Area</option>
        <option value="scatter">Scatter</option>
        <option value="histogram">Histogram</option>
      </select>
      <label for="chart-x">X / Label:</label>
      <select id="chart-x"></select>
      <label for="chart-y">Y / Value:</label>
      <select id="chart-y"></select>
      <label for="chart-title-input">Title:</label>
      <input type="text" id="chart-title-input" placeholder="Chart title (optional)" title="Optional chart title" />
      <button type="button" id="chart-render" title="Draw chart from result set">Render</button>
    </div>
    <div id="chart-container" class="chart-container" style="display:none;margin-top:0.5rem;">
      <div id="chart-wrapper" class="chart-wrapper" aria-live="polite">
        <p id="chart-title" class="chart-title" style="display:none;"></p>
        <p id="chart-description" class="chart-description" style="display:none;"></p>
        <div id="chart-svg-wrap" class="chart-svg-wrap"></div>
        <div id="chart-export-toolbar" class="chart-export-toolbar" style="display:none;">
          <span class="chart-export-label">Export:</span>
          <button type="button" id="chart-export-png" title="Download chart as PNG">PNG</button>
          <button type="button" id="chart-export-svg" title="Download chart as SVG">SVG</button>
          <button type="button" id="chart-export-copy" title="Copy chart image to clipboard">Copy image</button>
        </div>
      </div>
    </div>
  </div>
  </div>
        </div>
        <!-- Tool panels: opened from toolbar; IDs preserved for JS. -->
        <div id="panel-snapshot" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-snapshot" hidden>
          <div id="snapshot-collapsible" class="tool-panel-body">
        <p class="meta">Capture current DB state, then compare to now to see what changed.</p>
        <div class="toolbar">
          <button type="button" id="snapshot-take" class="btn-primary" title="Capture current database state for later comparison">Take snapshot</button>
          <button type="button" id="snapshot-compare" disabled title="Take a snapshot first">Compare to now</button>
          <a href="#" id="snapshot-export-diff" class="export-link" style="display: none;" title="Download diff as JSON">Export diff (JSON)</a>
          <button type="button" id="snapshot-clear" style="display: none;" title="Discard saved snapshot">Clear snapshot</button>
        </div>
        <p id="snapshot-status" class="meta"></p>
        <div id="snapshot-compare-result" class="diff-result snapshot-compare-result-container" role="region" aria-label="Snapshot compare results" style="display: none;"></div>
          </div>
        </div>
        <div id="panel-compare" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-compare" hidden>
          <div id="compare-collapsible" class="tool-panel-body">
        <p class="meta">Compare this DB with another (e.g. staging). Requires queryCompare at startup.</p>
        <div class="toolbar">
          <button type="button" id="compare-view" title="Open full diff report in a new view">View diff report</button>
          <!-- Export opens in new tab so the current DB diff view stays open; rel=noopener noreferrer for security -->
          <a href="/api/compare/report?format=download" id="compare-export" target="_blank" rel="noopener noreferrer" title="Download diff report in a new tab">Export diff report</a>
          <button type="button" id="migration-preview" title="Generate SQL migration from diff">Migration Preview</button>
        </div>
        <p id="compare-status" class="meta"></p>
        <pre id="compare-result" class="meta diff-result" style="display: none; max-height: 60vh;"></pre>
          </div>
        </div>
        <div id="panel-index" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-index" hidden>
          <div id="index-collapsible" class="tool-panel-body">
        <p class="meta">Analyze tables for missing indexes based on schema patterns.</p>
        <div class="toolbar">
          <button type="button" id="index-analyze" class="btn-primary" title="Analyze tables for missing indexes">Analyze</button>
          <button type="button" id="index-save" title="Save this result for later">Save result</button>
          <button type="button" id="index-export" title="Download result as JSON">Export as JSON</button>
          <label for="index-history">History:</label>
          <select id="index-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="index-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="index-results" style="display:none;"></div>
          </div>
        </div>
        <div id="panel-size" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-size" hidden>
          <div id="size-collapsible" class="tool-panel-body">
        <p class="meta">Analyze database storage: total size, page stats, and per-table breakdown.</p>
        <div class="toolbar">
          <button type="button" id="size-analyze" class="btn-primary" title="Analyze database storage and per-table size">Analyze</button>
          <button type="button" id="size-save" title="Save this result for later">Save result</button>
          <button type="button" id="size-export" title="Download result as JSON">Export as JSON</button>
          <label for="size-history">History:</label>
          <select id="size-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="size-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="size-results" style="display:none;"></div>
          </div>
        </div>
        <div id="panel-perf" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-perf" hidden>
          <div id="perf-collapsible" class="tool-panel-body">
        <p class="meta">Track query execution times, identify slow queries, and view patterns.</p>
        <div class="toolbar">
          <button type="button" id="perf-refresh" title="Update performance data">Update</button>
          <button type="button" id="perf-clear" title="Clear performance history">Clear</button>
          <button type="button" id="perf-save" title="Save this result for later">Save result</button>
          <button type="button" id="perf-export" title="Download result as JSON">Export as JSON</button>
          <label for="perf-history">History:</label>
          <select id="perf-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="perf-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="perf-results" style="display:none;"></div>
          </div>
        </div>
        <div id="panel-anomaly" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-anomaly" hidden>
          <div id="anomaly-collapsible" class="tool-panel-body">
        <p class="meta">Scan all tables for data quality issues: NULLs, empty strings, orphaned FKs, duplicates, outliers.</p>
        <div class="toolbar">
          <button type="button" id="anomaly-analyze" class="btn-primary" title="Scan tables for data quality issues">Scan for anomalies</button>
          <button type="button" id="anomaly-save" title="Save this result for later">Save result</button>
          <button type="button" id="anomaly-export" title="Download result as JSON">Export as JSON</button>
          <label for="anomaly-history">History:</label>
          <select id="anomaly-history" title="Past runs — select to view"><option value="">— Past runs —</option></select>
          <button type="button" id="anomaly-compare" title="Compare two saved or current results">Compare</button>
        </div>
        <div id="anomaly-results" style="display:none;"></div>
          </div>
        </div>
        <div id="panel-import" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-import" hidden>
          <div id="import-collapsible" class="tool-panel-body">
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
            <button type="button" id="import-run" disabled class="btn-primary" title="Run import with selected file and options">Import</button>
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
        <div id="panel-schema" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-schema" hidden>
          <div id="schema-collapsible" class="tool-panel-body"><pre id="schema-inline-pre" class="meta">Loading…</pre></div>
        </div>
        <div id="panel-diagram" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-diagram" hidden>
          <div id="diagram-collapsible" class="tool-panel-body">
        <p class="meta">Tables and relationships. Click or press Enter on a table to view its data. Use arrow keys to navigate between tables.</p>
        <div id="diagram-container"></div>
        <div id="diagram-text-alt" class="sr-only"></div>
          </div>
        </div>
        <!-- Export tab: opened from toolbar; narrative + same export links (IDs kept for JS). -->
        <div id="panel-export" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-export" hidden>
          <div id="export-collapsible" class="tool-panel-body">
        <p class="export-narrative">Export your database schema, full dumps, or the current table as CSV. Use <strong>Schema</strong> for DDL only (CREATE TABLE, indexes). Use <strong>Full dump</strong> for schema plus all data as SQL. Use <strong>Database</strong> to download the raw SQLite file. Use <strong>Table CSV</strong> to export the table currently selected in the Tables view.</p>
        <div class="export-toolbar" style="margin-top:1rem;">
          <span class="export-toolbar-label">Download:</span>
          <a href="/api/schema" id="export-schema" class="export-link" download="schema.sql" title="Download schema as SQL"><span class="material-symbols-outlined export-icon" aria-hidden="true">code</span>Schema</a>
          <a href="#" id="export-dump" class="export-link" title="Download full database dump"><span class="material-symbols-outlined export-icon" aria-hidden="true">download</span>Full dump</a><span id="export-dump-status" class="meta"></span>
          <a href="#" id="export-database" class="export-link" title="Download database file"><span class="material-symbols-outlined export-icon" aria-hidden="true">storage</span>Database</a><span id="export-database-status" class="meta"></span>
          <a href="#" id="export-csv" class="export-link" title="Export current table as CSV"><span class="material-symbols-outlined export-icon" aria-hidden="true">table_chart</span>Table CSV</a><span id="export-csv-status" class="meta"></span>
        </div>
          </div>
        </div>
      </div>
    </div>
  <div id="column-context-menu" role="menu" aria-hidden="true">
    <button type="button" data-action="hide" role="menuitem" title="Hide this column from the table">Hide column</button>
    <button type="button" data-action="pin" role="menuitem" title="Pin column to the left">Pin column</button>
    <button type="button" data-action="unpin" role="menuitem" title="Unpin column">Unpin column</button>
  </div>
  <div id="column-chooser" aria-label="Column chooser" aria-modal="true" aria-hidden="true">
    <h3>Columns</h3>
    <ul id="column-chooser-list" class="column-chooser-list"></ul>
    <div class="column-chooser-actions">
      <button type="button" id="column-chooser-reset" title="Restore default column visibility and order">Reset to default</button>
      <button type="button" id="column-chooser-close" title="Close column chooser">Close</button>
    </div>
  </div>
  <div id="copy-toast" class="copy-toast">Copied!</div>
  <!-- Cell value popup: double-tap a table cell to view full text; Copy button copies to clipboard. -->
  <div id="cell-value-popup" role="dialog" aria-modal="true" aria-labelledby="cell-value-popup-title" aria-hidden="true">
    <div class="cell-value-popup-box">
      <div id="cell-value-popup-title" class="cell-value-popup-title">Cell value</div>
      <div class="cell-value-popup-content"><pre id="cell-value-popup-text"></pre></div>
      <div class="cell-value-popup-actions">
        <button type="button" id="cell-value-popup-copy" class="btn-primary" title="Copy full value to clipboard">Copy</button>
        <button type="button" id="cell-value-popup-close" title="Close">Close</button>
      </div>
    </div>
  </div>

  <script defer src="/assets/web/app.js" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/app.js';"></script>
</body></html>
''';
}
