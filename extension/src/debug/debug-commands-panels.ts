/**
 * Schema search, schema docs, and global search panel commands.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { SchemaSearchViewProvider } from '../schema-search/schema-search-view';
import { collectSchemaDocsData } from '../schema-docs/schema-docs-command';
import { DocsHtmlRenderer } from '../schema-docs/docs-html-renderer';
import { DocsMdRenderer } from '../schema-docs/docs-md-renderer';
import { GlobalSearchPanel } from '../global-search/global-search-panel';

/**
 * Register schema search view, generateSchemaDocs, and globalSearch.
 */
export function registerDebugCommandsPanels(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  revealTable: (name: string) => Promise<void>,
): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SchemaSearchViewProvider.viewType,
      new SchemaSearchViewProvider(client, revealTable),
    ),
  );

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
}
