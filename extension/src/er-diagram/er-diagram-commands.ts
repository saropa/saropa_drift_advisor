/**
 * Command registration for ER Diagram feature.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { GenerationWatcher } from '../generation-watcher';
import { ErLayoutEngine } from './er-layout-engine';
import { ErDiagramPanel } from './er-diagram-panel';
import { fetchAllFks } from './er-diagram-utils';

export function registerErDiagramCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  watcher: GenerationWatcher,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showErDiagram',
      async (args?: { focusTable?: string }) => {
        await showErDiagram(client, args?.focusTable);
      },
    ),
  );

  // Auto-refresh ER diagram when schema changes
  const watcherSub = watcher.onDidChange(async () => {
    if (ErDiagramPanel.currentPanel) {
      await ErDiagramPanel.currentPanel.refresh();
    }
  });
  context.subscriptions.push(watcherSub);
}

async function showErDiagram(client: DriftApiClient, focusTable?: string): Promise<void> {
  try {
    const meta = await client.schemaMetadata();
    const allFks = await fetchAllFks(client, meta.map((t) => t.name));

    const engine = new ErLayoutEngine();
    const layout = engine.layout(meta, allFks, 'auto');

    ErDiagramPanel.createOrShow(client, layout, 'auto', focusTable);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to load ER Diagram: ${msg}`);
  }
}
