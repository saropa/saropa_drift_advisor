// Contract tests for the debug web viewer shell: NL→SQL modal markup,
// layout toggles, and tables-list loading shell (html_content.dart, bundle.js,
// SCSS partials). Catches accidental ID renames and markup regressions.

import 'dart:io';

import 'package:test/test.dart';

/// Read and normalize line endings in [path].
String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

/// Concatenate all SCSS sources (root + partials) so contract checks can find
/// rules that moved from style.scss into `_*.scss` partials.
String _readAllScss() {
  final dir = Directory('assets/web');
  final buf = StringBuffer();
  for (final f in dir.listSync().whereType<File>()) {
    if (f.path.endsWith('.scss')) {
      buf.writeln(_read(f.path));
    }
  }
  return buf.toString();
}

void main() {
  // bundle.js is the esbuild output that merges app.js + all TS modules.
  final String appJs = _read('assets/web/bundle.js');
  final String htmlDart = _read('lib/src/server/html_content.dart');
  final String styleScss = _readAllScss();

  test(
    'NL modal shell: compact trigger and preview field, no legacy inline row',
    () {
      expect(htmlDart, contains('id="nl-open"'));
      expect(htmlDart, contains('id="nl-modal-sql-preview"'));
      expect(htmlDart, contains('id="nl-modal-input"'));
      expect(htmlDart, isNot(contains('id="nl-input"')));
      expect(htmlDart, isNot(contains('id="nl-convert"')));
    },
  );

  test(
    'NL modal script: preview-only live path and Use copies to sql-input',
    () {
      expect(appJs, contains('function applyNlLivePreview'));
      expect(appJs, contains('function scheduleNlLivePreview'));
      expect(appJs, contains('getElementById("nl-modal-sql-preview")'));
      expect(appJs, contains('async function useNlModal'));
      expect(appJs, contains('function setNlModalError'));
      expect(appJs, isNot(contains('getElementById("nl-input")')));
      expect(appJs, isNot(contains('getElementById("nl-convert")')));
    },
  );

  test('App sidebar panel toggle: HTML ids, SCSS hook, JS key and toggle', () {
    expect(htmlDart, contains('id="app-layout"'));
    expect(htmlDart, contains('id="app-sidebar"'));
    // Sidebar toggle moved into the super FAB menu.
    expect(htmlDart, contains('id="fab-sidebar-toggle"'));
    expect(htmlDart, contains('id="fab-sidebar-icon"'));
    expect(htmlDart, contains('id="fab-sidebar-label"'));
    expect(
      htmlDart,
      isNot(contains('toolbar button above')),
      reason: 'sidebar no longer duplicates Export-tab directions',
    );
    expect(styleScss, contains('app-sidebar-panel-collapsed'));
    expect(appJs, contains('APP_SIDEBAR_PANEL_KEY'));
    expect(appJs, contains('saropa_app_sidebar_collapsed'));
    expect(appJs, contains('classList.toggle("app-sidebar-panel-collapsed"'));
    // Unified function drives both the header button and the tables heading toggle.
    final initFn = 'function initSidebarCollapse';
    final toggleLine = 'classList.toggle("app-sidebar-panel-collapsed"';
    expect(
      appJs.indexOf(initFn),
      lessThan(appJs.indexOf(toggleLine)),
      reason: 'initSidebarCollapse must be defined before toggle() runs',
    );
  });

  test(
    'Tables heading toggle collapses sidebar horizontally, not vertically',
    () {
      // The tables heading button delegates to the same panel-level collapse
      // used by the header chevron — no separate vertical max-height mechanism.
      expect(
        htmlDart,
        contains('id="tables-heading-toggle"'),
        reason: 'tables heading toggle button must exist in HTML shell',
      );
      expect(
        htmlDart,
        contains('title="Click to collapse/expand sidebar"'),
        reason: 'title must describe sidebar collapse, not table list collapse',
      );
      // app.js wires both buttons inside a single IIFE
      expect(
        appJs,
        contains('getElementById("tables-heading-toggle")'),
        reason: 'JS must look up the tables heading toggle',
      );
      // The old vertical-collapse mechanism is gone: no getItem/setItem usage
      // of the old key (removeItem cleanup is fine).
      expect(
        appJs,
        isNot(contains('getItem("saropa_sidebar_tables_collapsed")')),
        reason: 'old vertical-collapse localStorage key must not be read',
      );
      expect(
        appJs,
        isNot(contains('setItem("saropa_sidebar_tables_collapsed"')),
        reason: 'old vertical-collapse localStorage key must not be written',
      );
      expect(
        appJs,
        isNot(contains('wrap.classList.toggle("collapsed")')),
        reason: 'no per-section .collapsed class toggle on the tables wrap',
      );
      // Old vertical-collapse CSS (max-height → 0) must be gone from SCSS
      expect(
        styleScss,
        isNot(contains('sidebar-tables-wrap.collapsed .table-list')),
        reason: 'old max-height vertical-collapse rule must be removed',
      );
    },
  );

  test(
    'Tables sidebar: heading before loading skeleton; ids wired in app.js',
    () {
      final tablesHeadingIdx = htmlDart.indexOf('id="tables-heading-toggle"');
      final loadingIdx = htmlDart.indexOf('id="tables-loading"');
      // Must not use bare id="tables" — that matches id="tables-loading" first.
      final tablesListIdx = htmlDart.indexOf('<ul id="tables"');
      expect(tablesHeadingIdx, greaterThan(-1));
      expect(loadingIdx, greaterThan(-1));
      expect(tablesListIdx, greaterThan(-1));
      expect(
        tablesHeadingIdx,
        lessThan(loadingIdx),
        reason: 'Tables heading must precede loading state',
      );
      expect(
        loadingIdx,
        lessThan(tablesListIdx),
        reason: 'Loading skeleton must precede populated table list',
      );
      expect(htmlDart, contains('table-list tables-skeleton'));
      expect(htmlDart, contains('id="tables-loading-error"'));
      // Replaced old <p id="tables-loading">…</p> spinner line with skeleton under heading.
      expect(htmlDart, isNot(contains('<p id="tables-loading"')));
      expect(styleScss, contains('tables-skeleton-bar'));
      expect(styleScss, contains('tables-skeleton-shimmer'));
      expect(appJs, contains('getElementById("tables-loading")'));
      expect(appJs, contains('getElementById("tables-loading-error")'));
      expect(appJs, contains('wrap.querySelector(".tables-skeleton")'));
    },
  );
}
