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
      // Dictation mic ships hidden in markup; JS reveals it only when the
      // browser exposes the Web Speech API.
      expect(htmlDart, contains('id="nl-mic"'));
      expect(htmlDart, contains('<button type="button" id="nl-mic"'));
      expect(
        htmlDart,
        matches(RegExp(r'id="nl-mic"[^>]*\shidden')),
        reason:
            'mic must start hidden so unsupported browsers see no dead control',
      );
    },
  );

  test('NL modal script: speech recognition wiring and close-stops-mic', () {
    expect(appJs, contains('webkitSpeechRecognition'));
    expect(appJs, contains('getElementById("nl-mic")'));
    // Recognition must be aborted when the dialog closes so the mic stops.
    expect(appJs, contains('function stopNlMic'));
    expect(appJs, contains('function toggleNlMic'));
  });

  test('NL modal: copy-SQL and preview-results controls + wiring', () {
    expect(htmlDart, contains('id="nl-copy"'));
    expect(htmlDart, contains('id="nl-preview-run"'));
    expect(htmlDart, contains('id="nl-modal-results"'));
    // Sample-results container ships hidden; JS reveals it on a Preview run.
    expect(
      htmlDart,
      matches(RegExp(r'id="nl-modal-results"[^>]*\shidden')),
      reason: 'results container must start hidden until a preview runs',
    );
    expect(appJs, contains('getElementById("nl-copy")'));
    expect(appJs, contains('getElementById("nl-preview-run")'));
    // Phrase-coverage help: [i] button + panel that ships hidden, toggled by JS.
    expect(htmlDart, contains('id="nl-help"'));
    expect(htmlDart, contains('id="nl-help-panel"'));
    expect(
      htmlDart,
      matches(RegExp(r'id="nl-help-panel"[^>]*\shidden')),
      reason: 'help panel must start hidden until the [i] button reveals it',
    );
    expect(appJs, contains('function toggleNlHelp'));
    expect(appJs, contains('getElementById("nl-help")'));
    expect(styleScss, contains('.nl-help-panel'));
    // Help panel is searchable with collapsible groups.
    expect(htmlDart, contains('id="nl-help-search"'));
    expect(htmlDart, contains('class="nl-help-sec"'));
    expect(appJs, contains('function filterNlHelp'));
    expect(appJs, contains('getElementById("nl-help-search")'));
    expect(styleScss, contains('.nl-help-sec'));
    // Preview caps rows via a subquery wrapper, not by mutating the inner SQL.
    expect(appJs, contains('function previewNlResults'));
    expect(appJs, contains('function copyNlSql'));
    expect(styleScss, contains('.nl-modal-results'));
    expect(styleScss, contains('.nl-icon-btn'));
  });

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

  test('Single swappable sidebar: activity-bar panels, SCSS, JS wiring', () {
    expect(htmlDart, contains('id="app-layout"'));
    expect(htmlDart, contains('class="app-shell"'));
    expect(htmlDart, contains('id="toolbar-bar"'));
    expect(htmlDart, contains('id="app-sidebar"'));
    // The dedicated collapse icon is gone; the sidebar is hidden/shown and
    // resized via the drag bar instead (see sidebar-resize.ts).
    expect(htmlDart, isNot(contains('id="tb-sidebar-toggle"')));
    expect(htmlDart, contains('id="app-sidebar-resizer"'));
    // The sidebar is a single host that shows one panel at a time.
    expect(htmlDart, contains('data-active-panel="tables"'));
    expect(htmlDart, contains('data-panel="tables"'));
    expect(htmlDart, contains('data-panel="search"'));
    expect(
      htmlDart,
      contains('data-panel="history"'),
      reason: 'History is folded into the left sidebar as a panel',
    );
    // History panel selector reuses the #history-sidebar element + id.
    expect(htmlDart, contains('data-panel-btn="tables"'));
    expect(htmlDart, contains('data-panel-btn="history"'));
    expect(htmlDart, contains('id="history-sidebar"'));
    // Old two-sidebar markup is gone: no separate right-column history aside.
    expect(
      htmlDart,
      isNot(contains('class="history-sidebar" id="history-sidebar"')),
      reason: 'history is now a sidebar-section panel, not a right column',
    );

    // SCSS: collapse hook + panel-visibility driver.
    expect(styleScss, contains('app-sidebar-panel-collapsed'));
    expect(styleScss, contains('data-active-panel'));

    // JS: the panel module owns state, restores it, and toggles the class.
    expect(appJs, contains('saropa_sidebar_panel'));
    expect(appJs, contains('data-active-panel'));
    expect(appJs, contains('data-panel-btn'));
    expect(appJs, contains('app-sidebar-panel-collapsed'));
    // initSidebarPanels must be defined before it is called.
    final initFnDef = 'function initSidebarPanels';
    final initFnCall = RegExp(r'(?<!\w)initSidebarPanels\(\)');
    final defIndex = appJs.indexOf(initFnDef);
    final callMatch = initFnCall.firstMatch(appJs);
    expect(
      defIndex,
      greaterThanOrEqualTo(0),
      reason: 'initSidebarPanels must be defined in bundle.js',
    );
    expect(callMatch, isNotNull, reason: 'initSidebarPanels() must be called');
    expect(
      defIndex,
      lessThan(callMatch!.start),
      reason: 'initSidebarPanels must be defined before it is called',
    );
  });

  test(
    'Toolbar label toggle: data-labels, SCSS labeled mode, JS key + wiring',
    () {
      // Each toolbar icon button carries a short data-label word used to render
      // the label in "labeled" density mode. Spot-check a representative set
      // spanning data-tool launchers and the id-based toggles/actions.
      expect(htmlDart, contains('data-label="Home"'));
      expect(htmlDart, contains('data-label="Tables"'));
      expect(htmlDart, contains('data-label="SQL"'));
      expect(htmlDart, contains('data-label="Mask"'));
      expect(htmlDart, contains('data-label="Theme"'));
      expect(htmlDart, contains('data-label="History"'));
      // SCSS exposes the labeled-mode hook and renders the label from data-label.
      expect(styleScss, contains('tb-labeled'));
      expect(styleScss, contains('content: attr(data-label)'));
      // Bundle persists the chosen density and toggles on whitespace clicks.
      expect(appJs, contains('TOOLBAR_LABELS_KEY'));
      expect(appJs, contains('drift-viewer-toolbar-labels'));
      expect(appJs, contains('classList.toggle("tb-labeled")'));
    },
  );

  test('Tables sidebar heading matches History (no chevron; count span)', () {
    expect(
      htmlDart,
      contains('id="tables-count"'),
      reason: 'tables list count must mirror History sidebar pattern',
    );
    expect(
      htmlDart,
      contains('class="history-heading">Tables'),
      reason: 'Tables title uses same heading class as History',
    );
    expect(htmlDart, isNot(contains('id="tables-heading-toggle"')));
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
  });

  test(
    'Tables sidebar: heading before loading skeleton; ids wired in app.js',
    () {
      final tablesHeadingIdx = htmlDart.indexOf('id="tables-count"');
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
