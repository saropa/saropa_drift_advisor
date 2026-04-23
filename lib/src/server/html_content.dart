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
/// Layout shell uses [id="app-layout"] and [id="app-sidebar"]; sidebar
/// toggles are toolbar icon buttons — see `initSidebarCollapse` in
/// `sidebar.ts` and `initToolbar` in `toolbar.ts`.
///
/// The **Tables** sidebar shows skeleton rows under the Tables heading until the web bundle
/// completes `GET /api/tables`; failures surface in the same block (see `buildIndexHtml` markup).
import 'server_constants.dart';

abstract final class HtmlContent {
  /// CDN URL for the app logo PNG.
  ///
  /// Uses the same jsDelivr CDN + version-pinned pattern as CSS/JS assets.
  /// Falls back to `@main` if the versioned tag hasn't propagated yet.
  static const _appLogoUrl =
      '${ServerConstants.cdnBaseUrl}'
      '@v${ServerConstants.packageVersion}/extension/icon.png';

  /// Fallback logo URL on the `@main` branch, used when the versioned
  /// tag hasn't propagated to the CDN yet (same pattern as CSS/JS).
  static const _appLogoUrlFallback =
      '${ServerConstants.cdnBaseUrl}'
      '@main/extension/icon.png';

  /// Returns the masthead pill HTML fragment for the app header.
  ///
  /// Renders: `[logo] vX.Y.Z – ● Online`
  ///
  /// The version badge text is populated at runtime by `app.js` from
  /// `/api/health`; the connection status is managed by
  /// `updatePollingUI` / `updateLiveIndicatorForConnection` in `app.js`.
  ///
  /// Styles live in `assets/web/_masthead.scss`.
  static String _buildMastheadPill() =>
      '''
    <!-- Combined masthead pill: logo · version · connection status. -->
    <div class="masthead-pill" id="masthead-pill">
      <img src="$_appLogoUrl" onerror="this.onerror=null;this.src='$_appLogoUrlFallback'" alt="" class="masthead-logo" role="presentation" />
      <span class="masthead-name">${ServerConstants.appDisplayName}</span>
      <a id="version-badge" class="masthead-version" href="https://marketplace.visualstudio.com/items/Saropa.drift-viewer/changelog" target="_blank" rel="noopener noreferrer" title="View changelog" style="opacity:0;"> </a>
      <span class="masthead-sep" aria-hidden="true">\u2013</span>
      <button type="button" id="live-indicator" class="masthead-status connection-status" title="Online, paused, or offline \u2014 connection status" aria-live="polite">\u25cf Online</button>
      <span id="masthead-mask-badge" class="masthead-mask-badge" style="display:none;" title="PII masking is active \u2014 sensitive columns are redacted">MASKED</span>
    </div>''';

  /// Builds the HTML shell with assets either inlined or loaded from CDN.
  ///
  /// When [inlineCss] and [inlineBundleJs] are provided (non-null), they
  /// are embedded directly in `<style>` / `<script>` tags — zero extra
  /// requests, works offline, and avoids the unreliable `onerror`
  /// fallback chain. When null, a small fetch-based loader tries
  /// version-pinned jsDelivr, then `@main`.
  static String buildIndexHtml({String? inlineCss, String? inlineBundleJs}) {
    // CSS: inline <style> when available, otherwise CDN <link>.
    // No escaping needed for CSS — </style> is not valid CSS syntax
    // and will never appear in the stylesheet.
    final cssTag = inlineCss != null
        ? '<style>$inlineCss</style>'
        : '<link rel="stylesheet" href="${ServerConstants.cdnBaseUrl}@v${ServerConstants.packageVersion}/assets/web/style.css" onerror="this.onerror=null;this.href=\'${ServerConstants.cdnBaseUrl}@main/assets/web/style.css\'">';

    // JS bundle: single esbuild output containing app + toolbar + masthead +
    // table-def-toggle. Inline <script> when available, otherwise
    // fetch-based loader that tries CDN URLs sequentially.
    //
    // When inlining, escape </script> sequences that could appear
    // inside JS string literals (e.g. innerHTML assignments). The
    // HTML parser sees </script> as a closing tag regardless of JS
    // context, so we replace </ with <\/ which is equivalent in JS.
    final bundleJsTag = inlineBundleJs != null
        ? '<script>${inlineBundleJs.replaceAll('</script>', r'<\/script>')}</script>'
        : '''<script>
(function(){
  var urls=['${ServerConstants.cdnBaseUrl}@v${ServerConstants.packageVersion}/assets/web/bundle.js','${ServerConstants.cdnBaseUrl}@main/assets/web/bundle.js'];
  function tryNext(){
    if(!urls.length){document.dispatchEvent(new CustomEvent('sda-asset-failed',{detail:'bundle.js'}));return}
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
    final jsSource = inlineBundleJs != null ? 'local' : 'CDN';
    final cssStatus = inlineCss != null ? '\u2713' : '\u22EF';
    final jsStatus = inlineBundleJs != null ? '\u2713' : '\u22EF';

    return '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Saropa Drift Adviser</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500;700&display=swap">
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
  <div id="sda-loading" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#1e1e2e;color:#cdd6f4;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.85rem;line-height:1.6">
    <div style="text-align:left;min-width:320px">
      <div style="color:#89b4fa;font-weight:bold;margin-bottom:0.5em">${ServerConstants.appDisplayName} v${ServerConstants.packageVersion}</div>
      <div style="border-top:1px solid #45475a;margin-bottom:0.5em"></div>
      <div>$cssStatus stylesheet ($cssSource)</div>
      <div>$jsStatus bundle.js ($jsSource)</div>
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
    ${_buildMastheadPill()}
    <!-- Share button lives in the toolbar (tb-share-btn). -->
  </header>
  <div class="app-shell">
  <!-- Full-width toolbar above the three-column layout (tables sidebar, main, history). -->
      <div id="toolbar-bar" class="toolbar-bar" role="toolbar" aria-label="Actions">
        <button type="button" class="tb-icon-btn" data-tool="home" title="Home"><span class="material-symbols-outlined" aria-hidden="true">home</span></button>
        <hr class="tb-divider" />
        <!-- Left sidebar toggle -->
        <button type="button" class="tb-icon-btn" id="tb-sidebar-toggle" title="Toggle tables sidebar" aria-pressed="true"><span class="material-symbols-outlined" aria-hidden="true">left_panel_open</span></button>
        <hr class="tb-divider" />
        <!-- Core view icons (were fixed tabs until the tab-bar split) -->
        <button type="button" class="tb-icon-btn" data-tool="tables" title="Tables"><span class="material-symbols-outlined" aria-hidden="true">table_chart</span></button>
        <button type="button" class="tb-icon-btn" data-tool="search" title="Search"><span class="material-symbols-outlined" aria-hidden="true">search</span></button>
        <button type="button" class="tb-icon-btn" data-tool="sql" title="Run SQL"><span class="material-symbols-outlined" aria-hidden="true">terminal</span></button>
        <hr class="tb-divider" />
        <!-- Tool launcher icons -->
        <button type="button" class="tb-icon-btn" data-tool="snapshot" title="Snapshot"><span class="material-symbols-outlined" aria-hidden="true">photo_camera</span></button>
        <button type="button" class="tb-icon-btn" data-tool="compare" title="DB diff"><span class="material-symbols-outlined" aria-hidden="true">compare_arrows</span></button>
        <hr class="tb-divider" />
        <button type="button" class="tb-icon-btn" data-tool="index" title="Index"><span class="material-symbols-outlined" aria-hidden="true">format_list_bulleted</span></button>
        <button type="button" class="tb-icon-btn" data-tool="schema" title="Schema"><span class="material-symbols-outlined" aria-hidden="true">grid_on</span></button>
        <button type="button" class="tb-icon-btn" data-tool="diagram" title="Diagram"><span class="material-symbols-outlined" aria-hidden="true">account_tree</span></button>
        <hr class="tb-divider" />
        <button type="button" class="tb-icon-btn" data-tool="size" title="Size"><span class="material-symbols-outlined" aria-hidden="true">bar_chart</span></button>
        <button type="button" class="tb-icon-btn" data-tool="perf" title="Perf"><span class="material-symbols-outlined" aria-hidden="true">speed</span></button>
        <button type="button" class="tb-icon-btn" data-tool="anomaly" title="Health"><span class="material-symbols-outlined" aria-hidden="true">favorite</span></button>
        <hr class="tb-divider" />
        <button type="button" class="tb-icon-btn" data-tool="import" title="Import"><span class="material-symbols-outlined" aria-hidden="true">upload</span></button>
        <button type="button" class="tb-icon-btn" data-tool="export" title="Export"><span class="material-symbols-outlined" aria-hidden="true">download</span></button>
        <button type="button" class="tb-icon-btn" data-tool="settings" title="Settings"><span class="material-symbols-outlined" aria-hidden="true">settings</span></button>
        <!-- Spacer pushes right-side controls to far right -->
        <span class="tb-spacer"></span>
        <!-- Mask PII toggle — hidden checkbox + visible icon button -->
        <input type="checkbox" id="tb-mask-checkbox" aria-label="Mask sensitive data" hidden />
        <button type="button" class="tb-icon-btn" id="tb-mask-toggle" title="Mask PII" aria-pressed="false"><span class="material-symbols-outlined" aria-hidden="true">visibility_off</span></button>
        <!-- Theme flyout -->
        <div class="tb-flyout-wrap" id="tb-theme-wrap">
          <button type="button" class="tb-icon-btn" id="tb-theme-trigger" title="Theme" aria-expanded="false"><span class="material-symbols-outlined" aria-hidden="true">palette</span></button>
          <div class="tb-flyout" id="tb-theme-flyout">
            <button type="button" class="tb-flyout-item tb-theme-option" data-theme="light"><span class="material-symbols-outlined" aria-hidden="true">light_mode</span>Light</button>
            <button type="button" class="tb-flyout-item tb-theme-option" data-theme="showcase"><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>Showcase</button>
            <button type="button" class="tb-flyout-item tb-theme-option" data-theme="dark"><span class="material-symbols-outlined" aria-hidden="true">dark_mode</span>Dark</button>
            <button type="button" class="tb-flyout-item tb-theme-option" data-theme="midnight"><span class="material-symbols-outlined" aria-hidden="true">bedtime</span>Midnight</button>
          </div>
        </div>
        <button type="button" class="tb-icon-btn" id="tb-share-btn" title="Share"><span class="material-symbols-outlined" aria-hidden="true">share</span></button>
        <hr class="tb-divider" />
        <!-- Right sidebar toggle -->
        <button type="button" class="tb-icon-btn" id="tb-history-toggle" title="Toggle history sidebar" aria-pressed="true"><span class="material-symbols-outlined" aria-hidden="true">right_panel_open</span></button>
      </div>
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
      <h2 class="history-heading">Tables <span id="tables-count" class="history-count"></span></h2>
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
      <!-- Tab row: closeable tool/table tabs; startup opens Home. -->
      <div id="tab-bar" class="tab-bar" role="tablist" aria-label="Open tabs"></div>
      <div id="tab-panels" class="tab-panels">
        <div id="panel-home" class="tab-panel active" role="tabpanel" aria-labelledby="tab-home">
          <div class="home-screen">
            <div class="home-sidebar-toggles" aria-label="Sidebar visibility">
              <div class="home-sidebar-toggle-row">
                <span class="home-sidebar-toggle-label" id="home-label-tables-sidebar">Tables sidebar (left)</span>
                <button type="button" class="home-switch home-switch-on" id="home-switch-tables" role="switch" aria-labelledby="home-label-tables-sidebar" aria-checked="true"></button>
              </div>
              <div class="home-sidebar-toggle-row">
                <span class="home-sidebar-toggle-label" id="home-label-history-sidebar">History (right)</span>
                <button type="button" class="home-switch home-switch-on" id="home-switch-history" role="switch" aria-labelledby="home-label-history-sidebar" aria-checked="true"></button>
              </div>
            </div>
            <div id="home-tool-grid" class="home-tool-grid"></div>
          </div>
        </div>
        <div id="panel-tables" class="tab-panel" role="tabpanel" aria-labelledby="tab-tables" hidden>
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
        <button type="button" id="sample-rows-btn" title="Load a random sample of rows from this table"><span class="material-symbols-outlined toolbar-icon" aria-hidden="true">shuffle</span>Sample</button>
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
      <div class="sql-runner">
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
      <button type="button" id="sql-template-lock" class="sql-lock-btn locked" title="Lock: auto-apply template when table or fields change"><span class="material-symbols-outlined" aria-hidden="true">lock</span></button>
      <button type="button" id="sql-apply-template" title="Insert template query into editor"><span class="material-symbols-outlined" aria-hidden="true">post_add</span> Apply template</button>
      <!-- History toggle (replaces the old "Recent" label + select).
           A dropdown read as a form control — the em-dash placeholder
           looked like an empty value — and duplicated the History
           sidebar, which after the click-to-open-Run-SQL fix is a
           strict superset (full SQL, duration, rows, timestamp, source
           badge). Collapsing both affordances into this single icon
           button eliminates the "nothing after the label" problem AND
           the data duplication. Button toggles #history-sidebar
           visibility, matching the toolbar-level #tb-history-toggle. -->
      <button type="button" id="sql-history-toggle" title="Show recent queries in the History sidebar" aria-label="Show recent queries"><span class="material-symbols-outlined" aria-hidden="true">history</span></button>
    </div>
    <div class="sql-toolbar" style="margin-top:0;">
      <label for="sql-bookmarks">Saved queries:</label>
      <select id="sql-bookmarks" title="Load a saved query" style="max-width:14rem;"><option value="">— Saved queries —</option></select>
      <button type="button" id="sql-bookmark-save" title="Save current query"><span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span> Save</button>
      <button type="button" id="sql-bookmark-delete" title="Delete selected"><span class="material-symbols-outlined" aria-hidden="true">delete</span> Del</button>
      <button type="button" id="sql-bookmark-export" title="Export as JSON"><span class="material-symbols-outlined" aria-hidden="true">download</span> Export</button>
      <button type="button" id="sql-bookmark-import" title="Import from JSON"><span class="material-symbols-outlined" aria-hidden="true">upload</span> Import</button>
      <label for="sql-result-format">Show as:</label>
      <select id="sql-result-format"><option value="table">Table</option><option value="json">JSON</option></select>
    </div>
    <div class="sql-toolbar nl-ask-toolbar" style="margin-bottom:0.35rem;">
      <button type="button" id="nl-open" title="Describe your question in plain English; preview SQL updates in the dialog as you type"><span class="material-symbols-outlined" aria-hidden="true">smart_toy</span> Ask in English…</button>
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
    <!-- Run button sits directly beneath the editor so it's the natural
         next action after typing / adjusting the query. Previously it lived
         in the template toolbar above the editor, which visually detached
         it from the query body it executes. -->
    <div class="sql-toolbar sql-run-toolbar" style="margin-top:0.4rem;">
      <button type="button" id="sql-run" class="btn-primary" title="Execute the SQL query"><span class="material-symbols-outlined" aria-hidden="true">play_arrow</span> Run</button>
    </div>
    <div id="sql-explain-info" class="sql-explain-info" style="display: none;"></div>
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
        <!-- Shown when queryCompare is NOT configured -->
        <div id="compare-setup-guide">
          <p class="meta">Compare two databases side-by-side &mdash; for example, your local DB against a staging or production copy. See schema differences, row count changes, and generate migration SQL.</p>
          <details>
            <summary>How to enable</summary>
            <p class="meta">Pass a second query callback when starting the debug server:</p>
            <pre class="meta" style="font-size:11px;background:var(--bg-pre);padding:0.5rem;border-radius:4px;overflow-x:auto;">DriftDebugServer.start(
  query: myDb.customSelect,       // primary DB
  queryCompare: stagingDb.customSelect, // comparison DB
);</pre>
            <p class="meta">The comparison callback should connect to the other database you want to diff against. Both callbacks use the same <code>DriftDebugQuery</code> signature.</p>
          </details>
        </div>
        <!-- Shown when queryCompare IS configured -->
        <div id="compare-active" style="display: none;">
          <p class="meta">Schema and row-count diff between your primary and comparison databases.</p>
          <div class="toolbar">
            <button type="button" id="compare-view" title="Open full diff report in a new view">View diff report</button>
            <!-- Export opens in new tab so the current DB diff view stays open; rel=noopener noreferrer for security -->
            <a href="/api/compare/report?format=download" id="compare-export" target="_blank" rel="noopener noreferrer" title="Download diff report in a new tab">Export diff report</a>
            <button type="button" id="migration-preview" title="Generate SQL migration from schema differences">Migration Preview</button>
          </div>
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
        <details id="import-history-details" class="import-history" style="margin-top:0.5rem;display:none;">
          <summary style="cursor:pointer;font-size:12px;opacity:0.7;">Import history</summary>
          <div id="import-history-list" style="max-height:150px;overflow-y:auto;font-size:11px;margin-top:4px;"></div>
        </details>
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
          <a href="#" id="export-json" class="export-link" title="Export current table as JSON"><span class="material-symbols-outlined export-icon" aria-hidden="true">data_object</span>Table JSON</a><span id="export-json-status" class="meta"></span>
        </div>
          </div>
        </div>
        <div id="panel-settings" class="tab-panel tool-panel" role="tabpanel" aria-labelledby="tab-settings" hidden>
          <div id="settings-body" class="tool-panel-body"></div>
        </div>
      </div>
    </div>
    <aside class="history-sidebar" id="history-sidebar" aria-label="Query history">
      <!-- Plain heading: the sidebar itself is collapsed via the
           #tb-history-toggle toolbar icon (same pattern as the tables
           sidebar uses #tb-sidebar-toggle), so no inline collapse
           button is needed here. -->
      <h2 class="history-heading">History <span id="history-count" class="history-count"></span></h2>
      <div class="history-filter-bar" role="radiogroup" aria-label="Filter query history by source">
        <button type="button" class="history-filter active" data-filter="all" aria-pressed="true">All</button>
        <button type="button" class="history-filter" data-filter="browser" aria-pressed="false">Browser</button>
        <button type="button" class="history-filter" data-filter="app" aria-pressed="false">App</button>
        <button type="button" class="history-filter" data-filter="internal" aria-pressed="false">Internal</button>
      </div>
      <ul id="query-history-list" class="query-history-list"></ul>
      <div class="history-actions">
        <button type="button" id="history-refresh" class="history-action-btn" title="Refresh history"><span class="material-symbols-outlined" aria-hidden="true">refresh</span></button>
        <button type="button" id="history-clear" class="history-action-btn" title="Clear history"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
      </div>
    </aside>
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

  <!-- FAB removed: all actions consolidated into the toolbar in the tab bar. -->

  $bundleJsTag
</body></html>
''';
  }
}
