/**
 * Campaign candidate E gate (connection-reliability-ongoing.md): a scripted
 * forward drop (`adb forward --list` stops showing the expected entry after
 * having shown it) must be detected and re-forwarded within one supervisor
 * poll, honoring the two recovery contracts:
 *   - the 60 s re-forward throttle (workspace-state backed), and
 *   - discovery.retry({ resetNotifyLatch: false }) — never re-arm the toast
 *     latch on an automatic recovery (wrong path W2).
 *
 * Ticks are driven directly via _tick() so no fake timers are needed; the
 * poll interval itself is a constant, not behavior under test.
 */

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { AdbForwardSupervisor } from '../adb-forward-supervisor';
import type { ServerDiscovery } from '../server-discovery';

/** Map-backed vscode.Memento (only get/update are used by the throttle). */
function fakeMemento(initial: Record<string, unknown> = {}): vscode.Memento {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    keys: () => [...store.keys()],
    get: <T>(key: string, defaultValue?: T): T =>
      (store.has(key) ? store.get(key) : defaultValue) as T,
    update: (key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    },
  } as vscode.Memento;
}

/** Records retry() calls; the only ServerDiscovery member the recovery path touches. */
function fakeDiscovery() {
  const retries: Array<{ resetNotifyLatch?: boolean }> = [];
  return {
    retries,
    discovery: {
      retry: (options: { resetNotifyLatch?: boolean } = {}) => {
        retries.push(options);
      },
    } as unknown as ServerDiscovery,
  };
}

function makeSupervisor(opts: {
  listResults: Array<string | Error>;
  memento?: vscode.Memento;
}) {
  const { retries, discovery } = fakeDiscovery();
  const lines: string[] = [];
  const forwardCmds: string[] = [];
  let call = 0;
  const supervisor = new AdbForwardSupervisor({
    port: 8642,
    discovery,
    workspaceState: opts.memento ?? fakeMemento(),
    log: { appendLine: (l) => lines.push(l) },
    listForwardsOverride: () => {
      const r = opts.listResults[Math.min(call++, opts.listResults.length - 1)];
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
    forwardExecOverride: (cmd) => {
      forwardCmds.push(cmd);
      return Promise.resolve();
    },
  });
  return { supervisor, retries, lines, forwardCmds };
}

const ALIVE = 'emulator-5554 tcp:8642 tcp:8642';
const EMPTY = '';

describe('AdbForwardSupervisor', () => {
  it('re-forwards within one tick when a previously-observed forward drops', async () => {
    const { supervisor, retries, forwardCmds } = makeSupervisor({
      listResults: [ALIVE, ALIVE, EMPTY],
    });

    await supervisor._tick(); // observed alive
    await supervisor._tick(); // still alive
    assert.strictEqual(forwardCmds.length, 0, 'no action while alive');

    await supervisor._tick(); // dropped → recover
    assert.deepStrictEqual(forwardCmds, ['adb forward tcp:8642 tcp:8642']);
    // W2 contract: auto-recovery must preserve the once-per-session toast latch.
    assert.strictEqual(retries.length, 1);
    assert.strictEqual(retries[0].resetNotifyLatch, false);
  });

  it('stays silent when the forward was never observed (desktop session, no device)', async () => {
    const { supervisor, forwardCmds, retries } = makeSupervisor({
      listResults: [EMPTY],
    });

    await supervisor._tick();
    await supervisor._tick();
    await supervisor._tick();

    assert.strictEqual(forwardCmds.length, 0, 'absence without prior observation is not a drop');
    assert.strictEqual(retries.length, 0);
  });

  it('honors the 60s re-forward throttle on a detected drop', async () => {
    // A forward attempt was recorded moments ago (the reactive path already
    // fired): the supervisor detects the drop but the shared throttle blocks
    // the exec — no adb spam, retried on a later tick once the window passes.
    const memento = fakeMemento({ 'driftViewer.lastAutoAdbForwardAt': Date.now() });
    const { supervisor, forwardCmds, lines } = makeSupervisor({
      listResults: [ALIVE, EMPTY],
      memento,
    });

    await supervisor._tick(); // observed
    await supervisor._tick(); // dropped, but throttled

    assert.strictEqual(forwardCmds.length, 0, 'throttle window blocks the exec');
    assert.ok(
      lines.some((l) => l.includes('skipped (throttled) or failed')),
      'throttled outcome is logged, not silent',
    );
  });

  it('ignores a half-matching forward (same host port, different device port)', async () => {
    const { supervisor, forwardCmds } = makeSupervisor({
      listResults: [ALIVE, 'emulator-5554 tcp:8642 tcp:9999'],
    });

    await supervisor._tick(); // observed alive
    await supervisor._tick(); // wrong mapping → counts as dropped

    assert.strictEqual(forwardCmds.length, 1, 'a remapped forward is a drop, not alive');
  });

  it("stops supervision for the session when adb itself is unavailable", async () => {
    const { supervisor, lines } = makeSupervisor({
      listResults: [new Error('adb: not found')],
    });

    supervisor.start();
    assert.strictEqual(supervisor.isRunning, true);
    await supervisor._tick();

    assert.strictEqual(supervisor.isRunning, false, 'no point polling a missing adb');
    assert.ok(lines.some((l) => l.includes('adb unavailable')));
    supervisor.dispose();
  });

  it('start() resets prior-session observation state', async () => {
    const { supervisor, forwardCmds } = makeSupervisor({
      listResults: [ALIVE, EMPTY],
    });

    await supervisor._tick(); // observed in "previous" session
    supervisor.start(); // new debug session
    await supervisor._tick(); // EMPTY — but observation was reset

    assert.strictEqual(
      forwardCmds.length,
      0,
      'a forward observed in a previous session must not count as evidence',
    );
    supervisor.dispose();
  });

  it('start/stop are idempotent and dispose stops the timer', () => {
    const { supervisor } = makeSupervisor({ listResults: [EMPTY] });
    supervisor.start();
    supervisor.start();
    assert.strictEqual(supervisor.isRunning, true);
    supervisor.stop();
    supervisor.stop();
    assert.strictEqual(supervisor.isRunning, false);
    supervisor.start();
    supervisor.dispose();
    assert.strictEqual(supervisor.isRunning, false);
  });
});
