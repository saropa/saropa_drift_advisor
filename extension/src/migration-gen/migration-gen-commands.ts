/**
 * Registers migration-related commands: Generate Migration,
 * Generate SchemaVerifier Test, and Validate Migration Paths.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { parseDartTables } from '../schema-diff/dart-parser';
import {
  computeSchemaDiff,
  hasDifferences,
} from '../schema-diff/schema-diff';
import { generateMigrationDart } from './migration-codegen';
import { validateMigrationPaths } from './migration-path-validator';
import { generateSchemaVerifierTest } from './schema-verifier-codegen';

/** Register migration-gen commands on the extension context. */
export function registerMigrationGenCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.generateMigration',
      async () => {
        try {
          const diff = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Computing schema diff\u2026',
            },
            async () => {
              const dartUris = await vscode.workspace.findFiles(
                '**/*.dart',
                '{**/build/**,.dart_tool/**,**/*.g.dart,**/*.freezed.dart}',
              );
              const tables = [];
              for (const uri of dartUris) {
                const doc =
                  await vscode.workspace.openTextDocument(uri);
                tables.push(
                  ...parseDartTables(
                    doc.getText(), uri.toString(),
                  ),
                );
              }
              const runtime = await client.schemaMetadata();
              return computeSchemaDiff(tables, runtime);
            },
          );

          if (!hasDifferences(diff)) {
            vscode.window.showInformationMessage(
              'Schema is up to date \u2014 no migration needed.',
            );
            return;
          }

          const fromStr = await vscode.window.showInputBox({
            prompt: 'Current schema version',
            placeHolder: 'e.g., 4',
            validateInput: (v) =>
              /^\d+$/.test(v) ? null : 'Enter a number',
          });
          if (!fromStr) return;

          const toStr = await vscode.window.showInputBox({
            prompt: 'Target schema version',
            value: String(parseInt(fromStr) + 1),
            validateInput: (v) =>
              /^\d+$/.test(v) ? null : 'Enter a number',
          });
          if (!toStr) return;

          const dartCode = generateMigrationDart(
            diff, parseInt(fromStr), parseInt(toStr),
          );
          if (!dartCode) return;

          const doc = await vscode.workspace.openTextDocument({
            content: dartCode,
            language: 'dart',
          });
          await vscode.window.showTextDocument(doc);
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Generate migration failed: ${msg}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      'driftViewer.generateSchemaVerifierTest',
      async () => {
        try {
          const dbImportPath = await vscode.window.showInputBox({
            prompt: 'Dart import path for the database class (without package: prefix)',
            placeHolder: 'e.g., my_app/database.dart',
            validateInput: (v) => {
              if (v.startsWith('package:')) return 'Omit the package: prefix — it is added automatically';
              if (!v.endsWith('.dart')) return 'Path must end with .dart';
              return null;
            },
          });
          if (!dbImportPath) return;

          const dartCode = generateSchemaVerifierTest(dbImportPath);
          const doc = await vscode.workspace.openTextDocument({
            content: dartCode,
            language: 'dart',
          });
          await vscode.window.showTextDocument(doc);

          vscode.window.showInformationMessage(
            'Save under test/ (e.g. test/migration_test.dart) so the relative ' +
            'generated_migrations import resolves. Then run: ' +
            'dart run drift_dev schema dump lib/database.dart drift_schemas/',
          );
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Generate SchemaVerifier test failed: ${msg}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      'driftViewer.validateMigrationPaths',
      async () => {
        try {
          const snapshotUris = await vscode.workspace.findFiles(
            '**/drift_schemas/*.json',
            '**/build/**',
          );

          if (snapshotUris.length === 0) {
            vscode.window.showWarningMessage(
              'No schema snapshots found. Run: ' +
              'dart run drift_dev schema dump lib/database.dart drift_schemas/',
            );
            return;
          }

          const result = validateMigrationPaths(
            snapshotUris.map((u) => u.toString()),
          );

          if (result.versions.length === 0) {
            vscode.window.showWarningMessage(
              'Found .json files in drift_schemas/ but none matched ' +
              'the version pattern (v1.json, v2.json, ...).',
            );
            return;
          }

          if (result.gaps.length > 0) {
            const gapList = result.gaps.join(', ');
            vscode.window.showWarningMessage(
              `Schema snapshot gaps detected: missing v${gapList}. ` +
              `Found versions: ${result.versions.join(', ')}. ` +
              'Run drift_dev schema dump for each missing version ' +
              'so SchemaVerifier can test every upgrade path.',
            );
          } else {
            vscode.window.showInformationMessage(
              `Schema snapshots complete: ${result.versions.length} versions ` +
              `(v${result.versions[0]}–v${result.versions[result.versions.length - 1]}), ` +
              'no gaps. All migration paths are testable.',
            );
          }
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Validate migration paths failed: ${msg}`,
          );
        }
      },
    ),
  );
}
