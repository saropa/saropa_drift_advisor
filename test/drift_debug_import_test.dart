// Tests for DriftDebugImportProcessor: CSV, JSON, and SQL import
// processing, error collection, and CSV parsing edge cases.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/drift_debug_import.dart';

void main() {
  // Stateless processor, safe to reuse across tests.
  const processor = DriftDebugImportProcessor();

  /// Simple SQL literal escape for test use: wraps strings in
  /// single quotes with ' -> '' escaping, passes numbers through,
  /// returns 'NULL' for null.
  String testSqlLiteral(dynamic value) {
    if (value == null) return 'NULL';
    if (value is num) return value.toString();
    final escaped = value.toString().replaceAll("'", "''");
    return "'$escaped'";
  }

  group('DriftDebugImportProcessor', () {
    group('JSON import', () {
      test('imports a valid JSON array of objects', () async {
        final executedSql = <String>[];

        final result = await processor.processImport(
          format: 'json',
          data: '[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]',
          table: 'users',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 2);
        expect(result.errors, isEmpty);
        expect(result.format, 'json');
        expect(result.table, 'users');
        expect(executedSql, hasLength(2));

        // Verify SQL structure includes table name and column names.
        expect(executedSql[0], contains('"users"'));
        expect(executedSql[0], contains('"id"'));
        expect(executedSql[0], contains('"name"'));
      });

      test('collects per-row errors when writeQuery throws', () async {
        int callCount = 0;

        final result = await processor.processImport(
          format: 'json',
          data: '[{"id": 1}, {"id": 2}, {"id": 3}]',
          table: 'items',
          writeQuery: (sql) async {
            callCount++;
            // Fail on the second row.
            if (callCount == 2) throw Exception('constraint violation');
          },
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 2);
        expect(result.errors, hasLength(1));
        expect(result.errors[0], contains('Row 1'));
        expect(result.errors[0], contains('constraint violation'));
      });

      test('reports error for non-object array elements', () async {
        final result = await processor.processImport(
          format: 'json',
          data: '[{"id": 1}, "not an object", {"id": 3}]',
          table: 'items',
          writeQuery: (sql) async {},
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 2);
        expect(result.errors, hasLength(1));
        expect(result.errors[0], contains('Row 1'));
        expect(result.errors[0], contains('not an object'));
      });

      test('throws FormatException for non-array JSON', () async {
        expect(
          () => processor.processImport(
            format: 'json',
            data: '{"key": "value"}',
            table: 'items',
            writeQuery: (sql) async {},
            sqlLiteral: testSqlLiteral,
          ),
          throwsA(isA<FormatException>().having(
            (e) => e.message,
            'message',
            contains('array'),
          )),
        );
      });

      test('throws FormatException for invalid JSON', () async {
        expect(
          () => processor.processImport(
            format: 'json',
            data: '{not valid json',
            table: 'items',
            writeQuery: (sql) async {},
            sqlLiteral: testSqlLiteral,
          ),
          throwsA(isA<FormatException>()),
        );
      });

      test('handles empty JSON array (zero rows)', () async {
        final result = await processor.processImport(
          format: 'json',
          data: '[]',
          table: 'items',
          writeQuery: (sql) async {},
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 0);
        expect(result.errors, isEmpty);
      });
    });

    group('CSV import', () {
      test('imports valid CSV with header and data rows', () async {
        final executedSql = <String>[];

        final result = await processor.processImport(
          format: 'csv',
          data: 'id,name\n1,Alice\n2,Bob',
          table: 'users',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 2);
        expect(result.errors, isEmpty);
        expect(result.format, 'csv');
        expect(executedSql, hasLength(2));
      });

      test('reports column count mismatch as error', () async {
        final result = await processor.processImport(
          format: 'csv',
          data: 'id,name\n1,Alice\n2',
          table: 'users',
          writeQuery: (sql) async {},
          sqlLiteral: testSqlLiteral,
        );

        // Row with mismatched columns is skipped.
        expect(result.imported, 1);
        expect(result.errors, hasLength(1));
        expect(result.errors[0], contains('column count mismatch'));
      });

      test('throws FormatException for header-only CSV', () async {
        expect(
          () => processor.processImport(
            format: 'csv',
            data: 'id,name',
            table: 'items',
            writeQuery: (sql) async {},
            sqlLiteral: testSqlLiteral,
          ),
          throwsA(isA<FormatException>().having(
            (e) => e.message,
            'message',
            contains('header row'),
          )),
        );
      });

      test('throws FormatException for empty CSV', () async {
        expect(
          () => processor.processImport(
            format: 'csv',
            data: '',
            table: 'items',
            writeQuery: (sql) async {},
            sqlLiteral: testSqlLiteral,
          ),
          throwsA(isA<FormatException>()),
        );
      });

      test('handles quoted CSV fields with embedded commas', () async {
        final executedSql = <String>[];

        final result = await processor.processImport(
          format: 'csv',
          data: 'id,name\n1,"Smith, John"\n2,"Doe, Jane"',
          table: 'users',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 2);
        expect(result.errors, isEmpty);

        // The SQL should contain the full unquoted name.
        expect(executedSql[0], contains('Smith, John'));
      });

      test('CSV with columnMapping maps headers to table columns', () async {
        final executedSql = <String>[];

        // CSV has user_id, full_name but table has id, name.
        final result = await processor.processImport(
          format: 'csv',
          data: 'user_id,full_name\n1,Alice\n2,Bob',
          table: 'users',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
          csvColumnMapping: {'user_id': 'id', 'full_name': 'name'},
        );

        expect(result.imported, 2);
        expect(result.errors, isEmpty);
        expect(executedSql[0], contains('"id"'));
        expect(executedSql[0], contains('"name"'));
        expect(executedSql[0], isNot(contains('user_id')));
        expect(executedSql[0], contains("'1'"));
        expect(executedSql[0], contains("'Alice'"));
      });

      test('CSV columnMapping skips unmapped CSV columns', () async {
        final executedSql = <String>[];

        final result = await processor.processImport(
          format: 'csv',
          data: 'id,name,extra\n1,Alice,skip\n2,Bob,skip',
          table: 'users',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
          csvColumnMapping: {'id': 'id', 'name': 'name'},
        );

        expect(result.imported, 2);
        expect(result.errors, isEmpty);
        expect(executedSql[0], contains('"id"'));
        expect(executedSql[0], contains('"name"'));
        expect(executedSql[0], isNot(contains('extra')));
      });

      test('CSV columnMapping duplicate table column: last mapping wins', () async {
        final executedSql = <String>[];

        final result = await processor.processImport(
          format: 'csv',
          data: 'a,b\n1,2',
          table: 't',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
          csvColumnMapping: {'a': 'id', 'b': 'id'},
        );

        expect(result.imported, 1);
        expect(result.errors, isEmpty);
        expect(executedSql[0], contains('"id"'));
        expect(executedSql[0], contains("'2'")); // b wins
      });
    });

    group('SQL import', () {
      test('executes semicolon-separated SQL statements', () async {
        final executedSql = <String>[];

        final result = await processor.processImport(
          format: 'sql',
          data:
              'INSERT INTO items (id) VALUES (1); INSERT INTO items (id) VALUES (2)',
          table: 'items',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 2);
        expect(result.errors, isEmpty);
        expect(result.format, 'sql');
      });

      test('collects errors for failing statements', () async {
        int callCount = 0;

        final result = await processor.processImport(
          format: 'sql',
          data: 'INSERT INTO items VALUES (1); INSERT INTO items VALUES (2)',
          table: 'items',
          writeQuery: (sql) async {
            callCount++;
            if (callCount == 1) throw Exception('syntax error');
          },
          sqlLiteral: testSqlLiteral,
        );

        expect(result.imported, 1);
        expect(result.errors, hasLength(1));
        expect(result.errors[0], contains('Statement error'));
      });

      test('skips empty segments after splitting on semicolons', () async {
        final executedSql = <String>[];

        final result = await processor.processImport(
          format: 'sql',
          data: 'INSERT INTO items VALUES (1);;;',
          table: 'items',
          writeQuery: (sql) async => executedSql.add(sql),
          sqlLiteral: testSqlLiteral,
        );

        // Only one non-empty statement after splitting.
        expect(result.imported, 1);
        expect(executedSql, hasLength(1));
      });
    });

    group('unsupported format', () {
      test('throws FormatException for unknown format', () async {
        expect(
          () => processor.processImport(
            format: 'xml',
            data: '<data/>',
            table: 'items',
            writeQuery: (sql) async {},
            sqlLiteral: testSqlLiteral,
          ),
          throwsA(isA<FormatException>().having(
            (e) => e.message,
            'message',
            contains('Unsupported format'),
          )),
        );
      });
    });

    test('toString returns class name', () {
      expect(processor.toString(), 'DriftDebugImportProcessor()');
    });
  });

  group('parseCsvLines', () {
    test('parses simple CSV', () {
      final rows = DriftDebugImportProcessor.parseCsvLines('a,b,c\n1,2,3');
      expect(rows, hasLength(2));
      expect(rows[0], ['a', 'b', 'c']);
      expect(rows[1], ['1', '2', '3']);
    });

    test('handles quoted fields with embedded commas', () {
      final rows =
          DriftDebugImportProcessor.parseCsvLines('name,value\n"a,b",c');
      expect(rows, hasLength(2));
      expect(rows[1][0], 'a,b');
      expect(rows[1][1], 'c');
    });

    test('handles escaped double quotes inside quoted fields', () {
      final rows =
          DriftDebugImportProcessor.parseCsvLines('name\n"he said ""hi"""');
      expect(rows, hasLength(2));
      expect(rows[1][0], 'he said "hi"');
    });

    test('strips UTF-8 BOM', () {
      final bom = String.fromCharCode(0xFEFF);
      final rows =
          DriftDebugImportProcessor.parseCsvLines('${bom}id,name\n1,test');
      expect(rows, hasLength(2));
      expect(rows[0][0], 'id');
    });

    test('normalizes CR+LF line endings', () {
      final rows = DriftDebugImportProcessor.parseCsvLines('a,b\r\n1,2\r\n3,4');
      expect(rows, hasLength(3));
    });

    test('normalizes bare CR line endings', () {
      final rows = DriftDebugImportProcessor.parseCsvLines('a,b\r1,2\r3,4');
      expect(rows, hasLength(3));
    });

    test('skips empty lines', () {
      final rows =
          DriftDebugImportProcessor.parseCsvLines('a,b\n\n1,2\n\n3,4\n\n');
      expect(rows, hasLength(3));
    });

    test('trims field values', () {
      final rows = DriftDebugImportProcessor.parseCsvLines('a , b \n 1 , 2 ');
      expect(rows[0], ['a', 'b']);
      expect(rows[1], ['1', '2']);
    });

    test('returns empty list for empty input', () {
      expect(DriftDebugImportProcessor.parseCsvLines(''), isEmpty);
    });

    test('returns empty list for whitespace-only input', () {
      expect(DriftDebugImportProcessor.parseCsvLines('  \n  \n  '), isEmpty);
    });
  });
}
