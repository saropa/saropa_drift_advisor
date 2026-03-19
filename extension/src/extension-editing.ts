/**
 * Data editing infrastructure: change tracker, editing bridge, pending changes view.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from './api-client';
import { ChangeTracker } from './editing/change-tracker';
import { EditingBridge } from './editing/editing-bridge';
import { PendingChangesProvider } from './editing/pending-changes-provider';
import { FilterBridge } from './filters/filter-bridge';
import { FilterStore } from './filters/filter-store';
import { FkNavigator } from './navigation/fk-navigator';
import { getLogVerbosity, shouldLogEditLine } from './log-verbosity';

export interface EditingSetupResult {
  changeTracker: ChangeTracker;
  editingBridge: EditingBridge;
  fkNavigator: FkNavigator;
  filterStore: FilterStore;
  filterBridge: FilterBridge;
  pendingProvider: PendingChangesProvider;
  pendingView: vscode.TreeView<unknown>;
}

/**
 * Create editing output channel, change tracker, editing bridge, FK navigator,
 * filter store/bridge, and pending changes tree view.
 */
export function setupEditing(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): EditingSetupResult {
  let verbosity = getLogVerbosity();
  const editOutputChannel = vscode.window.createOutputChannel(
    'Saropa Drift Advisor: Data Edits',
  );
  context.subscriptions.push(editOutputChannel);
  const filteredEditsSink = {
    appendLine: (msg: string): void => {
      if (shouldLogEditLine(msg, verbosity)) {
        editOutputChannel.appendLine(msg);
      }
    },
  };
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('driftViewer.logVerbosity')) {
        verbosity = getLogVerbosity();
      }
    }),
  );
  const changeTracker = new ChangeTracker(filteredEditsSink);
  context.subscriptions.push(changeTracker);
  const editingBridge = new EditingBridge(changeTracker);
  context.subscriptions.push(editingBridge);
  const fkNavigator = new FkNavigator(client);
  context.subscriptions.push(fkNavigator);
  const filterStore = new FilterStore(context.workspaceState);
  const filterBridge = new FilterBridge(filterStore, client);
  context.subscriptions.push(filterBridge);
  const pendingProvider = new PendingChangesProvider(changeTracker);
  const pendingView = vscode.window.createTreeView(
    'driftViewer.pendingChanges',
    { treeDataProvider: pendingProvider },
  );
  context.subscriptions.push(pendingView);

  return {
    changeTracker,
    editingBridge,
    fkNavigator,
    filterStore,
    filterBridge,
    pendingProvider,
    pendingView,
  };
}
