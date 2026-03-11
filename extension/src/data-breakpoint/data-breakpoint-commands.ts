import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DataBreakpointProvider } from './data-breakpoint-provider';
import type { DataBreakpointType } from './data-breakpoint-types';
import type { TableItem } from '../tree/tree-items';

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

/** Register data breakpoint commands. */
export function registerDataBreakpointCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  dbpProvider: DataBreakpointProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.addDataBreakpoint',
      async (item?: TableItem) => {
        const table = item?.table.name ?? await pickTable(client);
        if (!table) return;

        const type = await vscode.window.showQuickPick(
          [
            {
              label: 'Condition Met',
              value: 'conditionMet' as DataBreakpointType,
              description: 'SQL returns non-zero count',
            },
            {
              label: 'Row Inserted',
              value: 'rowInserted' as DataBreakpointType,
              description: 'Row count increases',
            },
            {
              label: 'Row Deleted',
              value: 'rowDeleted' as DataBreakpointType,
              description: 'Row count decreases',
            },
            {
              label: 'Row Changed',
              value: 'rowChanged' as DataBreakpointType,
              description: 'Any data changes',
            },
          ],
          { placeHolder: 'Breakpoint type' },
        );
        if (!type) return;

        let condition: string | undefined;
        if (type.value === 'conditionMet') {
          condition = await vscode.window.showInputBox({
            prompt: 'SQL condition (must return count)',
            placeHolder:
              'SELECT COUNT(*) FROM "users" WHERE balance < 0',
          });
          if (!condition) return;
        }

        dbpProvider.add(table, type.value, condition);
        vscode.window.showInformationMessage(
          `Data breakpoint added on ${table}.`,
        );
      },
    ),
    vscode.commands.registerCommand(
      'driftViewer.removeDataBreakpoint',
      (id: string) => dbpProvider.remove(id),
    ),
    vscode.commands.registerCommand(
      'driftViewer.toggleDataBreakpoint',
      (id: string) => dbpProvider.toggle(id),
    ),
  );
}
