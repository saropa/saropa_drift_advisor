import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { SnippetStore } from './snippet-store';
import { SnippetRunner, snippetUuid, STARTER_SNIPPETS } from './snippet-runner';
import { SnippetLibraryPanel } from './snippet-library-panel';

/** Register snippet library commands on the extension context. */
export function registerSnippetCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  const snippetStore = new SnippetStore(context.workspaceState);
  if (snippetStore.getAll().length === 0) {
    for (const starter of STARTER_SNIPPETS) {
      snippetStore.save({ ...starter, createdAt: new Date().toISOString() });
    }
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openSnippetLibrary', () => {
      SnippetLibraryPanel.createOrShow(client, snippetStore);
    }),
    vscode.commands.registerCommand('driftViewer.saveAsSnippet', async (inputSql?: string, inputName?: string) => {
      const sql = inputSql || await vscode.window.showInputBox({ prompt: 'SQL query to save' });
      if (!sql) return;
      const name = inputName || await vscode.window.showInputBox({ prompt: 'Snippet name' });
      if (!name) return;
      const runner = new SnippetRunner(client);
      const varNames = runner.extractVariables(sql);
      const variables = runner.inferVariableTypes(varNames);
      snippetStore.save({
        id: snippetUuid(),
        name,
        sql,
        category: 'Uncategorized',
        variables,
        createdAt: new Date().toISOString(),
        useCount: 0,
      });
      vscode.window.showInformationMessage(`Snippet "${name}" saved.`);
    }),
  );
}
