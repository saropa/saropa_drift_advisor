/**
 * Registers the Generate Migration Rollback command.
 * Presents a QuickPick of schema timeline snapshot pairs, generates
 * reverse SQL + Dart code, and opens the result in a new editor tab.
 */

import * as vscode from 'vscode';
import type { SchemaTracker } from '../schema-timeline/schema-tracker';
import { diffSchemaSnapshots } from '../schema-timeline/schema-differ';
import type { ISchemaChange, ISchemaSnapshot } from '../schema-timeline/schema-timeline-types';
import { generateRollback } from './rollback-generator';

/** Register rollback-gen commands on the extension context. */
export function registerRollbackCommands(
  context: vscode.ExtensionContext,
  schemaTracker: SchemaTracker,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.generateRollback',
      async () => {
        try {
          await handleGenerateRollback(schemaTracker);
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Generate rollback failed: ${msg}`,
          );
        }
      },
    ),
  );
}

/**
 * Core command handler: pick a snapshot pair, diff them, generate
 * rollback code, and open in an editor.
 */
async function handleGenerateRollback(
  schemaTracker: SchemaTracker,
): Promise<void> {
  // Copy the snapshot array so it stays stable across the await
  // for showQuickPick — the tracker may append new snapshots while
  // the user is choosing.
  const snapshots = [...schemaTracker.getAll()];

  if (snapshots.length < 2) {
    vscode.window.showInformationMessage(
      'Need at least 2 schema snapshots to generate a rollback.'
      + ' Schema snapshots are captured automatically when your database'
      + ' schema changes during a debug session.',
    );
    return;
  }

  // Build QuickPick items for each adjacent snapshot pair.
  // Each item represents a forward migration (before → after) that
  // the user can choose to generate a rollback for.
  const items = buildQuickPickItems(snapshots);

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a schema change to generate rollback for',
    matchOnDetail: true,
  });
  if (!picked) {
    return;
  }

  const before = snapshots[picked.beforeIndex];
  const after = snapshots[picked.afterIndex];
  const changes = diffSchemaSnapshots(before, after);

  if (changes.length === 0) {
    vscode.window.showInformationMessage(
      'No schema changes detected between these snapshots'
      + ' — nothing to rollback.',
    );
    return;
  }

  const result = generateRollback(changes, before, after);

  if (result.sql.length === 0 && result.warnings.length === 0) {
    vscode.window.showInformationMessage(
      'No reversible schema changes found.',
    );
    return;
  }

  // Open the generated Dart code in a new editor tab.
  const doc = await vscode.workspace.openTextDocument({
    content: result.dart,
    language: 'dart',
  });
  await vscode.window.showTextDocument(doc);

  // Show warnings to the user if any limitations were encountered.
  if (result.warnings.length > 0) {
    const warningText = result.warnings.length === 1
      ? result.warnings[0]
      : `${result.warnings.length} warnings — see generated code comments.`;
    vscode.window.showWarningMessage(
      `Rollback generated with caveats: ${warningText}`,
    );
  }
}

// ---- QuickPick helpers ----

interface ISnapshotPairItem extends vscode.QuickPickItem {
  /** Index of the earlier snapshot in the tracker array. */
  beforeIndex: number;
  /** Index of the later snapshot in the tracker array. */
  afterIndex: number;
}

/**
 * Build QuickPick items for each adjacent pair of snapshots.
 * Most recent changes appear first (reverse chronological order).
 */
function buildQuickPickItems(
  snapshots: readonly ISchemaSnapshot[],
): ISnapshotPairItem[] {
  const items: ISnapshotPairItem[] = [];

  // Iterate from newest to oldest (last pair first).
  for (let i = snapshots.length - 1; i >= 1; i--) {
    const before = snapshots[i - 1];
    const after = snapshots[i];
    const changes = diffSchemaSnapshots(before, after);

    // Build a short summary of the changes for the QuickPick label.
    const summary = summarizeChanges(changes);
    const time = formatTime(after.timestamp);

    items.push({
      label: `Gen ${before.generation} → ${after.generation}`,
      description: time,
      detail: summary || 'No schema changes (data only)',
      beforeIndex: i - 1,
      afterIndex: i,
    });
  }

  return items;
}

/** Summarize schema changes into a short string for display. */
function summarizeChanges(changes: ISchemaChange[]): string {
  if (changes.length === 0) {
    return '';
  }

  // Group changes by type and build concise labels.
  const parts: string[] = [];
  for (const c of changes) {
    const icon = changeIcon(c.type);
    // Truncate detail to keep the summary readable.
    const detail = c.detail.length > 40
      ? c.detail.slice(0, 37) + '\u2026'
      : c.detail;
    parts.push(`${icon} ${c.table}${detail ? ': ' + detail : ''}`);
  }

  return parts.join(', ');
}

/** Compact icon prefix for a change type. */
function changeIcon(type: ISchemaChange['type']): string {
  if (type.includes('added')) return '+';
  if (type.includes('dropped') || type.includes('removed')) return '-';
  return '~';
}

/** Format an ISO timestamp into a human-readable time string. */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}
