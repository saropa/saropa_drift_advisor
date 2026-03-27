/**
 * Tests for discovery toast notifications and optional post-open hooks.
 */
import * as assert from 'assert';
import { resetMocks, dialogMock } from './vscode-mock';
import { maybeNotifyServerEvent } from '../server-discovery-notify';

/** Flush microtasks so [showInformationMessage].then handlers run. */
async function flushUiPromise(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('maybeNotifyServerEvent', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('invokes onAfterOpenUrl with host and port when the user picks Open URL', async () => {
    dialogMock.infoMessageResult = 'Open URL';
    const notified = new Map<number, number>();
    let sawHost = '';
    let sawPort = -1;
    maybeNotifyServerEvent(
      '127.0.0.1',
      8642,
      'found',
      notified,
      0,
      (h, p) => {
        sawHost = h;
        sawPort = p;
      },
    );
    await flushUiPromise();
    assert.strictEqual(sawHost, '127.0.0.1');
    assert.strictEqual(sawPort, 8642);
  });

  it('does not invoke onAfterOpenUrl when the user dismisses the toast', async () => {
    dialogMock.infoMessageResult = undefined;
    const notified = new Map<number, number>();
    let called = false;
    maybeNotifyServerEvent('127.0.0.1', 8642, 'found', notified, 0, () => {
      called = true;
    });
    await flushUiPromise();
    assert.strictEqual(called, false);
  });
});
