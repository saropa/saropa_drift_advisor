import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableItem } from '../tree/tree-items';
import { ImpactAnalyzer } from './impact-analyzer';
import { ImpactPanel } from './impact-panel';

/** Register the analyzeRowImpact command. */
export function registerImpactCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  const analyzer = new ImpactAnalyzer(client);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.analyzeRowImpact',
      async (item?: TableItem) => {
        try {
          await analyzeImpact(client, analyzer, item);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Impact analysis failed: ${msg}`);
        }
      },
    ),
  );
}

async function analyzeImpact(
  client: DriftApiClient,
  analyzer: ImpactAnalyzer,
  item?: TableItem,
): Promise<void> {
  const table = item?.table.name ?? (await pickTable(client));
  if (!table) return;

  const meta = await client.schemaMetadata();
  const tableMeta = meta.find((t) => t.name === table);
  if (!tableMeta) return;

  const pkCol = tableMeta.columns.find((c) => c.pk)?.name ?? 'rowid';
  const pkInput = await vscode.window.showInputBox({
    prompt: `Enter ${pkCol} value to analyze in "${table}"`,
    validateInput: (v) => (v.trim() ? null : 'Enter a primary key value'),
  });
  if (!pkInput) return;

  const pkValue = /^-?\d+(\.\d+)?$/.test(pkInput)
    ? Number(pkInput)
    : pkInput;

  const config = vscode.workspace.getConfiguration('driftViewer.impact');
  const maxDepth = config.get<number>('maxDepth', 3) ?? 3;

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing row impact\u2026',
    },
    () => analyzer.analyze(table, pkCol, pkValue, maxDepth),
  );

  ImpactPanel.createOrShow(analyzer, result);
}

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
