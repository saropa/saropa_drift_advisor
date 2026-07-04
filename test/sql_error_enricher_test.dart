// Unit tests for SqlErrorEnricher — the schema-aware enrichment applied to
// bare SQLite prepare-time errors on the /api/sql path. Covers the three
// distinct schema-mismatch failures documented in
// plans/history/2026.07/2026.07.04/BUG_API_SQL_UNVALIDATED_COLUMN_REFS.md:
//   1. unknown column whose real name is an acronym-split identifier,
//   2. unknown column with a close real match,
//   3. a reserved keyword misused as a bare alias (syntax error).

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/server/sql_error_enricher.dart';

void main() {
  /// Builds a PRAGMA table_info responder from a table -> columns map. Any
  /// non-PRAGMA / unknown-table query returns no rows, mirroring SQLite.
  Future<List<Map<String, dynamic>>> Function(String) pragmaResponder(
    Map<String, List<String>> schema,
  ) {
    return (String sql) async {
      for (final entry in schema.entries) {
        if (sql == 'PRAGMA table_info("${entry.key}")') {
          return [
            for (final col in entry.value)
              <String, dynamic>{'name': col, 'type': 'TEXT'},
          ];
        }
      }
      return <Map<String, dynamic>>[];
    };
  }

  group('SqlErrorEnricher.enrich - unknown column', () {
    test('lists the real columns of the aliased table (acronym-split name) '
        'even when the fuzzy distance is too large to suggest', () async {
      const sql =
          'SELECT c.saropa_uuid AS uuid, c.given_name AS gn '
          'FROM contacts c '
          'LEFT JOIN contact_avatars a '
          'ON a.contact_saropa_u_u_i_d=c.saropa_uuid '
          "WHERE c.given_name IN ('Kirsten') LIMIT 20";
      const message =
          'SqliteException(1): while preparing statement, '
          'no such column: c.saropa_uuid, SQL logic error (code 1)';

      final result = await SqlErrorEnricher.enrich(
        message: message,
        sql: sql,
        query: pragmaResponder(<String, List<String>>{
          'contacts': ['contact_saropa_u_u_i_d', 'given_name', 'family_name'],
          'contact_avatars': ['contact_saropa_u_u_i_d', 'image', 'color_hash'],
        }),
      );

      // Original text is preserved; the resolved table's real columns are
      // appended so the client can see the correct acronym-split name.
      expect(result, startsWith(message));
      expect(result, contains('Columns in "contacts"'));
      expect(result, contains('contact_saropa_u_u_i_d'));
    });

    test(
      'suggests the nearest real column when it is a plausible typo',
      () async {
        const sql =
            'SELECT e.email_normalized AS email, count(*) AS n '
            'FROM contact_email_lookups e '
            "WHERE e.contact_saropa_u_u_i_d IN ("
            "SELECT contact_saropa_u_u_i_d FROM contacts "
            "WHERE given_name='Claire') GROUP BY e.email_normalized";
        const message =
            'SqliteException(1): while preparing statement, '
            'no such column: e.email_normalized, SQL logic error (code 1)';

        final result = await SqlErrorEnricher.enrich(
          message: message,
          sql: sql,
          query: pragmaResponder(<String, List<String>>{
            'contact_email_lookups': ['email_lower', 'contact_saropa_u_u_i_d'],
            'contacts': ['contact_saropa_u_u_i_d', 'given_name'],
          }),
        );

        expect(result, contains('did you mean "email_lower"?'));
        expect(result, contains('Columns in "contact_email_lookups"'));
      },
    );

    test(
      'returns the original message unchanged when no table can be resolved',
      () async {
        const message =
            'SqliteException(1): no such column: foo, SQL logic error (code 1)';
        // No FROM/JOIN clause -> nothing to look up.
        final result = await SqlErrorEnricher.enrich(
          message: message,
          sql: 'SELECT foo',
          query: pragmaResponder(const <String, List<String>>{}),
        );
        expect(result, message);
      },
    );

    test(
      'reports enrichment failures via onError but still returns original',
      () async {
        const message =
            'SqliteException(1): no such column: c.foo, SQL logic error (code 1)';
        Object? reported;
        final result = await SqlErrorEnricher.enrich(
          message: message,
          sql: 'SELECT c.foo FROM contacts c',
          query: (_) async => throw StateError('pragma boom'),
          onError: (error, _) => reported = error,
        );
        expect(result, message);
        expect(reported, isA<StateError>());
      },
    );
  });

  group('SqlErrorEnricher.enrich - reserved word alias', () {
    test('hints to quote a reserved keyword used as a bare alias', () async {
      const message =
          'SqliteException(1): while preparing statement, '
          'near "primary": syntax error, SQL logic error (code 1)';
      final result = await SqlErrorEnricher.enrich(
        message: message,
        sql: 'SELECT primary_contact_u_u_i_d AS primary FROM contacts',
        query: pragmaResponder(const <String, List<String>>{}),
      );
      expect(result, startsWith(message));
      expect(result, contains('reserved SQLite keyword'));
      expect(result, contains('"primary"'));
    });

    test('leaves a non-keyword syntax error unchanged', () async {
      const message = 'SqliteException(1): near "SLECT": syntax error (code 1)';
      final result = await SqlErrorEnricher.enrich(
        message: message,
        sql: 'SLECT * FROM contacts',
        query: pragmaResponder(const <String, List<String>>{}),
      );
      expect(result, message);
    });
  });

  group('SqlErrorEnricher.enrich - non-schema errors', () {
    test('passes an unrelated error through untouched', () async {
      const message = 'SqliteException(5): database is locked (code 5)';
      final result = await SqlErrorEnricher.enrich(
        message: message,
        sql: 'SELECT * FROM contacts',
        query: pragmaResponder(const <String, List<String>>{}),
      );
      expect(result, message);
    });
  });
}
