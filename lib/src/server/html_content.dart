/// Inline HTML shell for the single-page viewer UI.
///
/// ## Static assets (CSS / JS)
///
/// When the debug server can resolve the package root on disk, CSS and JS
/// are inlined directly into the HTML response via `<style>` / `<script>`
/// tags — no extra requests needed. This avoids the fragile `onerror`
/// fallback chain that broke in Firefox (404 + correct MIME type does not
/// reliably trigger `onerror` on `<link>`/`<script>` elements).
///
/// When local asset files cannot be found (e.g., Flutter mobile, pub cache
/// without assets), the HTML references jsDelivr CDN URLs directly. A
/// fetch-based loader tries the version-pinned URL first, then `@main`.
///
/// ## UX notes
///
/// Buttons and collapsible headers include [title] attributes for hover tooltips.
///
/// Layout shell uses [id="app-layout"] and [id="app-sidebar"]; the sidebar
/// toggle now lives in the floating action menu ([id="fab-sidebar-toggle"])
/// — see `initSidebarPanelCollapse` and `initSuperFab` in `app.js`.
///
/// The **Tables** sidebar shows skeleton rows under the Tables heading until `app.js` completes
/// `GET /api/tables`; failures surface in the same block (see `buildIndexHtml` markup).
import 'server_constants.dart';

abstract final class HtmlContent {
  /// Base64-encoded app logo PNG (from example/assets/logo.png).
  ///
  /// Inlined as a data URI to avoid an extra server route and to work
  /// in offline / CDN-fallback scenarios.
  static const _appLogoBase64 =
      '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'
      'HMyb5reC/w8pUgASyWXBVgAAAABJRU5ErkJggg==';

  /// Builds the HTML shell with assets either inlined or loaded from CDN.
  ///
  /// When [inlineCss] and [inlineJs] are provided (non-null), they are
  /// embedded directly in `<style>` / `<script>` tags — zero extra
  /// requests, works offline, and avoids the unreliable `onerror`
  /// fallback chain. When null, a small fetch-based loader tries
  /// version-pinned jsDelivr, then `@main`.
  static String buildIndexHtml({String? inlineCss, String? inlineJs}) {
    // CSS: inline <style> when available, otherwise CDN <link>.
    // No escaping needed for CSS — </style> is not valid CSS syntax
    // and will never appear in the stylesheet.
    final cssTag = inlineCss != null
        ? '<style>$inlineCss</style>'
        : '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/style.css" onerror="this.onerror=null;this.href=\'https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@main/assets/web/style.css\'">';

    // JS: inline <script> when available, otherwise fetch-based loader
    // that tries CDN URLs sequentially. Using fetch() instead of
    // <script onerror> because Firefox does not reliably fire onerror
    // on <script> elements that receive 404 with correct MIME type.
    //
    // When inlining, escape </script> sequences that could appear
    // inside JS string literals (e.g. innerHTML assignments). The
    // HTML parser sees </script> as a closing tag regardless of JS
    // context, so we replace </ with <\/ which is equivalent in JS.
    final jsTag = inlineJs != null
        ? '<script>${inlineJs.replaceAll('</script>', r'<\/script>')}</script>'
        : '''<script>
(function(){
  var urls=['https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/app.js','https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@main/assets/web/app.js'];
  function tryNext(){
    if(!urls.length){document.dispatchEvent(new CustomEvent('sda-asset-failed',{detail:'app.js'}));return}
    var u=urls.shift(),s=document.createElement('script');
    s.src=u;s.onerror=tryNext;document.body.appendChild(s);
  }
  tryNext();
})();
</script>''';

    // Startup diagnostic lines shown in the loading overlay.
    // Per-asset source and status so a mixed state (e.g. CSS inlined
    // but JS from CDN) is accurately reported to the user.
    final cssSource = inlineCss != null ? 'local' : 'CDN';
    final jsSource = inlineJs != null ? 'local' : 'CDN';
    final cssStatus = inlineCss != null ? '\u2713' : '\u22EF';
    final jsStatus = inlineJs != null ? '\u2713' : '\u22EF';

    return '''
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
  $cssTag
</head>
<body>
  <!-- Loading overlay: visible until app.js hides it. If JS never loads
       (all sources fail), this stays visible as the error indicator.
       Uses inline styles so it renders even when style.css fails.
       Shows a startup diagnostic sequence with version and asset source. -->
  <div id="sda-loading" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#1e1e2e;color:#cdd6f4;font-family:'Courier New',Consolas,monospace;font-size:0.85rem;line-height:1.6">
    <div style="text-align:left;min-width:320px">
      <div style="color:#89b4fa;font-weight:bold;margin-bottom:0.5em">Saropa Drift Advisor v${ServerConstants.packageVersion}</div>
      <div style="border-top:1px solid #45475a;margin-bottom:0.5em"></div>
      <div>$cssStatus stylesheet ($cssSource)</div>
      <div>$jsStatus app.js ($jsSource)</div>
      <div id="sda-loading-msg" style="margin-top:0.5em;color:#a6adc8">\u22EF initializing\u2026</div>
    </div>
  </div>
  <!-- Error state listener: updates the loading overlay when all CDN
       sources have been exhausted. -->
  <script>document.addEventListener('sda-asset-failed',function(e){var m=document.getElementById('sda-loading-msg');if(m){m.style.color='#f38ba8';m.textContent='\u2717 Could not load '+e.detail+' — check network and refresh.';}var d=document.getElementById('sda-loading');if(d)d.style.display='flex'})</script>
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
    <!-- Version badge links to VS Code Marketplace changelog; text filled by JS from /api/health. -->
    <a id="version-badge" class="app-version meta" style="opacity:0;" href="https://marketplace.visualstudio.com/items/Saropa.drift-viewer/changelog" target="_blank" rel="noopener noreferrer" title="View changelog"> </a>
    <div class="app-header-actions">
      <button type="button" id="share-btn" class="header-btn" title="Share current view with your team"><span class="material-symbols-outlined header-icon" aria-hidden="true">share</span>Share</button>
      <button type="button" id="live-indicator" class="header-pill connection-status" title="Live, paused, or offline — connection status" aria-live="polite">● Live</button>
    </div>
  </header>
  <div class="app-layout" id="app-layout">
    <aside class="app-sidebar" id="app-sidebar">
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
      <div id="sidebar-tables-wrap" class="sidebar-section sidebar-tables-wrap">
      <h2 class="tables-heading"><button type="button" id="tables-heading-toggle" aria-expanded="true" title="Click to collapse/expand sidebar">Tables</button></h2>
      <!-- Shimmer placeholders sit under the heading (not above) until /api/tables returns. -->
      <div id="tables-loading" class="tables-loading" aria-busy="true" aria-label="Loading tables">
        <ul class="table-list tables-skeleton" role="presentation">
          <li><span class="tables-skeleton-bar"></span></li>
          <li><span class="tables-skeleton-bar"></span></li>
          <li><span class="tables-skeleton-bar"></span></li>
          <li><span class="tables-skeleton-bar"></span></li>
          <li><span class="tables-skeleton-bar"></span></li>
          <li><span class="tables-skeleton-bar"></span></li>
        </ul>
        <p id="tables-loading-error" class="tables-loading-error meta" hidden role="alert"></p>
      </div>
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
        <img src="data:image/png;base64,$_appLogoBase64" alt="Saropa Drift Adviser" class="tab-bar-logo" title="Saropa Drift Adviser" role="presentation" />
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
        <button type="button" id="clear-table-data" class="btn-danger" style="display:none;" title="Delete all rows from this table (requires write access)">Clear rows</button>
        <button type="button" id="clear-all-data" class="btn-danger" style="display:none;" title="Delete all rows from every table (requires write access)">Clear all tables</button>
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
          <label for="perf-slow-threshold">Slow &gt;</label>
          <input type="number" id="perf-slow-threshold" min="1" step="10" value="100" title="Slow query threshold in milliseconds" style="width:5rem;" />
          <span class="meta">ms</span>
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
            <button type="button" id="import-paste" title="Paste data from clipboard (CSV, TSV, or JSON)">Paste</button>
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

  <!-- Super FAB: floating action menu for sidebar, theme, and mask toggles. -->
  <div class="super-fab" id="super-fab">
    <div class="super-fab-menu" id="super-fab-menu" aria-hidden="true">
      <button type="button" id="fab-sidebar-toggle" class="fab-action" title="Toggle sidebar" aria-label="Toggle tables sidebar">
        <span class="material-symbols-outlined" id="fab-sidebar-icon" aria-hidden="true">chevron_left</span>
        <span class="fab-action-label" id="fab-sidebar-label">Sidebar</span>
      </button>
      <button type="button" id="fab-theme-toggle" class="fab-action" title="Dark or light theme" aria-label="Cycle theme">
        <span class="material-symbols-outlined" aria-hidden="true">dark_mode</span>
        <span class="fab-action-label" id="fab-theme-label">Theme</span>
      </button>
      <label class="fab-action fab-mask-toggle" title="Mask sensitive columns in table view and exports">
        <input type="checkbox" id="fab-pii-mask-toggle" aria-label="Mask sensitive data" />
        <span class="material-symbols-outlined" aria-hidden="true">visibility_off</span>
        <span class="fab-action-label" id="fab-pii-mask-label">Mask</span>
      </label>
    </div>
    <button type="button" class="super-fab-trigger" id="super-fab-trigger" aria-label="Toggle quick actions" aria-expanded="false" aria-controls="super-fab-menu">
      <span class="material-symbols-outlined super-fab-icon" id="super-fab-icon" aria-hidden="true">tune</span>
    </button>
  </div>

  $jsTag
</body></html>
''';
  }
}
