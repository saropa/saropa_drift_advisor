// Unit tests for GenerationHandler — getCurrentGeneration semantics.
//
// Tests the data-returning method directly with a minimal ServerContext.

import 'package:saropa_drift_advisor/src/server/generation_handler.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('GenerationHandler', () {
    group('getCurrentGeneration', () {
      test('returns current generation value', () async {
        final ctx = createTestContext();
        final handler = GenerationHandler(ctx);

        // Initial generation is 0.
        final gen = await handler.getCurrentGeneration();
        expect(gen, 0);
      });

      test('returns bumped generation when data has changed', () async {
        // Simulate a data change: the first checkDataChange call
        // establishes a baseline signature, subsequent calls with a
        // different signature bump the generation.
        var callCount = 0;
        final ctx = createTestContext(
          query: (sql) async {
            // Table names query.
            if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
              return [
                {'name': 'items'}
              ];
            }
            // UNION ALL signature query — return different counts
            // to simulate a data change.
            if (sql.contains('UNION ALL') || sql.contains("AS t")) {
              callCount++;
              return [
                {'t': 'items', 'c': callCount}
              ];
            }
            return <Map<String, dynamic>>[];
          },
        );
        final handler = GenerationHandler(ctx);

        // First call establishes baseline (generation stays 0).
        final gen1 = await handler.getCurrentGeneration();
        expect(gen1, 0);

        // Second call detects a change (count changed from 1 to 2).
        final gen2 = await handler.getCurrentGeneration();
        expect(gen2, 1);
      });

      test('returns 0 when schema has no tables', () async {
        final ctx = createTestContext(
          query: (sql) async {
            if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
              return <Map<String, dynamic>>[];
            }
            return <Map<String, dynamic>>[];
          },
        );
        final handler = GenerationHandler(ctx);

        final gen = await handler.getCurrentGeneration();
        expect(gen, 0);
      });
    });
  });
}
