import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableItem } from '../tree/tree-items';
import { DependencySorter } from './dependency-sorter';
import { DataReset } from './data-reset';
import { DatasetConfig } from './dataset-config';
import { ImportFormPanel } from './import-form-panel';
import { ExportFormPanel } from './export-form-panel';

const PROGRESS = { location: vscode.ProgressLocation.Notification };

async function pickTable(
  client: DriftApiClient,
): Promise<string | undefined> {
  const meta = await client.schemaMetadata();
  const names = meta
    .filter((t) => !t.name.startsWith('sqlite_'))
    .map((t) => t.name)
    .sort();
  return vscode.window.showQuickPick(names, {
    placeHolder: 'Select a table',
  });
}

/** Register all data management commands on the extension context. */
export function registerDataManagementCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  const sorter = new DependencySorter();
  const dataReset = new DataReset(client, sorter);
  const datasetConfig = new DatasetConfig();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.clearTable',
      async (item?: TableItem) => {
        try {
          const table =
            item?.table.name ?? (await pickTable(client));
          if (!table) return;

          const preview = await dataReset.previewClear([table]);
          const total = preview.reduce(
            (s, p) => s + p.rowCount, 0,
          );
          const details = preview
            .map((p) => `${p.name}: ${p.rowCount} rows`)
            .join(', ');

          const answer = await vscode.window.showWarningMessage(
            `Clear ${total.toLocaleString()} rows? (${details})`,
            'Clear', 'Cancel',
          );
          if (answer !== 'Clear') return;

          const result = await vscode.window.withProgress(
            { ...PROGRESS, title: `Clearing ${table}\u2026` },
            () => dataReset.clearTable(table),
          );
          vscode.window.showInformationMessage(
            `Cleared ${result.totalDeleted.toLocaleString()} rows from ${result.tables.length} table(s).`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Clear failed: ${msg}`);
        }
      },
    ),

    vscode.commands.registerCommand(
      'driftViewer.clearAllTables',
      async () => {
        try {
          const meta = await client.schemaMetadata();
          const total = meta
            .filter((t) => !t.name.startsWith('sqlite_'))
            .reduce((s, t) => s + t.rowCount, 0);

          const answer = await vscode.window.showWarningMessage(
            `Clear ALL data? (${total.toLocaleString()} rows)`,
            'Clear All', 'Cancel',
          );
          if (answer !== 'Clear All') return;

          const result = await vscode.window.withProgress(
            { ...PROGRESS, title: 'Clearing all tables\u2026' },
            () => dataReset.clearAll(),
          );
          vscode.window.showInformationMessage(
            `Cleared ${result.totalDeleted.toLocaleString()} rows.`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Clear all failed: ${msg}`);
        }
      },
    ),

    vscode.commands.registerCommand(
      'driftViewer.clearTableGroup',
      async () => {
        try {
          const ws =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!ws) return;
          const config = await datasetConfig.load(ws);
          if (!config || Object.keys(config.groups).length === 0) {
            void vscode.window
              .showWarningMessage(
                'No table groups defined. Create a .drift-datasets.json in your workspace root.',
                'Create File',
              )
              .then(async (choice) => {
                if (choice !== 'Create File') return;
                try {
                  const filePath = vscode.Uri.joinPath(
                    vscode.Uri.file(ws),
                    '.drift-datasets.json',
                  );
                  // Scaffold an empty config so the user has a starting point
                  await vscode.workspace.fs.writeFile(
                    filePath,
                    Buffer.from(JSON.stringify({ groups: {}, datasets: {} }, null, 2), 'utf-8'),
                  );
                  const doc = await vscode.workspace.openTextDocument(filePath);
                  await vscode.window.showTextDocument(doc);
                } catch (err: unknown) {
                  const detail = err instanceof Error ? err.message : String(err);
                  void vscode.window.showErrorMessage(
                    `Failed to create .drift-datasets.json: ${detail}`,
                  );
                }
              });
            return;
          }

          const group = await vscode.window.showQuickPick(
            Object.entries(config.groups).map(
              ([name, tables]) => ({
                label: name,
                description: tables.join(', '),
                tables,
              }),
            ),
            { placeHolder: 'Select a group to clear' },
          );
          if (!group) return;

          const preview = await dataReset.previewClear(group.tables);
          const total = preview.reduce(
            (s, p) => s + p.rowCount, 0,
          );
          const answer = await vscode.window.showWarningMessage(
            `Clear group "${group.label}"? (${total.toLocaleString()} rows)`,
            'Clear', 'Cancel',
          );
          if (answer !== 'Clear') return;

          const result = await vscode.window.withProgress(
            { ...PROGRESS, title: `Clearing "${group.label}"\u2026` },
            () => dataReset.clearGroup(group.tables),
          );
          vscode.window.showInformationMessage(
            `Cleared ${result.totalDeleted.toLocaleString()} rows from "${group.label}".`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Clear group failed: ${msg}`);
        }
      },
    ),

    // Import dataset — opens webview form with source + mode selection
    vscode.commands.registerCommand(
      'driftViewer.importDataset',
      async () => {
        try {
          await ImportFormPanel.open(client);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Import failed: ${msg}`);
        }
      },
    ),

    // Export dataset — opens webview form with table checkboxes + name input
    vscode.commands.registerCommand(
      'driftViewer.exportDataset',
      async () => {
        try {
          await ExportFormPanel.open(client);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Export failed: ${msg}`);
        }
      },
    ),
  );
}
