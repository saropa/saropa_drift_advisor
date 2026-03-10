import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableMetadata } from '../api-types';
import type { TableItem } from '../tree/tree-items';
import { detectTableGenerators } from './column-detector';
import { SeederPanel } from './seeder-panel';
import type { ITableSeederConfig } from './seeder-types';

/** Register seeder commands on the extension context. */
export function registerSeederCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.seedTable',
      async (item?: TableItem) => {
        try {
          const table = item?.table.name ?? await pickTable(client);
          if (!table) return;
          const meta = await client.schemaMetadata();
          const config = await buildTableConfig(client, table, meta);
          SeederPanel.createOrShow(client, [config]);
        } catch (err) {
          showError(err);
        }
      },
    ),
    vscode.commands.registerCommand(
      'driftViewer.seedAllTables',
      async () => {
        try {
          const meta = await client.schemaMetadata();
          const tables = meta
            .filter((t) => !t.name.startsWith('sqlite_'))
            .map((t) => t.name);
          if (tables.length === 0) {
            vscode.window.showInformationMessage('No tables found.');
            return;
          }
          const configs: ITableSeederConfig[] = [];
          for (const table of tables) {
            configs.push(await buildTableConfig(client, table, meta));
          }
          SeederPanel.createOrShow(client, configs);
        } catch (err) {
          showError(err);
        }
      },
    ),
  );
}

async function buildTableConfig(
  client: DriftApiClient,
  table: string,
  meta: TableMetadata[],
): Promise<ITableSeederConfig> {
  const settings = vscode.workspace.getConfiguration('driftViewer.seeder');
  const rowCount = settings.get<number>('defaultRowCount', 100);
  const nullProb = settings.get<number>('nullProbability', 0.05);
  const tableMeta = meta.find((t) => t.name === table);
  if (!tableMeta) throw new Error(`Table "${table}" not found.`);
  const fks = await client.tableFkMeta(table);
  const columns = detectTableGenerators(
    tableMeta.columns, fks, nullProb,
  );
  return { table, rowCount, columns };
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
    placeHolder: 'Select a table to seed',
  });
}

function showError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  vscode.window.showErrorMessage(`Seeder failed: ${msg}`);
}
