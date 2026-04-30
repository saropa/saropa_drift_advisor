import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ChangeTracker } from './change-tracker';
import type { ChangeItem } from './pending-changes-provider';
import { orderPendingChangesForApply } from './apply-order';
import { generateSql, generateSqlStatements } from './sql-generator';
import { WatchManager } from '../watch/watch-manager';
import { WatchPanel } from '../watch/watch-panel';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import { TableItem } from '../tree/tree-items';
import { BulkEditPanel } from '../bulk-edit/bulk-edit-panel';
import type { SnapshotStore } from '../timeline/snapshot-store';

/**
 * Returns a user-facing reason when a table is not editable in v1 bulk-edit flows.
 *
 * v1 requires exactly one PK column because pending-change identity and message
 * protocol currently use singular `pkColumn` / `pkValue` fields.
 */
export function getSinglePkEditGuardReason(item: TableItem): string | undefined {
  const pkColumns = item.table.columns.filter((c) => c.pk);
  if (pkColumns.length === 0) {
    return `Table "${item.table.name}" has no primary key column — editing needs stable row identity.`;
  }
  if (pkColumns.length > 1) {
    return `Table "${item.table.name}" uses a composite primary key — editing is currently limited to single-column primary keys.`;
  }
  return undefined;
}

/**
 * Builds a concise, user-focused apply failure message from transport errors.
 *
 * When the server includes batch failure metadata, this surfaces which
 * statement failed and shows a trimmed SQL preview to speed up correction.
 */
export function formatApplyFailureMessage(errorDetail: string): string {
  const indexMatch = /failed statement index:\s*(\d+)/i.exec(errorDetail);
  const sqlMatch = /\nFailed SQL:\s*([\s\S]+)$/i.exec(errorDetail);
  if (!indexMatch) {
    return `Apply failed: ${errorDetail}`;
  }
  const statementNumber = Number.parseInt(indexMatch[1], 10) + 1;
  const sql = sqlMatch?.[1]?.trim();
  const sqlPreview = sql && sql.length > 160 ? `${sql.slice(0, 160)}...` : sql;
  const lines = [
    `Apply failed at statement #${statementNumber}.`,
  ];
  if (sqlPreview) {
    lines.push(`SQL: ${sqlPreview}`);
  }
  lines.push('Pending edits were preserved. Fix the statement and retry.');
  return lines.join('\n');
}

/** Extracts failing SQL from server-provided batch-apply error detail text. */
export function extractFailedSql(errorDetail: string): string | undefined {
  const sqlMatch = /\nFailed SQL:\s*([\s\S]+)$/i.exec(errorDetail);
  const sql = sqlMatch?.[1]?.trim();
  return sql && sql.length > 0 ? sql : undefined;
}

/** Returns true when the user chose to open SQL preview after apply failure. */
export function shouldOpenPreviewSql(choice: string | undefined): boolean {
  return choice === 'Preview SQL';
}

/** Returns true when the user chose to copy failing SQL after apply failure. */
export function shouldCopyFailedSql(choice: string | undefined): boolean {
  return choice === 'Copy Failed SQL';
}

/** Register watch and data editing commands. */
export function registerEditingCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  changeTracker: ChangeTracker,
  watchManager: WatchManager,
  /** When set, successful batch applies append a line for session timelines / logs. */
  driftLog?: vscode.OutputChannel,
  /** When set, a post-apply snapshot refresh feeds the Drift Database timeline (row counts). */
  snapshotStore?: SnapshotStore,
): void {
  // Watch commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.watchTable',
      (item: TableItem) => {
        watchManager.add(
          `SELECT * FROM "${item.table.name}"`,
          item.table.name,
          item.table.columns,
        );
        WatchPanel.createOrShow(context, watchManager);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.watchQuery',
      (sql: string) => {
        watchManager.add(sql, sql.substring(0, 40));
        WatchPanel.createOrShow(context, watchManager);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openWatchPanel', () => {
      WatchPanel.createOrShow(context, watchManager);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openSqlNotebook', () => {
      SqlNotebookPanel.createOrShow(context, client);
    }),
  );

  // Data editing commands
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.generateSql', async () => {
      if (changeTracker.changeCount === 0) {
        vscode.window.showInformationMessage(
          'No pending data edits. Edit cells in a table viewer, then use Preview SQL again.',
        );
        return;
      }
      changeTracker.logGenerateSql();
      const sql = generateSql(changeTracker.changes);
      const doc = await vscode.workspace.openTextDocument({
        content: sql,
        language: 'sql',
      });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.commitPendingEdits', async () => {
      if (changeTracker.changeCount === 0) {
        void vscode.window.showInformationMessage('No pending data edits to apply.');
        return;
      }
      if (client.usingVmService) {
        void vscode.window.showErrorMessage(
          'Applying pending edits needs HTTP access to the Drift debug server (with writeQuery). ' +
            'VM Service–only mode does not expose batch apply.',
        );
        return;
      }
      let writeEnabled = false;
      try {
        const health = await client.health();
        writeEnabled = health.writeEnabled === true;
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Could not reach server: ${detail}`);
        return;
      }
      if (!writeEnabled) {
        void vscode.window
          .showWarningMessage(
            'Writes are not enabled on this server. Configure writeQuery on DriftDebugServer.start(), then retry.',
            'View Docs',
          )
          .then((choice) => {
            if (choice === 'View Docs') {
              void vscode.env.openExternal(
                vscode.Uri.parse('https://drift.simonbinder.eu/docs/platforms/remote/'),
              );
            }
          });
        return;
      }
      let ordered = [...changeTracker.changes];
      try {
        const meta = await client.schemaMetadata({ includeForeignKeys: true });
        const fkEdges = meta.flatMap((t) =>
          (t.foreignKeys ?? []).map((fk) => ({
            fromTable: t.name,
            toTable: fk.toTable,
          })),
        );
        ordered = orderPendingChangesForApply(changeTracker.changes, fkEdges);
      } catch {
        /* If schema cannot load, apply in original pending order. */
      }
      const statements = generateSqlStatements(ordered);
      const confirm = await vscode.window.showWarningMessage(
        `Apply ${statements.length} SQL statement(s) to the database in one transaction? ` +
          'This cannot be undone from the extension.',
        { modal: true },
        'Apply',
      );
      if (confirm !== 'Apply') {
        return;
      }
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Applying pending edits…',
          },
          () => client.applyEditsBatch(statements),
        );
        changeTracker.discardAll();
        driftLog?.appendLine(
          `[${new Date().toISOString()}] Bulk edit: applied ${statements.length} SQL statement(s).`,
        );
        // Refresh unified DB snapshots for the Timeline panel even when the user
        // recently captured manually (normal debounce would skip).
        void snapshotStore
          ?.capture(client, { bypassDebounce: true })
          .catch(() => {});
        void vscode.window.showInformationMessage(
          `Applied ${statements.length} statement(s). Pending edit list cleared.`,
        );
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        const failedSql = extractFailedSql(detail);
        const actions = failedSql
          ? ['Preview SQL', 'Copy Failed SQL']
          : ['Preview SQL'];
        const choice = await vscode.window.showErrorMessage(
          formatApplyFailureMessage(detail),
          ...actions,
        );
        if (shouldOpenPreviewSql(choice)) {
          void vscode.commands.executeCommand('driftViewer.generateSql');
        } else if (failedSql && shouldCopyFailedSql(choice)) {
          await vscode.env.clipboard.writeText(failedSql);
          void vscode.window.showInformationMessage(
            'Copied failed SQL to clipboard.',
          );
        }
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.editTableData',
      async (item?: TableItem) => {
        if (item) {
          const guardReason = getSinglePkEditGuardReason(item);
          if (guardReason) {
            void vscode.window.showWarningMessage(guardReason);
            return;
          }
        }
        BulkEditPanel.createOrShow(context, changeTracker);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.discardAllEdits',
      async () => {
        if (changeTracker.changeCount === 0) return;
        const answer = await vscode.window.showWarningMessage(
          `Discard ${changeTracker.changeCount} pending edit(s)?`,
          { modal: true },
          'Discard',
        );
        if (answer === 'Discard') {
          changeTracker.discardAll();
        }
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.undoEdit', () =>
      changeTracker.undo(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.redoEdit', () =>
      changeTracker.redo(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.toggleEditing', () => {
      const active = changeTracker.changeCount > 0;
      vscode.commands.executeCommand(
        'setContext',
        'driftViewer.editingActive',
        !active,
      );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.removeChange',
      (item: ChangeItem) => {
        changeTracker.removeChange(item.change.id);
      },
    ),
  );
}
