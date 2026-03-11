import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { parseDartTables } from './dart-parser';
import {
  computeSchemaDiff,
  generateFullSchemaSql,
  generateMigrationSql,
} from './schema-diff';
import { SchemaDiffPanel } from './schema-diff-panel';
import { generateDartTables } from '../codegen/dart-codegen';

/** Register schema diff and code generation commands. */
export function registerSchemaDiffCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  // Schema diff (code vs runtime)
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.schemaDiff', async () => {
      try {
        const { diff, sql, fullSql } = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Comparing schema\u2026',
          },
          async () => {
            const dartUris = await vscode.workspace.findFiles(
              '**/*.dart',
              '{**/build/**,.dart_tool/**,**/*.g.dart,**/*.freezed.dart}',
            );
            const tables = [];
            for (const uri of dartUris) {
              const doc = await vscode.workspace.openTextDocument(uri);
              tables.push(
                ...parseDartTables(doc.getText(), uri.toString()),
              );
            }
            const runtime = await client.schemaMetadata();
            const d = computeSchemaDiff(tables, runtime);
            return {
              diff: d,
              sql: generateMigrationSql(d),
              fullSql: generateFullSchemaSql(tables),
            };
          },
        );
        SchemaDiffPanel.createOrShow(diff, sql, fullSql);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Schema diff failed: ${msg}`);
      }
    }),
  );

  // Generate Dart from runtime schema
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.generateDart',
      async () => {
        try {
          const schema = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Fetching schema\u2026',
            },
            () => client.schemaMetadata(),
          );
          if (schema.length === 0) {
            vscode.window.showInformationMessage('No tables found.');
            return;
          }
          const picked = await vscode.window.showQuickPick(
            schema.map((t) => ({
              label: t.name,
              description: `${t.columns.length} columns`,
              table: t,
            })),
            { canPickMany: true, placeHolder: 'Select tables to generate' },
          );
          if (!picked?.length) return;
          const dart = generateDartTables(picked.map((p) => p.table));
          const doc = await vscode.workspace.openTextDocument({
            content: dart,
            language: 'dart',
          });
          await vscode.window.showTextDocument(doc);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Generate Dart failed: ${msg}`,
          );
        }
      },
    ),
  );
}
