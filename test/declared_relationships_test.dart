// Tests for Feature 78 — host-declared relationship manifest channel.
//
// Exercises GET /api/schema/relationships via the real DriftDebugServer: a
// supplied declaredRelationships callback is serialized (label emitted only
// when present); no callback reports available:false; a throwing callback
// returns 500.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

import 'helpers/test_helpers.dart';

void main() {
  group('GET /api/schema/relationships', () {
    int? port;

    final mockQuery = mockQueryWithTables(
      tableColumns: {
        'contacts': [
          <String, dynamic>{'name': 'id', 'type': 'INTEGER', 'pk': 1},
        ],
      },
    );

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
    });

    test('serializes a supplied manifest, omitting null labels', () async {
      DeclaredRelationships manifest() => const <DeclaredRelationship>[
        DeclaredRelationship(
          fromTable: 'phones',
          fromColumn: 'contactSaropaUUID',
          toTable: 'contacts',
          toColumn: 'saropaUUID',
          label: 'contact → phones',
        ),
        DeclaredRelationship(
          fromTable: 'emails',
          fromColumn: 'contactSaropaUUID',
          toTable: 'contacts',
          toColumn: 'saropaUUID',
        ),
        // A non-joinable edge (e.g. a JSON-array list_ref) — orphanCheckable
        // false must round-trip so the orphan-row check can skip it.
        DeclaredRelationship(
          fromTable: 'groups',
          fromColumn: 'memberUUIDs',
          toTable: 'contacts',
          toColumn: 'saropaUUID',
          orphanCheckable: false,
        ),
      ];

      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        declaredRelationships: manifest,
      );
      port = DriftDebugServer.port;

      final res = await httpGet(port!, '/api/schema/relationships');
      expect(res.status, 200);
      final body = res.body as Map;
      expect(body['available'], true);

      final rels = body['relationships'] as List;
      expect(rels.length, 3);

      final phones = rels.first as Map;
      expect(phones['fromTable'], 'phones');
      expect(phones['fromColumn'], 'contactSaropaUUID');
      expect(phones['toTable'], 'contacts');
      expect(phones['toColumn'], 'saropaUUID');
      expect(phones['label'], 'contact → phones');
      // Default orphanCheckable (true) is omitted, not emitted as true.
      expect(phones.containsKey('orphanCheckable'), false);

      // Second edge supplied no label → key omitted (conditional emission).
      final emails = rels[1] as Map;
      expect(emails.containsKey('label'), false);
      expect(emails.containsKey('orphanCheckable'), false);

      // Third edge is non-joinable → orphanCheckable:false is carried.
      final groups = rels[2] as Map;
      expect(groups['orphanCheckable'], false);
    });

    test('reports available:false when no callback is supplied', () async {
      await DriftDebugServer.start(query: mockQuery, enabled: true, port: 0);
      port = DriftDebugServer.port;

      final res = await httpGet(port!, '/api/schema/relationships');
      expect(res.status, 200);
      final body = res.body as Map;
      expect(body['available'], false);
      expect((body['relationships'] as List).isEmpty, isTrue);
    });

    test('returns 500 when the host callback throws', () async {
      DeclaredRelationships manifest() => throw StateError('boom');

      await DriftDebugServer.start(
        query: mockQuery,
        enabled: true,
        port: 0,
        declaredRelationships: manifest,
      );
      port = DriftDebugServer.port;

      final res = await httpGet(port!, '/api/schema/relationships');
      expect(res.status, 500);
      expect((res.body as Map)['error'], isNotNull);
    });
  });
}
