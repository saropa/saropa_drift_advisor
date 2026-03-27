/**
 * Schema docs and global search panel commands.
 *
 * The Schema Search webview provider is created and registered in
 * setupProviders (extension-providers.ts) so that VS Code can resolve
 * the webview as soon as the `driftViewer.serverConnected` context is set,
 * even if later activation steps fail.
 *
 * This module wires the revealTable callback and registers the remaining
 * panel-related commands (generateSchemaDocs, globalSearch).
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IDebugCommandDeps } from './debug-commands-types';
import type { SchemaSearchViewProvider } from '../schema-search/schema-search-view';
import { collectSchemaDocsData } from '../schema-docs/schema-docs-command';
import { DocsHtmlRenderer } from '../schema-docs/docs-html-renderer';
import { DocsMdRenderer } from '../schema-docs/docs-md-renderer';
import { GlobalSearchPanel } from '../global-search/global-search-panel';
import { runDartSchemaScanCommand } from '../dart-schema-scan-command';

/**
 * Wire the Schema Search revealTable callback and register
 * generateSchemaDocs + globalSearch commands. Connection state for the
 * Schema Search webview is applied via [refreshDriftConnectionUi] in
 * extension.ts (HTTP + VM transport).
 *
 * The [searchProvider] and [revealTableRef] are created in setupProviders
 * and passed here for wiring. The ref's `.fn` is replaced with the real
 * revealTable callback so the closure the provider captured at construction
 * time now delegates to the real tree-reveal function.
 */
export function registerDebugCommandsPanels(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  revealTable: (name: string) => Promise<void>,
  debugDeps: Pick<IDebugCommandDeps, 'connectionLog'>,
  searchProvider: SchemaSearchViewProvider,
  revealTableRef: { fn: (name: string) => Promise<void> },
): void {
  // Wire the real revealTable callback into the ref that the
  // SchemaSearchViewProvider's constructor captured via closure.
  revealTableRef.fn = revealTable;

  // Inject the connection log now that debug deps are available.
  // (The provider was created without it in setupProviders.)
  searchProvider.setConnectionLog(debugDeps.connectionLog);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.generateSchemaDocs',
      async () => {
        const format = await vscode.window.showQuickPick([
          { label: 'HTML', description: 'Self-contained web page', value: 'html' as const },
          { label: 'Markdown', description: 'Plain text, VCS-friendly', value: 'md' as const },
        ], { placeHolder: 'Output format' });
        if (!format) return;
        try {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Generating documentation\u2026' },
            async () => {
              const data = await collectSchemaDocsData(client);
              if (format.value === 'html') {
                const html = new DocsHtmlRenderer().render(data);
                const uri = await vscode.window.showSaveDialog({
                  defaultUri: vscode.Uri.file('schema-docs.html'),
                  filters: { HTML: ['html'] },
                });
                if (uri) {
                  await vscode.workspace.fs.writeFile(uri, Buffer.from(html, 'utf-8'));
                  await vscode.env.openExternal(uri);
                }
              } else {
                const md = new DocsMdRenderer().render(data);
                const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
                await vscode.window.showTextDocument(doc);
              }
            },
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Schema docs failed: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.globalSearch',
      () => GlobalSearchPanel.createOrShow(client),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.scanDartSchemaDefinitions',
      () => runDartSchemaScanCommand(),
    ),
  );

}
