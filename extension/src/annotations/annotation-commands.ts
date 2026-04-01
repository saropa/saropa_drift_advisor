/**
 * Register all annotation-related VS Code commands.
 * Follows the registerComparatorCommands pattern.
 */

import * as vscode from 'vscode';
import type { AnnotationIcon } from './annotation-types';
import type { AnnotationStore } from './annotation-store';
import type { DriftTreeProvider } from '../tree/drift-tree-provider';
import type { ColumnItem, TableItem } from '../tree/tree-items';
import { AnnotationPanel } from './annotation-panel';

const ICON_PICKS: Array<{ label: string; value: AnnotationIcon }> = [
  { label: '\u{1F4A1} Note', value: 'note' },
  { label: '\u26A0\uFE0F Warning', value: 'warning' },
  { label: '\u{1F41B} Bug', value: 'bug' },
  { label: '\u2B50 Star', value: 'star' },
  { label: '\u{1F4CC} Pin', value: 'pin' },
];

async function pickIcon(): Promise<AnnotationIcon | undefined> {
  const pick = await vscode.window.showQuickPick(ICON_PICKS, {
    placeHolder: 'Annotation type',
  });
  return pick?.value;
}

async function inputNote(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Annotation text',
    placeHolder: 'e.g. "Unused column — candidate for removal"',
  });
}

/** Register annotation commands and wire up store change events. */
export function registerAnnotationCommands(
  context: vscode.ExtensionContext,
  store: AnnotationStore,
  treeProvider: DriftTreeProvider,
): void {
  // Annotate table (right-click context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.annotateTable',
      async (item: TableItem) => {
        const icon = await pickIcon();
        if (!icon) return;
        const note = await inputNote();
        if (!note) return;
        store.add(
          { kind: 'table', table: item.table.name },
          note,
          icon,
        );
        // Confirm so the user knows it saved
        vscode.window.showInformationMessage(
          `Annotation added to table '${item.table.name}'.`,
        );
      },
    ),
  );

  // Annotate column (right-click context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.annotateColumn',
      async (item: ColumnItem) => {
        const icon = await pickIcon();
        if (!icon) return;
        const note = await inputNote();
        if (!note) return;
        store.add(
          {
            kind: 'column',
            table: item.tableName,
            column: item.column.name,
          },
          note,
          icon,
        );
        // Confirm so the user knows it saved
        vscode.window.showInformationMessage(
          `Annotation added to column '${item.tableName}.${item.column.name}'.`,
        );
      },
    ),
  );

  // Remove all annotations for a table (right-click context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.removeTableAnnotations',
      async (item: TableItem) => {
        const count = store.countForTable(item.table.name);
        if (count === 0) {
          vscode.window.showInformationMessage(
            `No annotations on table '${item.table.name}'.`,
          );
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Remove all ${count} annotation(s) from table '${item.table.name}'?`,
          { modal: true },
          'Remove',
        );
        if (confirm !== 'Remove') return;
        // Single-pass removal of all kinds (table + column + row) avoids
        // N+1 persist/refresh cascade and ensures row annotations aren't missed.
        const removed = store.removeAllForTable(item.table.name);
        vscode.window.showInformationMessage(
          `Removed ${removed} annotation(s) from '${item.table.name}'.`,
        );
      },
    ),
  );

  // cspell:ignore anns

  // Remove annotations for a specific column (right-click context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.removeColumnAnnotations',
      async (item: ColumnItem) => {
        const anns = store.forColumn(item.tableName, item.column.name);
        if (anns.length === 0) {
          vscode.window.showInformationMessage(
            `No annotations on column '${item.tableName}.${item.column.name}'.`,
          );
          return;
        }
        const label = `${item.tableName}.${item.column.name}`;
        const confirm = await vscode.window.showWarningMessage(
          `Remove ${anns.length} annotation(s) from column '${label}'?`,
          { modal: true },
          'Remove',
        );
        if (confirm !== 'Remove') return;
        store.removeForColumn(item.tableName, item.column.name);
        vscode.window.showInformationMessage(
          `Removed ${anns.length} annotation(s) from '${label}'.`,
        );
      },
    ),
  );

  // Clear ALL annotations (toolbar button)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.clearAnnotations',
      async () => {
        const total = store.annotations.length;
        if (total === 0) {
          vscode.window.showInformationMessage('No annotations to clear.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Clear all ${total} annotation(s)? This cannot be undone.`,
          { modal: true },
          'Clear All',
        );
        if (confirm !== 'Clear All') return;
        store.clearAll();
        vscode.window.showInformationMessage(
          `Cleared ${total} annotation(s).`,
        );
      },
    ),
  );

  // Open bookmarks panel
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openBookmarks',
      () => AnnotationPanel.createOrShow(store),
    ),
  );

  // Export annotations to JSON file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.exportAnnotations',
      async () => {
        const data = store.exportJson();
        if (data.annotations.length === 0) {
          vscode.window.showInformationMessage(
            'No annotations to export.',
          );
          return;
        }
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file('drift-annotations.json'),
          filters: { 'JSON files': ['json'] },
        });
        if (!uri) return;
        const json = JSON.stringify(data, null, 2);
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(json, 'utf-8'),
        );
        vscode.window.showInformationMessage(
          `Exported ${data.annotations.length} annotations.`,
        );
      },
    ),
  );

  // Import annotations from JSON file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.importAnnotations',
      async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'JSON files': ['json'] },
        });
        if (!uris || uris.length === 0) return;
        try {
          const bytes = await vscode.workspace.fs.readFile(uris[0]);
          const text = Buffer.from(bytes).toString('utf-8');
          const data = JSON.parse(text);
          const count = store.importJson(data);
          vscode.window.showInformationMessage(
            `Imported ${count} new annotation(s).`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Import failed: ${msg}`,
          );
        }
      },
    ),
  );

  // Refresh tree when annotations change
  store.onDidChange(() => treeProvider.refresh());
}
