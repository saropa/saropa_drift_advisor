// Tests for DriftDebugImportResult: JSON serialization and toString.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/drift_debug_import_result.dart';

void main() {
  group('DriftDebugImportResult', () {
    test('toJson returns correct map structure', () {
      final result = DriftDebugImportResult(
        imported: 5,
        errors: <String>['Row 2: constraint violation'],
        format: 'json',
        table: 'users',
      );

      final json = result.toJson();
      expect(json['imported'], 5);
      expect(json['errors'], hasLength(1));
      expect(json['errors'][0], contains('constraint'));
      expect(json['format'], 'json');
      expect(json['table'], 'users');
    });

    test('toJson with empty errors list', () {
      final result = DriftDebugImportResult(
        imported: 10,
        errors: <String>[],
        format: 'csv',
        table: 'items',
      );

      final json = result.toJson();
      expect(json['imported'], 10);
      expect(json['errors'], isEmpty);
    });

    test(
      'toString includes format, table, imported count, and error count',
      () {
        final result = DriftDebugImportResult(
          imported: 3,
          errors: <String>['err1', 'err2'],
          format: 'sql',
          table: 'data',
        );

        final str = result.toString();
        expect(str, contains('sql'));
        expect(str, contains('data'));
        expect(str, contains('3'));
        expect(str, contains('2'));
      },
    );
  });
}
