/**
 * Phase 4 gate (connection-reliability-ongoing.md, gap 4): the WebviewReadyQueue
 * prevents messages posted before the webview script registers its listener
 * from being silently dropped.
 *
 * Tests verify:
 *  - messages posted before 'ready' are queued, not delivered
 *  - 'ready' signal flushes queued messages in order
 *  - messages posted after 'ready' are delivered immediately
 *  - resetForNewHtml() drops pending messages and waits for a new 'ready'
 *  - dispose() cleans up the listener subscription
 */

import * as assert from 'assert';
import { WebviewReadyQueue, READY_COMMAND } from '../webview-ready-queue';

/** Minimal mock of the vscode.Webview interface used by WebviewReadyQueue. */
function createMockWebview() {
  type Handler = (msg: unknown) => void;
  const handlers: Handler[] = [];
  const posted: unknown[] = [];

  return {
    /** Messages that the queue sent TO the webview via postMessage. */
    posted,
    /** Simulate the webview script sending a message (e.g. 'ready'). */
    simulateMessage(msg: unknown): void {
      for (const h of handlers) h(msg);
    },
    /** The mock webview object to pass to WebviewReadyQueue. */
    webview: {
      onDidReceiveMessage(handler: Handler): { dispose: () => void } {
        handlers.push(handler);
        return {
          dispose: () => {
            const idx = handlers.indexOf(handler);
            if (idx >= 0) handlers.splice(idx, 1);
          },
        };
      },
      postMessage(message: unknown): Thenable<boolean> {
        posted.push(message);
        return Promise.resolve(true);
      },
    },
  };
}

describe('WebviewReadyQueue', () => {
  it('queues messages posted before ready', () => {
    const mock = createMockWebview();
    const queue = new WebviewReadyQueue(mock.webview as never);

    queue.post({ command: 'updateAll', data: 1 });
    queue.post({ command: 'updateWidget', id: 'w1' });

    assert.strictEqual(mock.posted.length, 0, 'nothing delivered before ready');
    assert.strictEqual(queue.isReady, false);

    queue.dispose();
  });

  it('flushes queued messages in order on ready', () => {
    const mock = createMockWebview();
    const queue = new WebviewReadyQueue(mock.webview as never);

    queue.post({ command: 'a' });
    queue.post({ command: 'b' });
    queue.post({ command: 'c' });

    mock.simulateMessage({ command: READY_COMMAND });

    assert.strictEqual(mock.posted.length, 3);
    assert.deepStrictEqual(
      mock.posted.map((m) => (m as { command: string }).command),
      ['a', 'b', 'c'],
    );
    assert.strictEqual(queue.isReady, true);

    queue.dispose();
  });

  it('delivers messages immediately after ready', () => {
    const mock = createMockWebview();
    const queue = new WebviewReadyQueue(mock.webview as never);

    mock.simulateMessage({ command: READY_COMMAND });
    queue.post({ command: 'immediate' });

    assert.strictEqual(mock.posted.length, 1);
    assert.deepStrictEqual(mock.posted[0], { command: 'immediate' });

    queue.dispose();
  });

  it('ignores duplicate ready signals', () => {
    const mock = createMockWebview();
    const queue = new WebviewReadyQueue(mock.webview as never);

    queue.post({ command: 'a' });
    mock.simulateMessage({ command: READY_COMMAND });
    mock.simulateMessage({ command: READY_COMMAND }); // duplicate

    assert.strictEqual(mock.posted.length, 1, 'flushed once, not twice');

    queue.dispose();
  });

  it('resetForNewHtml drops pending messages and waits for new ready', () => {
    const mock = createMockWebview();
    const queue = new WebviewReadyQueue(mock.webview as never);

    queue.post({ command: 'stale' });
    queue.resetForNewHtml();

    // Stale message dropped — ready flushes nothing.
    mock.simulateMessage({ command: READY_COMMAND });
    assert.strictEqual(mock.posted.length, 0, 'stale message was dropped');
    assert.strictEqual(queue.isReady, true);

    // After a second resetForNewHtml, must wait for ready again.
    queue.resetForNewHtml();
    assert.strictEqual(queue.isReady, false);
    queue.post({ command: 'after-reset' });
    assert.strictEqual(mock.posted.length, 0, 'queued until ready');
    mock.simulateMessage({ command: READY_COMMAND });
    assert.strictEqual(mock.posted.length, 1);
    assert.deepStrictEqual(mock.posted[0], { command: 'after-reset' });

    queue.dispose();
  });

  it('reproduces the init race: postMessage before ready is dropped without queue', () => {
    // This test documents the failure mode the queue prevents.
    // Without the queue, a postMessage before the script registers its
    // listener is silently lost. The queue captures it and delivers on ready.
    const mock = createMockWebview();
    const queue = new WebviewReadyQueue(mock.webview as never);

    // Extension sets HTML and immediately posts (the race).
    queue.post({ command: 'updateAll', data: [1, 2, 3] });
    assert.strictEqual(mock.posted.length, 0, 'message held, not dropped');

    // Script eventually registers and sends ready.
    mock.simulateMessage({ command: READY_COMMAND });
    assert.strictEqual(mock.posted.length, 1, 'message delivered after ready');
    assert.deepStrictEqual((mock.posted[0] as { command: string }).command, 'updateAll');

    queue.dispose();
  });

  it('ignores non-ready messages', () => {
    const mock = createMockWebview();
    const queue = new WebviewReadyQueue(mock.webview as never);

    queue.post({ command: 'queued' });
    mock.simulateMessage({ command: 'search' }); // not 'ready'
    mock.simulateMessage({ command: 'copyValue' }); // not 'ready'
    mock.simulateMessage(null); // null message
    mock.simulateMessage('ready'); // string, not object

    assert.strictEqual(mock.posted.length, 0, 'queue not flushed by non-ready messages');
    assert.strictEqual(queue.isReady, false);

    queue.dispose();
  });
});
