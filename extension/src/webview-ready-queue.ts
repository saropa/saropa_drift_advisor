/**
 * Queues `postMessage` calls until the webview script signals readiness.
 *
 * Setting `webview.html` loads the document asynchronously. If the extension
 * calls `webview.postMessage()` before the inline script registers its
 * `message` event listener, the message is silently dropped and the panel
 * is stuck on stale/empty state. Time Travel already avoids this with a
 * manual `ready` handshake; this utility extracts the pattern so Dashboard,
 * Watch, and future panels can adopt it with one line.
 *
 * Usage:
 *   1. In the panel constructor, create a queue:
 *        this._queue = new WebviewReadyQueue(panel.webview);
 *   2. Replace `panel.webview.postMessage(msg)` with `this._queue.post(msg)`.
 *   3. After setting `webview.html`, the queue holds messages until the
 *      webview script posts `{ command: 'ready' }`.
 *   4. In the webview script, add at the end of the initialization block:
 *        vscode.postMessage({ command: 'ready' });
 *
 * Phase 4 of the connection reliability plan
 * (see `plans/connection-reliability-ongoing.md`, gap 4).
 */

import type * as vscode from 'vscode';

export const READY_COMMAND = 'ready';

export class WebviewReadyQueue {
  private _ready = false;
  private _queue: unknown[] = [];
  private readonly _webview: vscode.Webview;
  private readonly _disposable: vscode.Disposable;

  constructor(webview: vscode.Webview) {
    this._webview = webview;
    this._disposable = webview.onDidReceiveMessage((msg) => {
      if (
        msg !== null
        && typeof msg === 'object'
        && (msg as { command?: string }).command === READY_COMMAND
        && !this._ready
      ) {
        this._ready = true;
        this._flush();
      }
    });
  }

  /**
   * Post a message to the webview. If the webview has not signaled `ready`
   * yet, the message is queued and delivered in order once it does.
   */
  post(message: unknown): void {
    if (this._ready) {
      void this._webview.postMessage(message);
    } else {
      this._queue.push(message);
    }
  }

  /**
   * Reset the queue for a fresh HTML load (e.g. when `webview.html` is
   * reassigned). Drops any pending messages from the prior document and
   * waits for a new `ready` signal.
   */
  resetForNewHtml(): void {
    this._ready = false;
    this._queue = [];
  }

  get isReady(): boolean {
    return this._ready;
  }

  dispose(): void {
    this._disposable.dispose();
    this._queue = [];
  }

  private _flush(): void {
    for (const msg of this._queue) {
      void this._webview.postMessage(msg);
    }
    this._queue = [];
  }
}
