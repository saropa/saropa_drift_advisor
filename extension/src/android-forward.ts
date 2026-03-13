/**
 * ADB port forwarding for Android emulator/device.
 * When the Drift server runs inside the app on an emulator, the host cannot
 * reach it until we forward the port (like Flutter does for the VM service).
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import type { ServerDiscovery } from './server-discovery';

const execAsync = promisify(exec);

const THROTTLE_MS = 60_000;
const WORKSPACE_KEY = 'driftViewer.lastAutoAdbForwardAt';

/**
 * Runs `adb forward tcp:${port} tcp:${port}` so the host can reach the
 * Drift server running inside an Android emulator/device.
 * @param port — Host and device port (e.g. 8642).
 * @param execOverride — Optional test double; when omitted, uses real `adb` via child_process.
 * @throws Error if adb is not on PATH or no device/emulator is available.
 */
export async function runAdbForward(
  port: number,
  execOverride?: (cmd: string) => Promise<void>,
): Promise<void> {
  const cmd = `adb forward tcp:${port} tcp:${port}`;
  if (execOverride) {
    await execOverride(cmd);
    return;
  }
  await execAsync(cmd);
}

/**
 * If a Dart/Flutter debug session is active, we may be on an emulator.
 * Returns true when we should try adb forward (e.g. no servers found).
 */
export function hasFlutterOrDartDebugSession(): boolean {
  const session = vscode.debug.activeDebugSession;
  if (!session) return false;
  const t = session.type?.toLowerCase() ?? '';
  return t === 'dart' || t === 'flutter';
}

/**
 * Runs adb forward and retries discovery. Throttled so we don't spam adb
 * when discovery fires repeatedly (only one attempt per THROTTLE_MS per workspace).
 * Call this when discovery has no servers and we want to try Android forward.
 */
export async function tryAdbForwardAndRetry(
  port: number,
  discovery: ServerDiscovery,
  workspaceState: vscode.Memento,
  execOverride?: (cmd: string) => Promise<void>,
): Promise<boolean> {
  const now = Date.now();
  const last = workspaceState.get<number>(WORKSPACE_KEY, 0);
  if (now - last < THROTTLE_MS) {
    return false;
  }
  try {
    await runAdbForward(port, execOverride);
    await workspaceState.update(WORKSPACE_KEY, now);
    discovery.retry();
    return true;
  } catch {
    return false;
  }
}
