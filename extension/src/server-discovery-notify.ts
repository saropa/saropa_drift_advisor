/**
 * User notifications for server discovery (found/lost).
 *
 * When a new port responds to `/api/health`, shows a toast with **Open URL** / **Copy URL**.
 * The optional sixth argument to [maybeNotifyServerEvent] lets the extension adopt that
 * host:port as the active server when the user opens the viewer in an external browser.
 */

import * as vscode from 'vscode';

/**
 * Show notification when a server is found or lost, with throttling.
 * Returns whether the notification was shown (caller can use this for throttle bookkeeping).
 *
 * When the user chooses **Open URL**, [onAfterOpenUrl] runs after launching the browser so
 * the extension can select the same host:port as active (browser and sidebar stay aligned).
 */
export function maybeNotifyServerEvent(
  host: string,
  port: number,
  event: 'found' | 'lost',
  lastNotifiedAt: Map<number, number>,
  throttleMs: number,
  onAfterOpenUrl?: (host: string, port: number) => void,
): void {
  const now = Date.now();
  const last = lastNotifiedAt.get(port);
  if (last !== undefined && now - last < throttleMs) return;
  lastNotifiedAt.set(port, now);

  if (event === 'found') {
    const url = `http://${host}:${port}`;
    void vscode.window
      .showInformationMessage(
        `Drift debug server detected on port ${port}`,
        'Open URL',
        'Copy URL',
        'Dismiss',
      )
      .then((choice) => {
        if (choice === 'Open URL') {
          void vscode.env.openExternal(vscode.Uri.parse(url));
          onAfterOpenUrl?.(host, port);
        } else if (choice === 'Copy URL') {
          void vscode.env.clipboard.writeText(url);
        }
      });
  } else {
    vscode.window.showWarningMessage(
      `Drift debug server on port ${port} is no longer responding`,
    );
  }
}
