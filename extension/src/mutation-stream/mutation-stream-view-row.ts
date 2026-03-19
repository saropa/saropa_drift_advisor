/**
 * Row-navigation helper used by the Mutation Stream panel.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FilterBridge } from '../filters/filter-bridge';
import { sqlLiteral } from '../lineage/lineage-tracer';
import type { FkNavigator } from '../navigation/fk-navigator';
import { DriftViewerPanel } from '../panel';
import type { MutationEvent } from '../api-types';

/**
 * Opens the main panel and applies a PK-based where-filter for the selected event.
 */
export async function viewMutationEventRow(args: {
  eventId: number;
  events: readonly MutationEvent[];
  pkColumns: ReadonlyMap<string, string>;
  client: DriftApiClient;
  editingBridge: EditingBridge;
  fkNavigator: FkNavigator;
  filterBridge: FilterBridge;
  isDisposed?(): boolean;
}): Promise<void> {
  const {
    eventId,
    events,
    pkColumns,
    client,
    editingBridge,
    fkNavigator,
    filterBridge,
    isDisposed,
  } = args;
  const event = events.find((e) => e.id === eventId);
  if (!event) return;

  const row = event.after?.[0] ?? event.before?.[0] ?? undefined;
  if (!row) {
    vscode.window.showWarningMessage(`No row snapshot available for event ${eventId}.`);
    return;
  }

  const pkColumn = pkColumns.get(event.table) ?? 'rowid';
  const pkValue = row[pkColumn];
  if (pkValue === undefined) {
    vscode.window.showWarningMessage(
      `Could not find primary key value for ${event.table}.${pkColumn}.`,
    );
    return;
  }

  DriftViewerPanel.createOrShow(
    client.host,
    client.port,
    editingBridge,
    fkNavigator,
    filterBridge,
  );

  // Let the panel initialize before injecting and applying WHERE filter state.
  setTimeout(() => {
    // Skip async follow-up when caller context has already been disposed.
    if (isDisposed?.()) return;
    const where = `"${pkColumn}" = ${sqlLiteral(pkValue)}`;
    void filterBridge.applyWhereFilter({
      table: event.table,
      name: `Mutation ${event.type.toUpperCase()} #${event.id}`,
      where,
    });
  }, 600);
}
