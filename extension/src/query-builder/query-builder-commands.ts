/**
 * Registers visual query builder commands.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { QueryBuilderPanel, tableNameFromTreeArg } from './query-builder-panel';

/** Optional services wired from activation (query stats after successful runs). */
export interface IQueryBuilderCommandDeps {
  queryIntelligence?: QueryIntelligence;
}

/**
 * Register command handlers for opening the visual query builder.
 */
export function registerQueryBuilderCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  deps?: IQueryBuilderCommandDeps,
): void {
  const intel = deps?.queryIntelligence;
  const opts = (): { queryIntelligence?: QueryIntelligence } =>
    intel ? { queryIntelligence: intel } : {};

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openQueryBuilder', () => {
      QueryBuilderPanel.createOrShow(context, client, undefined, opts());
    }),
    vscode.commands.registerCommand('driftViewer.buildQueryFromTable', (arg: unknown) => {
      QueryBuilderPanel.createOrShow(context, client, tableNameFromTreeArg(arg), opts());
    }),
    vscode.commands.registerCommand('driftViewer.openQueryBuilderFromSql', async (sqlArg?: string) => {
      const sql =
        typeof sqlArg === 'string' && sqlArg.trim().length > 0
          ? sqlArg.trim()
          : (await vscode.window.showInputBox({
              prompt: 'Paste SELECT SQL to import into the visual query builder',
              placeHolder: 'SELECT ...',
              ignoreFocusOut: true,
            }))?.trim();
      if (!sql) {
        return;
      }
      QueryBuilderPanel.createOrShow(context, client, undefined, { ...opts(), importSql: sql });
    }),
  );
}
