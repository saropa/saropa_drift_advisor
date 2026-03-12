/**
 * Command registration for the Data Story Narrator feature.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableItem } from '../tree/tree-items';
import { DataNarrator } from './data-narrator';
import { NarratorPanel } from './narrator-panel';

export function registerNarratorCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  const narrator = new DataNarrator(client);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.narrateRow',
      async (item?: TableItem) => {
        try {
          await narrateRow(client, narrator, item);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Narration failed: ${msg}`);
        }
      },
    ),
  );
}

async function narrateRow(
  client: DriftApiClient,
  narrator: DataNarrator,
  item?: TableItem,
): Promise<void> {
  const table = item?.table.name ?? (await pickTable(client));
  if (!table) return;

  const meta = await client.schemaMetadata();
  const tableMeta = meta.find((t) => t.name === table);
  if (!tableMeta) {
    vscode.window.showErrorMessage(`Table "${table}" not found in schema.`);
    return;
  }

  const pkCol = tableMeta.columns.find((c) => c.pk)?.name ?? 'rowid';
  const pkInput = await vscode.window.showInputBox({
    prompt: `Enter ${pkCol} value to narrate in "${table}"`,
    placeHolder: 'e.g., 42',
    validateInput: (v) => (v.trim() ? null : 'Enter a primary key value'),
  });
  if (!pkInput) return;

  const pkValue = /^-?\d+(\.\d+)?$/.test(pkInput)
    ? Number(pkInput)
    : pkInput;

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Generating data story…',
    },
    async () => {
      const graph = await narrator.buildGraph(table, pkCol, pkValue);
      return narrator.generateNarrative(graph);
    },
  );

  NarratorPanel.createOrShow(narrator, result);
}

async function pickTable(client: DriftApiClient): Promise<string | undefined> {
  const meta = await client.schemaMetadata();
  const names = meta
    .filter((t) => !t.name.startsWith('sqlite_'))
    .map((t) => t.name)
    .sort();

  return vscode.window.showQuickPick(names, {
    placeHolder: 'Select a table',
  });
}
