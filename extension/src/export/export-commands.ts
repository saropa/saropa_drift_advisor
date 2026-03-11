import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { DiagramPanel } from '../diagram/diagram-panel';
import { ComparePanel } from '../compare/compare-panel';
import { SizePanel } from '../analytics/size-panel';
import { runImportWizard } from '../import/import-command';
import { annotateSession, openSession, shareSession } from '../session/session-commands';

/** Register export, import, and session commands. */
export function registerExportCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  // Export full SQL dump
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.exportDump',
      async () => {
        try {
          const sql = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Exporting SQL dump\u2026',
            },
            () => client.schemaDump(),
          );
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('dump.sql'),
            filters: { SQL: ['sql'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(
              uri, Buffer.from(sql, 'utf-8'),
            );
            vscode.window.showInformationMessage('SQL dump exported.');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Export dump failed: ${msg}`);
        }
      },
    ),
  );

  // Download raw SQLite database file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.downloadDatabase',
      async () => {
        try {
          const data = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Downloading database\u2026',
            },
            () => client.databaseFile(),
          );
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('app.db'),
            filters: { SQLite: ['db', 'sqlite'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(
              uri, Buffer.from(data),
            );
            vscode.window.showInformationMessage('Database file saved.');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Download failed: ${msg}`);
        }
      },
    ),
  );

  // Schema diagram (ER-style table visualization)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.schemaDiagram',
      async () => {
        try {
          const data = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Loading schema diagram\u2026',
            },
            () => client.schemaDiagram(),
          );
          DiagramPanel.createOrShow(data);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Schema diagram failed: ${msg}`);
        }
      },
    ),
  );

  // Compare databases (A vs B report)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.compareReport',
      async () => {
        try {
          const report = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Comparing databases\u2026',
            },
            () => client.compareReport(),
          );
          ComparePanel.createOrShow(report);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Compare failed: ${msg}`);
        }
      },
    ),
  );

  // Preview migration SQL (compare → migration DDL)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.migrationPreview',
      async () => {
        try {
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating migration preview\u2026',
            },
            () => client.migrationPreview(),
          );
          const header = [
            `-- Migration Preview (${result.changeCount} changes)`,
            result.hasWarnings ? '-- WARNING: review before executing' : '',
            `-- Generated: ${result.generatedAt}`,
            '',
          ].filter(Boolean).join('\n');
          const doc = await vscode.workspace.openTextDocument({
            content: header + result.migrationSql,
            language: 'sql',
          });
          await vscode.window.showTextDocument(
            doc, vscode.ViewColumn.Beside,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Migration preview failed: ${msg}`,
          );
        }
      },
    ),
  );

  // Size analytics dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.sizeAnalytics',
      async () => {
        try {
          const data = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Loading size analytics\u2026',
            },
            () => client.sizeAnalytics(),
          );
          SizePanel.createOrShow(data);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Size analytics failed: ${msg}`);
        }
      },
    ),
  );

  // Import data wizard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.importData',
      () => runImportWizard(client),
    ),
  );

  // Session commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.shareSession', () => shareSession(client),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openSession', () => openSession(client),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.annotateSession', () => annotateSession(client),
    ),
  );
}
