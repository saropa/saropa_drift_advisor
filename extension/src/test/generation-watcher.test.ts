import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { GenerationWatcher } from '../generation-watcher';

describe('GenerationWatcher', () => {
  let client: DriftApiClient;
  let genStub: sinon.SinonStub;
  let watcher: GenerationWatcher;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    client = new DriftApiClient('127.0.0.1', 8642);
    // Stub the client method directly to avoid Response/fetch issues with fake timers
    genStub = sinon.stub(client, 'generation');
    watcher = new GenerationWatcher(client);
  });

  afterEach(() => {
    watcher.dispose();
    clock.restore();
    genStub.restore();
  });

  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }

  it('should fire onDidChange when generation changes', async () => {
    genStub.resolves(1);

    let fired = false;
    watcher.onDidChange(() => { fired = true; });
    watcher.start();

    await flush();

    assert.strictEqual(fired, true, 'listener should fire on generation change');
    assert.strictEqual(watcher.generation, 1);
  });

  it('should not fire when generation stays the same', async () => {
    genStub.resolves(0); // same as initial

    let fireCount = 0;
    watcher.onDidChange(() => { fireCount++; });
    watcher.start();

    await flush();

    assert.strictEqual(fireCount, 0, 'should not fire when generation unchanged');
  });

  it('should continue polling after errors with exponential backoff', async () => {
    genStub.onFirstCall().rejects(new Error('connection refused'));
    genStub.onSecondCall().resolves(1);

    let fired = false;
    watcher.onDidChange(() => { fired = true; });
    watcher.start();

    // First poll: error
    await flush();
    assert.strictEqual(fired, false, 'should not fire on error');

    // First error backoff: 1000 * 2^1 = 2000ms
    clock.tick(1000);
    await flush();
    assert.strictEqual(fired, false, 'should not retry at 1s (backoff is 2s)');

    clock.tick(1000);
    await flush();
    assert.strictEqual(fired, true, 'should fire after successful retry at 2s');
  });

  it('should reset backoff to 1s after a successful poll', async () => {
    genStub.onFirstCall().rejects(new Error('fail'));
    genStub.onSecondCall().resolves(1);
    genStub.onThirdCall().resolves(2);

    let fireCount = 0;
    watcher.onDidChange(() => { fireCount++; });
    watcher.start();

    await flush(); // error → backoff 2s
    clock.tick(2000);
    await flush(); // success (gen 1) → reset to 1s
    assert.strictEqual(fireCount, 1);

    clock.tick(1000);
    await flush(); // success (gen 2) at 1s delay
    assert.strictEqual(fireCount, 2, 'should poll at 1s after success');
  });

  it('should stop polling when stop() is called', async () => {
    genStub.resolves(1);

    watcher.start();
    await flush();

    watcher.stop();
    const callCount = genStub.callCount;

    // Advance timer — should not make new calls
    clock.tick(5000);
    await flush();

    assert.strictEqual(genStub.callCount, callCount, 'should not poll after stop');
  });

  it('should allow disposing a listener', async () => {
    genStub.resolves(1);

    let fired = false;
    const sub = watcher.onDidChange(() => { fired = true; });
    sub.dispose();

    watcher.start();
    await flush();

    assert.strictEqual(fired, false, 'disposed listener should not fire');
  });

  it('should not start twice', () => {
    genStub.returns(new Promise(() => { /* never resolves */ }));
    watcher.start();
    watcher.start();
    assert.strictEqual(genStub.callCount, 1, 'should only poll once');
  });

  it('should discard in-flight result after stop/reset/start (server-switch race)', async () => {
    // Simulate the server-switch sequence: poll is in flight when
    // stop(); reset(); start() runs synchronously.
    let resolveOld!: (gen: number) => void;
    // First call (old server): hangs until we resolve manually
    genStub.onFirstCall().returns(new Promise<number>((r) => { resolveOld = r; }));
    // Second call (new server after restart): resolves immediately
    genStub.onSecondCall().resolves(99);

    let fireCount = 0;
    watcher.onDidChange(() => { fireCount++; });
    watcher.start();
    await flush();

    // Server switch while old poll is in flight
    watcher.stop();
    watcher.reset();
    watcher.start();
    await flush();

    // New-server poll resolves → fires listener with gen 99
    assert.strictEqual(fireCount, 1, 'new-server poll should fire');
    assert.strictEqual(watcher.generation, 99);

    // Old-server poll resolves late — must be discarded
    resolveOld(47);
    await flush();

    // Generation must stay at 99 (not overwritten to 47) and no extra listener fire
    assert.strictEqual(fireCount, 1, 'old-server result must be discarded');
    assert.strictEqual(watcher.generation, 99, 'generation must not revert to old server value');
  });

  it('should not fork duplicate poll chains on repeated stop/start', async () => {
    // Each stop/start should produce exactly one active chain
    genStub.resolves(1);

    watcher.start();
    await flush();

    // Rapid stop/start cycles (simulating repeated server switches)
    for (let i = 0; i < 5; i++) {
      watcher.stop();
      watcher.reset();
      watcher.start();
      await flush();
    }

    const countAfterSetup = genStub.callCount;
    // Advance one poll interval — only one chain should fire
    // BASE_POLL_MS is 1000 in the watcher module
    clock.tick(1000);
    await flush();

    // Exactly one new poll call, not 5+ from forked chains
    assert.strictEqual(
      genStub.callCount - countAfterSetup,
      1,
      'only one poll chain should be active after repeated stop/start',
    );
  });

  it('should prevent restart after dispose()', async () => {
    genStub.resolves(1);

    watcher.start();
    await flush();

    // dispose() should stop polling and prevent future start()
    watcher.dispose();
    const countAfterDispose = genStub.callCount;

    // Attempt to restart — should be silently ignored
    watcher.start();
    clock.tick(5000);
    await flush();

    assert.strictEqual(
      genStub.callCount,
      countAfterDispose,
      'start() after dispose() must not resume polling',
    );
  });

  it('should clear listeners on dispose()', () => {
    // Verify the listener array is emptied so disposed watchers don't hold
    // references to callback closures (and their captured scopes).
    watcher.onDidChange(() => { /* no-op */ });
    watcher.onDidChange(() => { /* no-op */ });
    assert.strictEqual((watcher as any)._listeners.length, 2);

    watcher.dispose();
    assert.strictEqual((watcher as any)._listeners.length, 0, 'dispose must clear all listeners');
  });

  it('should not count AbortError as a consecutive error', async () => {
    // Simulate stop() aborting an in-flight request: the catch branch should
    // silently discard AbortError without incrementing _consecutiveErrors.
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    genStub.onFirstCall().rejects(abortErr);
    genStub.onSecondCall().resolves(1);

    watcher.start();
    await flush();

    // AbortError should not have bumped the error counter
    assert.strictEqual(
      (watcher as any)._consecutiveErrors,
      0,
      'AbortError must not count as a consecutive error',
    );
  });

  it('should not corrupt listener iteration when a listener calls stop()', async () => {
    // A listener that calls stop() mid-iteration must not prevent subsequent
    // listeners from firing — the snapshot protects the loop.
    genStub.resolves(1);

    const order: number[] = [];
    watcher.onDidChange(() => {
      order.push(1);
      // Calling stop() mid-iteration would previously have cleared _running
      // and could corrupt the poll state; with the snapshot, listener 2 still fires.
      watcher.stop();
    });
    watcher.onDidChange(() => { order.push(2); });
    watcher.start();
    await flush();

    assert.deepStrictEqual(order, [1, 2], 'all listeners must fire even if one calls stop()');
  });
});
