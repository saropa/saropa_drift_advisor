/**
 * Command wiring for Query Replay DVR operations.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { DvrPanel } from './dvr-panel';
import { refreshDvrStatusBar, registerDvrStatusBar } from './dvr-status-bar';

/**
 * Registers open/start/stop DVR commands.
 */
export function registerDvrCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  opts?: { queryIntelligence?: QueryIntelligence },
): void {
  DvrPanel.setQueryIntelligence(opts?.queryIntelligence);
  registerDvrStatusBar(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openDvr', () => {
      DvrPanel.createOrShow(context, client);
    }),
    vscode.commands.registerCommand('driftViewer.dvrStartRecording', async () => {
      await client.dvrStart();
      void refreshDvrStatusBar(client);
      void vscode.window.showInformationMessage('DVR recording started.');
    }),
    vscode.commands.registerCommand('driftViewer.dvrStopRecording', async () => {
      await client.dvrStop();
      void refreshDvrStatusBar(client);
      void vscode.window.showInformationMessage('DVR recording stopped.');
    }),
  );
}

