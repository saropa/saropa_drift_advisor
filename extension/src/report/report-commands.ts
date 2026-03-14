import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { ReportCollector } from './report-collector';
import { buildReportHtml } from './report-html';

/** Large-table threshold: tables with this many rows are deselected by default. */
const ROW_THRESHOLD = 10_000;

/** Register the exportReport command. */
export function registerReportCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.exportReport',
      async () => {
        try {
          const meta = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Loading tables\u2026',
            },
            () => client.schemaMetadata(),
          );

          const tables = meta.filter((t) => !t.name.startsWith('sqlite_'));
          if (tables.length === 0) {
            vscode.window.showWarningMessage(
              'No tables found in the database.',
            );
            return;
          }

          const selected = await vscode.window.showQuickPick(
            tables.map((t) => ({
              label: t.name,
              description: `${t.rowCount} rows`,
              picked: t.rowCount < ROW_THRESHOLD,
            })),
            {
              canPickMany: true,
              placeHolder: 'Select tables to include in report',
            },
          );
          if (!selected || selected.length === 0) return;

          const config = vscode.workspace.getConfiguration(
            'driftViewer.report',
          );
          const collector = new ReportCollector(client);
          const data = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Collecting report data\u2026',
            },
            () =>
              collector.collect({
                tables: selected.map((s) => s.label),
                maxRows: config.get<number>('defaultMaxRows', 1000),
                includeSchema: config.get<boolean>('includeSchema', true),
                includeAnomalies: config.get<boolean>(
                  'includeAnomalies', true,
                ),
              }),
          );

          const html = buildReportHtml(data);

          const dateStr = new Date().toISOString().slice(0, 10);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(
              `drift-report-${dateStr}.html`,
            ),
            filters: { HTML: ['html'] },
          });
          if (!uri) return;

          await vscode.workspace.fs.writeFile(
            uri, Buffer.from(html, 'utf-8'),
          );

          const action = await vscode.window.showInformationMessage(
            'Portable report exported.',
            'Open in Browser',
          );
          if (action === 'Open in Browser') {
            await vscode.env.openExternal(uri);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Report export failed: ${msg}`,
          );
        }
      },
    ),
  );
}
