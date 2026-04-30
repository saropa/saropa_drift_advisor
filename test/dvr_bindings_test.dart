// Unit tests for [dvr_bindings] JSON-safe normalization.
library;

import 'package:saropa_drift_advisor/src/dvr_bindings.dart';
import 'package:test/test.dart';

void main() {
  group('dvrParamsFromDeclarations', () {
    test('returns null when both lists empty', () {
      expect(dvrParamsFromDeclarations(positional: [], named: {}), isNull);
    });

    test('normalizes positional and named args', () {
      final r = dvrParamsFromDeclarations(
        positional: <dynamic>[1, 'hi'],
        named: <String, dynamic>{'k': true},
      );
      expect(r, isNotNull);
      expect(r!.params['positional'], [1, 'hi']);
      expect(r.params['named'], {'k': true});
      expect(r.truncated, isFalse);
    });
  });
}
