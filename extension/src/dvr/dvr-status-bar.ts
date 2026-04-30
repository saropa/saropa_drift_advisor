/**
 * Status bar entry for Query Replay DVR recording state and quick open.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';

let _item: vscode.StatusBarItem | undefined;

/**
 * Creates the DVR status item once and registers it for disposal.
 */
export function registerDvrStatusBar(context: vscode.ExtensionContext): void {
  if (_item) {
    return;
  }
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 49);
  item.command = 'driftViewer.openDvr';
  item.tooltip = 'Open Query Replay DVR';
  context.subscriptions.push(item);
  _item = item;
}

/**
 * Refreshes label from server status (query count, recording flag).
 * Hides the item when not in a debug session is left to callers; we only
 * hide on explicit [hideDvrStatusBar].
 */
export async function refreshDvrStatusBar(client: DriftApiClient): Promise<void> {
  if (!_item) {
    return;
  }
  try {
    const s = await client.dvrStatus();
    const icon = s.recording ? '$(record)' : '$(debug-stop)';
    _item.text = `${icon} DVR: ${s.recording ? 'Recording' : 'Stopped'} (${s.queryCount})`;
    _item.show();
  } catch {
    _item.text = '$(record) DVR';
    _item.show();
  }
}

/** Hides the DVR status item (e.g. after debug session ends). */
export function hideDvrStatusBar(): void {
  _item?.hide();
}
