// Contract tests for the debug web viewer "Ask in English" NL→SQL flow.
// Guards modal markup (html_content) and script wiring (app.js) after refactors.

import 'dart:io';

import 'package:test/test.dart';

void main() {
  final String appJs =
      File('assets/web/app.js').readAsStringSync().replaceAll('\r\n', '\n');
  final String htmlDart = File('lib/src/server/html_content.dart')
      .readAsStringSync()
      .replaceAll('\r\n', '\n');

  test('NL modal shell: compact trigger and preview field, no legacy inline row', () {
    expect(htmlDart, contains('id="nl-open"'));
    expect(htmlDart, contains('id="nl-modal-sql-preview"'));
    expect(htmlDart, contains('id="nl-modal-input"'));
    expect(htmlDart, isNot(contains('id="nl-input"')));
    expect(htmlDart, isNot(contains('id="nl-convert"')));
  });

  test('NL modal script: preview-only live path and Use copies to sql-input', () {
    expect(appJs, contains('function applyNlLivePreview'));
    expect(appJs, contains('function scheduleNlLivePreview'));
    expect(appJs, contains("getElementById('nl-modal-sql-preview')"));
    expect(appJs, contains('async function useNlModal'));
    expect(appJs, contains('function setNlModalError'));
    expect(appJs, isNot(contains("getElementById('nl-input')")));
    expect(appJs, isNot(contains("getElementById('nl-convert')")));
  });

  test('App sidebar toggle: shell IDs and JS wire label element before use', () {
    expect(htmlDart, contains('id="app-layout"'));
    expect(htmlDart, contains('id="app-sidebar"'));
    expect(htmlDart, contains('id="app-sidebar-toggle"'));
    expect(htmlDart, contains('id="app-sidebar-toggle-label"'));
    expect(
      htmlDart,
      isNot(contains('toolbar button above')),
      reason: 'sidebar no longer duplicates Export-tab directions',
    );
    final labelDecl = "var label = document.getElementById('app-sidebar-toggle-label')";
    final labelUse = 'if (label) label.textContent';
    expect(
      appJs.indexOf(labelDecl),
      lessThan(appJs.indexOf(labelUse)),
      reason: 'label must be declared before applyAppSidebarCollapsed uses it',
    );
  });
}
