/**
 * Generates a SchemaVerifier test scaffold for Drift migration testing.
 *
 * Invoked by the `driftViewer.generateSchemaVerifierTest` command, which is
 * wired as a quick fix on the `no-schema-snapshots` diagnostic. The developer
 * must first run:
 *   dart run drift_dev schema dump lib/database.dart drift_schemas/
 * to populate the snapshot directory.
 */

/**
 * Returns the Dart source for a SchemaVerifier test file.
 *
 * @param dbImportPath - Dart import path for the database class, without the
 *                       `package:` prefix (e.g. "my_app/database.dart").
 *                       The template prepends `package:` automatically.
 */
export function generateSchemaVerifierTest(
  dbImportPath: string,
): string {
  return `import 'package:drift/drift.dart';
import 'package:drift_dev/api/migrations.dart';
import 'package:${dbImportPath}';
import 'package:test/test.dart';

import 'generated_migrations/schema.dart';

void main() {
  late SchemaVerifier verifier;

  setUpAll(() {
    verifier = SchemaVerifier(GeneratedHelper());
  });

  group('schema migrations', () {
    // Validates every recorded schema version starts a fresh database
    // without errors. Run after adding a new drift_dev schema dump.
    allDbVersions.forEach((targetVersion) {
      test('creates v\$targetVersion from scratch', () async {
        final connection = await verifier.startAt(targetVersion);
        await verifier.migrateAndValidate(connection, targetVersion);
      });
    });

    // Validates upgrading from each prior version to the current one.
    // Catches the Reddit pitfall: SELECT * in onUpgrade referencing
    // columns that do not exist in older schemas.
    allDbVersions.take(allDbVersions.length - 1).forEach((fromVersion) {
      final toVersion = allDbVersions.last;
      test('upgrades from v\$fromVersion to v\$toVersion', () async {
        final connection = await verifier.startAt(fromVersion);
        await verifier.migrateAndValidate(connection, toVersion);
      });
    });
  });
}
`;
}
