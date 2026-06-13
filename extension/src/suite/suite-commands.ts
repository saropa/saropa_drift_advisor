/**
 * Saropa suite integration — stable public deep-link command ids
 * (plan 67 §3 / R5).
 *
 * These five command ids are the cross-tool contract that the sibling tools'
 * diagnostic `fix.command` entries target (Saropa Lints, Saropa Log Capture).
 * They MUST keep their ids and single-options-object argument shapes stable
 * across releases, independent of how the internal commands they delegate to
 * are renamed or re-implemented. That indirection is the whole point: wrapping
 * the internals (instead of publishing the internal ids) lets the internal
 * command surface evolve without breaking another extension's saved links.
 *
 * Every command takes one plain options object (never a tree `TableItem`), so
 * a JSON envelope can invoke it directly via `vscode.commands.executeCommand`.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { ExplainPanel } from '../explain/explain-panel';

export function registerSuiteCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  // openExplainForSql: explain a SPECIFIC query supplied by a sibling (a Log
  // Capture slow-query signal, a Lints finding) rather than whatever sits in
  // the active editor. It therefore cannot just delegate to
  // driftViewer.explainQuery, which reads the editor. With no `sql` it falls
  // back to that editor-reading command so a bare palette invocation still
  // does something useful.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openExplainForSql',
      async (args?: { sql?: string; table?: string }) => {
        const sql = args?.sql?.trim();
        if (!sql) {
          return vscode.commands.executeCommand('driftViewer.explainQuery');
        }
        try {
          const [result, suggestions] = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Explaining query plan…',
            },
            () => Promise.all([client.explainSql(sql), client.indexSuggestions()]),
          );
          await ExplainPanel.createOrShow(sql, result, suggestions);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Explain failed: ${msg}`);
        }
        return undefined;
      },
    ),
  );

  // openTable: open the live data view. driftViewer.viewTableData opens the
  // database panel and ignores its item argument today; the `table` option is
  // accepted now so the contract is stable when table-focused open lands.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openTable',
      (args?: { table?: string }) =>
        vscode.commands.executeCommand(
          'driftViewer.viewTableData',
          synthTableItem(args?.table),
        ),
    ),
  );

  // openSchemaForTable: surface the schema/relationships view. Routes to the
  // ER diagram today; per-table focus is a future enhancement that will not
  // change this id or signature.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openSchemaForTable',
      (_args?: { table?: string }) =>
        vscode.commands.executeCommand('driftViewer.showErDiagram'),
    ),
  );

  // openIssues: open the runtime issues surface, routed to the closest
  // existing view for the requested shared-taxonomy category (plan 67 §2.1).
  // Anything else opens the consolidated dashboard.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openIssues',
      (args?: { category?: string }) => {
        switch (args?.category) {
          case 'performance':
            return vscode.commands.executeCommand('driftViewer.showIndexSuggestions');
          case 'data':
            return vscode.commands.executeCommand('driftViewer.showAnomalies');
          default:
            return vscode.commands.executeCommand('driftViewer.openDashboard');
        }
      },
    ),
  );

  // goToDefinitionForTable: jump to the Drift `Table` class in Dart. The
  // internal command reads only `item.table.name`, so a minimal synthesized
  // item drives it without constructing a full tree TableItem.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.goToDefinitionForTable',
      (args?: { table?: string }) => {
        const table = args?.table?.trim();
        if (!table) {
          void vscode.window.showWarningMessage(
            'Go to Table Definition needs a table name (call with { table }).',
          );
          return undefined;
        }
        return vscode.commands.executeCommand(
          'driftViewer.goToDriftTableDefinition',
          synthTableItem(table),
        );
      },
    ),
  );
}

/**
 * Minimal stand-in carrying only the `table.name` the delegate commands read.
 * Returns undefined when no table is given so the delegate falls back to its
 * own no-argument behavior (e.g. viewTableData opens the panel regardless).
 */
function synthTableItem(table?: string): { table: { name: string } } | undefined {
  const name = table?.trim();
  return name ? { table: { name } } : undefined;
}
