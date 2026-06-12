// Tests for the soft-relationship advisory (Feature 77).
//
// Two layers:
//  1. Detector unit tests over a controllable mock query — declared-FK and
//     manifest subtraction, severity, opt-in manifestAvailable payload.
//  2. The `/api/issues` merge + dedicated-result path through AnalyticsHandler.
//  3. Cross-impl contract: the Dart inference fed the exact `contactsApp` /
//     `relational` column shapes the web `inferForeignKeys` suite uses, so the
//     two copies of the two rules cannot silently drift.

import 'package:saropa_drift_advisor/src/server/analytics_handler.dart';
import 'package:saropa_drift_advisor/src/server/server_typedefs.dart';
import 'package:saropa_drift_advisor/src/server/server_types.dart';
import 'package:saropa_drift_advisor/src/server/soft_relationship_detector.dart';
import 'package:test/test.dart';

import 'helpers/test_helpers.dart';

/// Builds a mock query that reports [tables] (name → ordered column defs, each
/// `{name, pk?}`) for the table-names + `PRAGMA table_info` queries, and
/// [foreignKeys] (table → list of `{table, from, to}`) for
/// `PRAGMA foreign_key_list`. Everything else returns empty.
DriftDebugQuery _schemaQuery(
  Map<String, List<Map<String, dynamic>>> tables, {
  Map<String, List<Map<String, dynamic>>> foreignKeys =
      const <String, List<Map<String, dynamic>>>{},
}) {
  return (String sql) async {
    if (sql.contains("type='table'") && sql.contains('ORDER BY name')) {
      return tables.keys
          .map((name) => <String, dynamic>{'name': name})
          .toList();
    }
    final infoMatch = RegExp(r'PRAGMA table_info\("?(\w+)"?\)').firstMatch(sql);
    if (infoMatch != null) {
      final cols = tables[infoMatch.group(1)] ?? const <Map<String, dynamic>>[];
      return cols
          .asMap()
          .entries
          .map(
            (e) => <String, dynamic>{
              'cid': e.key,
              'name': e.value['name'],
              'type': e.value['type'] ?? 'TEXT',
              'notnull': 0,
              'dflt_value': null,
              'pk': e.value['pk'] ?? 0,
            },
          )
          .toList();
    }
    final fkMatch = RegExp(
      r'PRAGMA foreign_key_list\("?(\w+)"?\)',
    ).firstMatch(sql);
    if (fkMatch != null) {
      return foreignKeys[fkMatch.group(1)] ?? const <Map<String, dynamic>>[];
    }
    return <Map<String, dynamic>>[];
  };
}

/// A `{name, pk?}` column def for [_schemaQuery].
Map<String, dynamic> _col(String name, {bool pk = false}) => <String, dynamic>{
  'name': name,
  if (pk) 'pk': 1,
};

/// Edge identity helper for assertions, matching the detector's key scheme.
String _edge(Map<String, dynamic> f) => SoftRelationshipDetector.edgeKey(
  f['fromTable'] as String,
  f['fromColumn'] as String,
  f['toTable'] as String,
  f['toColumn'] as String,
);

void main() {
  // The Saropa Contacts shape: shared contactSaropaUUID across contacts (owner),
  // contact_points, connections; organizations/calendar_events carry no link.
  final contactsAppTables = <String, List<Map<String, dynamic>>>{
    'contacts': [
      _col('id', pk: true),
      _col('contactSaropaUUID'),
      _col('givenName'),
    ],
    'contact_points': [
      _col('id', pk: true),
      _col('contactSaropaUUID'),
      _col('points'),
    ],
    'organizations': [_col('id', pk: true), _col('organizationName')],
    'calendar_events': [_col('id', pk: true), _col('eventStart')],
    'connections': [
      _col('id', pk: true),
      _col('contactSaropaUUID'),
      _col('emailAddress'),
    ],
  };

  // The normalized shape: declared INTEGER FKs (phones→contacts,
  // contacts→companies, contacts.manager_id→contacts self-ref).
  final relationalTables = <String, List<Map<String, dynamic>>>{
    'companies': [_col('id', pk: true), _col('name')],
    'contacts': [
      _col('id', pk: true),
      _col('name'),
      _col('company_id'),
      _col('manager_id'),
    ],
    'phones': [_col('id', pk: true), _col('contact_id'), _col('number')],
  };
  final relationalFks = <String, List<Map<String, dynamic>>>{
    'phones': [
      {'table': 'contacts', 'from': 'contact_id', 'to': 'id'},
    ],
    'contacts': [
      {'table': 'companies', 'from': 'company_id', 'to': 'id'},
      {'table': 'contacts', 'from': 'manager_id', 'to': 'id'},
    ],
  };

  group('SoftRelationshipDetector.getSoftRelationshipsResult', () {
    test(
      'shared-UUID schema yields one shared_uuid edge per non-owner carrier',
      () async {
        final result =
            await SoftRelationshipDetector.getSoftRelationshipsResult(
              _schemaQuery(contactsAppTables),
              manifest: null,
            );

        final findings = (result['softRelationships'] as List)
            .cast<Map<String, dynamic>>();
        // contact_points + connections reference contacts; organizations and
        // calendar_events have no UUID column, so exactly two edges.
        expect(findings, hasLength(2));
        final edges = findings.map(_edge).toSet();
        expect(
          edges,
          equals(<String>{
            SoftRelationshipDetector.edgeKey(
              'contact_points',
              'contactSaropaUUID',
              'contacts',
              'contactSaropaUUID',
            ),
            SoftRelationshipDetector.edgeKey(
              'connections',
              'contactSaropaUUID',
              'contacts',
              'contactSaropaUUID',
            ),
          }),
        );
        for (final f in findings) {
          expect(f['rule'], SoftRelationshipDetector.ruleSharedUuid);
          expect(f['severity'], 'info');
          expect(f['type'], 'soft_relationship');
          expect(f['toTable'], 'contacts');
          expect(f['message'], contains('shared UUID identity column'));
          // No DDL remedy — the fix is the manifest, not a CREATE statement.
          expect(f.containsKey('suggestedSql'), isFalse);
        }
        expect(result['manifestAvailable'], isFalse);
        expect(result['declaredFkCount'], 0);
        expect(result['tablesScanned'], 5);
      },
    );

    test(
      '<noun>_id reference resolves to the right parent with noun_id rule',
      () async {
        // No declared FKs supplied → the noun_id inference must surface them.
        final result =
            await SoftRelationshipDetector.getSoftRelationshipsResult(
              _schemaQuery(relationalTables),
              manifest: null,
            );

        final findings = (result['softRelationships'] as List)
            .cast<Map<String, dynamic>>();
        final edges = findings.map(_edge).toSet();
        // contact_id → contacts, company_id → companies. manager_id has no
        // "manager" table so it infers nothing.
        expect(
          edges,
          containsAll(<String>{
            SoftRelationshipDetector.edgeKey(
              'phones',
              'contact_id',
              'contacts',
              'id',
            ),
            SoftRelationshipDetector.edgeKey(
              'contacts',
              'company_id',
              'companies',
              'id',
            ),
          }),
        );
        expect(
          edges.contains(
            SoftRelationshipDetector.edgeKey(
              'contacts',
              'manager_id',
              'contacts',
              'id',
            ),
          ),
          isFalse,
        );
        for (final f in findings) {
          expect(f['rule'], SoftRelationshipDetector.ruleNounId);
        }
      },
    );

    test(
      'declared SQLite FKs are subtracted (no finding for a declared edge)',
      () async {
        final result =
            await SoftRelationshipDetector.getSoftRelationshipsResult(
              _schemaQuery(relationalTables, foreignKeys: relationalFks),
              manifest: null,
            );

        final findings = (result['softRelationships'] as List)
            .cast<Map<String, dynamic>>();
        // Every inferable edge is already a declared FK → nothing left to report.
        expect(findings, isEmpty);
        expect(result['declaredFkCount'], 3);
      },
    );

    test('a manifest covering an edge resolves it (not reported)', () async {
      final manifest = <DeclaredRelationship>[
        const DeclaredRelationship(
          fromTable: 'contact_points',
          fromColumn: 'contactSaropaUUID',
          toTable: 'contacts',
          toColumn: 'contactSaropaUUID',
        ),
      ];

      final result = await SoftRelationshipDetector.getSoftRelationshipsResult(
        _schemaQuery(contactsAppTables),
        manifest: manifest,
      );

      final findings = (result['softRelationships'] as List)
          .cast<Map<String, dynamic>>();
      // The manifested contact_points edge is resolved; connections remains.
      expect(findings, hasLength(1));
      expect(findings.single['fromTable'], 'connections');
      expect(result['manifestAvailable'], isTrue);
    });

    test('empty manifest is still "available" and subtracts nothing', () async {
      final result = await SoftRelationshipDetector.getSoftRelationshipsResult(
        _schemaQuery(contactsAppTables),
        manifest: const <DeclaredRelationship>[],
      );

      expect(result['manifestAvailable'], isTrue);
      expect((result['softRelationships'] as List), hasLength(2));
    });
  });

  group('AnalyticsHandler soft-relationship issues', () {
    test('getIssuesList includes soft_relationship issues', () async {
      final ctx = createTestContext();
      final handler = AnalyticsHandler(ctx);

      final result = await handler.getIssuesList(
        _schemaQuery(contactsAppTables),
        sources: 'soft-relationships',
      );

      final issues = (result['issues'] as List).cast<Map<String, dynamic>>();
      expect(issues, hasLength(2));
      expect(issues.every((i) => i['source'] == 'soft-relationship'), isTrue);
      expect(issues.every((i) => i['type'] == 'soft_relationship'), isTrue);
      expect(issues.every((i) => i['severity'] == 'info'), isTrue);
      // The from-table is surfaced as the issue's `table` so existing consumers
      // that group by table still place the finding.
      expect(
        issues.map((i) => i['table']).toSet(),
        equals(<String>{'contact_points', 'connections'}),
      );
    });

    test(
      'manifest from context resolves the matching edge in /api/issues',
      () async {
        final ctx = createTestContext(
          declaredRelationships: () => const <DeclaredRelationship>[
            DeclaredRelationship(
              fromTable: 'connections',
              fromColumn: 'contactSaropaUUID',
              toTable: 'contacts',
              toColumn: 'contactSaropaUUID',
            ),
          ],
        );
        final handler = AnalyticsHandler(ctx);

        final result = await handler.getIssuesList(
          _schemaQuery(contactsAppTables),
          sources: 'soft-relationships',
        );

        final issues = (result['issues'] as List)
            .cast<Map<String, dynamic>>()
            .where((i) => i['source'] == 'soft-relationship')
            .toList();
        expect(issues, hasLength(1));
        expect(issues.single['fromTable'], 'contact_points');
      },
    );

    test(
      'getSoftRelationshipsResult reflects the context manifest flag',
      () async {
        final ctx = createTestContext(
          declaredRelationships: () => const <DeclaredRelationship>[],
        );
        final handler = AnalyticsHandler(ctx);

        final result = await handler.getSoftRelationshipsResult(
          _schemaQuery(contactsAppTables),
        );

        expect(result['manifestAvailable'], isTrue);
      },
    );
  });

  group('cross-impl contract with web inferForeignKeys fixtures', () {
    // These edge sets are exactly what assets/web/nl-to-sql infers for the same
    // fixtures (see assets/web/test/fixtures.mjs). If the Dart port drifts from
    // the TS rules, one of these assertions breaks first.
    test('contactsApp: contacts is owner; two soft edges, no others', () {
      final tables = <SoftRelTable>[
        SoftRelTable('contacts', [
          const SoftRelColumn('id', isPk: true),
          const SoftRelColumn('contactSaropaUUID'),
        ]),
        SoftRelTable('contact_points', [
          const SoftRelColumn('id', isPk: true),
          const SoftRelColumn('contactSaropaUUID'),
        ]),
        SoftRelTable('connections', [
          const SoftRelColumn('id', isPk: true),
          const SoftRelColumn('contactSaropaUUID'),
        ]),
        SoftRelTable('organizations', [const SoftRelColumn('id', isPk: true)]),
      ];

      final edges = SoftRelationshipDetector.inferEdges(tables);
      expect(edges.map((e) => e.key).toSet(), <String>{
        SoftRelationshipDetector.edgeKey(
          'contact_points',
          'contactSaropaUUID',
          'contacts',
          'contactSaropaUUID',
        ),
        SoftRelationshipDetector.edgeKey(
          'connections',
          'contactSaropaUUID',
          'contacts',
          'contactSaropaUUID',
        ),
      });
      expect(
        edges.every((e) => e.rule == SoftRelationshipDetector.ruleSharedUuid),
        isTrue,
      );
    });

    test('relational: noun_id edges match, manager_id infers nothing', () {
      final tables = <SoftRelTable>[
        SoftRelTable('companies', [const SoftRelColumn('id', isPk: true)]),
        SoftRelTable('contacts', [
          const SoftRelColumn('id', isPk: true),
          const SoftRelColumn('company_id'),
          const SoftRelColumn('manager_id'),
        ]),
        SoftRelTable('phones', [
          const SoftRelColumn('id', isPk: true),
          const SoftRelColumn('contact_id'),
        ]),
      ];

      final edges = SoftRelationshipDetector.inferEdges(tables);
      expect(edges.map((e) => e.key).toSet(), <String>{
        SoftRelationshipDetector.edgeKey(
          'phones',
          'contact_id',
          'contacts',
          'id',
        ),
        SoftRelationshipDetector.edgeKey(
          'contacts',
          'company_id',
          'companies',
          'id',
        ),
      });
    });

    test('singularize / idTargetNoun match the TS helper behavior', () {
      expect(SoftRelationshipDetector.singularize('contacts'), 'contact');
      expect(SoftRelationshipDetector.singularize('companies'), 'company');
      expect(SoftRelationshipDetector.singularize('addresses'), 'address');
      expect(SoftRelationshipDetector.singularize('status'), 'statu');
      expect(SoftRelationshipDetector.idTargetNoun('contact_id'), 'contact');
      expect(SoftRelationshipDetector.idTargetNoun('companyId'), 'company');
      expect(SoftRelationshipDetector.idTargetNoun('id'), isNull);
    });
  });
}
