// Contract tests for debug web viewer behavior (assets/web/app.js).
// Ensures the table-definition feature remains wired after refactors.

import 'dart:io';

import 'package:test/test.dart';

void main() {
  final String appJs = File(
    'assets/web/app.js',
  ).readAsStringSync().replaceAll('\r\n', '\n');

  test('buildTableDefinitionHtml and markup hooks exist in app.js', () {
    expect(
      appJs,
      contains('function buildTableDefinitionHtml'),
      reason: 'Column list renderer must stay in the viewer script',
    );
    expect(
      appJs,
      contains('table-definition-wrap'),
      reason: 'Styling hook for the definition panel',
    );
    expect(
      appJs,
      contains(
        'buildBothViewSectionsHtml(name, metaText, qbHtml, tableHtml, schema, defHtml)',
      ),
      reason: 'Search "both" layout must pass the definition fragment',
    );
  });

  test('Search both-path refresh includes table definition beside grid', () {
    expect(
      appJs,
      contains(
        "buildTableDefinitionHtml(currentTableName) + wrapDataTableInScroll",
      ),
      reason:
          'renderSchemaContent / loadBothView must match table-tab definition UX',
    );
  });
}
