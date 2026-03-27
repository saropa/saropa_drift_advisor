// Contract tests for the debug web viewer shell: NL→SQL modal markup and
// layout toggles (html_content.dart, app.js, style.scss). Catches accidental ID renames.

import 'dart:io';

import 'package:test/test.dart';

void main() {
  final String appJs = File(
    'assets/web/app.js',
  ).readAsStringSync().replaceAll('\r\n', '\n');
  final String htmlDart = File(
    'lib/src/server/html_content.dart',
  ).readAsStringSync().replaceAll('\r\n', '\n');
  final String styleScss = File(
    'assets/web/style.scss',
  ).readAsStringSync().replaceAll('\r\n', '\n');

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
      expect(appJs, contains("getElementById('nl-modal-sql-preview')"));
      expect(appJs, contains('async function useNlModal'));
      expect(appJs, contains('function setNlModalError'));
      expect(appJs, isNot(contains("getElementById('nl-input')")));
      expect(appJs, isNot(contains("getElementById('nl-convert')")));
    },
  );

  test('App sidebar panel toggle: HTML ids, SCSS hook, JS key and toggle', () {
    expect(htmlDart, contains('id="app-layout"'));
    expect(htmlDart, contains('id="app-sidebar"'));
    expect(htmlDart, contains('id="app-sidebar-toggle"'));
    expect(htmlDart, contains('id="app-sidebar-toggle-icon"'));
    expect(htmlDart, contains('id="app-sidebar-toggle-label"'));
    expect(
      htmlDart,
      isNot(contains('toolbar button above')),
      reason: 'sidebar no longer duplicates Export-tab directions',
    );
    expect(styleScss, contains('app-sidebar-panel-collapsed'));
    expect(appJs, contains('APP_SIDEBAR_PANEL_KEY'));
    expect(appJs, contains('saropa_app_sidebar_collapsed'));
    expect(appJs, contains("classList.toggle('app-sidebar-panel-collapsed'"));
    final initFn = 'function initAppSidebarPanelToggle';
    final toggleLine = "classList.toggle('app-sidebar-panel-collapsed'";
    expect(
      appJs.indexOf(initFn),
      lessThan(appJs.indexOf(toggleLine)),
      reason:
          'initializer must define applyAppSidebarCollapsed before toggle() runs',
    );
  });
}
