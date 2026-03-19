/**
 * Command wiring for the Mutation Stream panel.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FilterBridge } from '../filters/filter-bridge';
import type { FkNavigator } from '../navigation/fk-navigator';
import { MutationStreamPanel } from './mutation-stream-panel';

export function registerMutationStreamCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  editingBridge: EditingBridge,
  fkNavigator: FkNavigator,
  filterBridge: FilterBridge,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openMutationStream',
      () => {
        MutationStreamPanel.createOrShow(
          client.host,
          client.port,
          client,
          editingBridge,
          fkNavigator,
          filterBridge,
        );
      },
    ),
  );
}

