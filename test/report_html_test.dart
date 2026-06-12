// Unit tests for the portable-report HTML builder (Feature 25, server side).
//
// The builder embeds the database snapshot as a JSON island and renders it
// client-side via textContent, so the assertions here pin the document
// structure, the JSON embedding, and the `</script>` break-out guard rather
// than rendered pixels (which only a browser can show).

import 'dart:convert';

import 'package:saropa_drift_advisor/src/server/report_html.dart';
import 'package:test/test.dart';

/// Extracts the JSON payload embedded in the `report-data` script tag.
Map<String, dynamic> _embeddedData(String html) {
  final RegExp re = RegExp(
    r'<script id="report-data" type="application/json">(.*?)</script>',
    dotAll: true,
  );
  final RegExpMatch? m = re.firstMatch(html);
  expect(m, isNotNull, reason: 'report-data script island must be present');
  // Undo the `</` → `<\/` break-out guard before decoding.
  final String raw = m!.group(1)!.replaceAll(r'<\/', '</');
  return jsonDecode(raw) as Map<String, dynamic>;
}

void main() {
  group('ReportHtmlBuilder', () {
    ReportTableData table({
      String name = 'users',
      List<String>? columns,
      List<Map<String, dynamic>>? rows,
      int? total,
    }) {
      final List<Map<String, dynamic>> r =
          rows ??
          <Map<String, dynamic>>[
            <String, dynamic>{'id': 1, 'name': 'Eve'},
          ];
      return ReportTableData(
        name: name,
        columns: columns ?? <String>['id', 'name'],
        rows: r,
        totalRowCount: total ?? r.length,
        truncated: (total ?? r.length) > r.length,
      );
    }

    test('produces a complete HTML document', () {
      final String html = ReportHtmlBuilder.build(
        generatedAt: '2026-06-12T10:00:00.000',
        serverHost: 'localhost:8642',
        tables: <ReportTableData>[table()],
      );
      expect(html, startsWith('<!DOCTYPE html>'));
      expect(html, contains('<html lang="en">'));
      expect(html.trimRight(), endsWith('</html>'));
      expect(html, contains('Saropa Drift Advisor Report'));
    });

    test('embeds the table data as JSON', () {
      final String html = ReportHtmlBuilder.build(
        generatedAt: 'now',
        serverHost: 'host',
        tables: <ReportTableData>[
          table(
            rows: <Map<String, dynamic>>[
              <String, dynamic>{'id': 7, 'name': 'Mallory'},
            ],
            total: 7,
          ),
        ],
      );
      final Map<String, dynamic> data = _embeddedData(html);
      final List<dynamic> tables = data['tables'] as List<dynamic>;
      expect(tables.length, 1);
      final Map<String, dynamic> t = tables.first as Map<String, dynamic>;
      expect(t['name'], 'users');
      expect(t['totalRowCount'], 7);
      expect(t['truncated'], true); // total 7 > 1 embedded row
      expect((t['rows'] as List<dynamic>).first['name'], 'Mallory');
    });

    test('neutralizes a value containing </script> so it cannot break out', () {
      // A cell literally containing `</script><script>alert(1)</script>` must
      // not terminate the data island — the `</` guard turns it into text.
      const String attack = '</script><script>alert(1)</script>';
      final String html = ReportHtmlBuilder.build(
        generatedAt: 'now',
        serverHost: 'host',
        tables: <ReportTableData>[
          table(
            rows: <Map<String, dynamic>>[
              <String, dynamic>{'id': 1, 'name': attack},
            ],
          ),
        ],
      );
      // The raw substring `</script>` appears only as the genuine closing tags
      // of the two <script> elements, never inside the embedded payload.
      expect(
        '</script>'.allMatches(html).length,
        2,
        reason: 'only the data-island and behavior scripts close the tag',
      );
      // The attack still round-trips intact as data once unescaped.
      final Map<String, dynamic> data = _embeddedData(html);
      expect(
        (data['tables'] as List<dynamic>).first['rows'][0]['name'],
        attack,
      );
    });

    test('omits schema and anomaly sections when not supplied', () {
      final String html = ReportHtmlBuilder.build(
        generatedAt: 'now',
        serverHost: 'host',
        tables: <ReportTableData>[table()],
      );
      final Map<String, dynamic> data = _embeddedData(html);
      expect(data['schema'], isNull);
      expect((data['anomalies'] as List<dynamic>), isEmpty);
    });

    test('includes schema and anomalies when supplied', () {
      final String html = ReportHtmlBuilder.build(
        generatedAt: 'now',
        serverHost: 'host',
        tables: <ReportTableData>[table()],
        schemaSql: 'CREATE TABLE users (id INTEGER);',
        anomalies: <Map<String, dynamic>>[
          <String, dynamic>{
            'table': 'users',
            'column': 'email',
            'severity': 'warning',
            'message': 'empty string',
          },
        ],
      );
      final Map<String, dynamic> data = _embeddedData(html);
      expect(data['schema'], contains('CREATE TABLE users'));
      final List<dynamic> anomalies = data['anomalies'] as List<dynamic>;
      expect(anomalies.length, 1);
      expect((anomalies.first as Map<String, dynamic>)['severity'], 'warning');
    });

    test('handles a zero-table report without error', () {
      final String html = ReportHtmlBuilder.build(
        generatedAt: 'now',
        serverHost: 'host',
        tables: <ReportTableData>[],
      );
      final Map<String, dynamic> data = _embeddedData(html);
      expect((data['tables'] as List<dynamic>), isEmpty);
      expect(html, contains('<nav id="table-list"'));
    });
  });
}
