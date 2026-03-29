import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  fetchWithTimeout,
  fetchWithRetry,
  isTransientError,
  DEFAULT_FETCH_TIMEOUT_MS,
} from '../transport/fetch-utils';

describe('fetchWithTimeout', () => {
  let fetchStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    fetchStub.restore();
    clock.restore();
  });

  it('should resolve when fetch completes before timeout', async () => {
    fetchStub.resolves(new Response('ok', { status: 200 }));
    const resp = await fetchWithTimeout('http://localhost:8642/api/health');
    assert.strictEqual(resp.status, 200);
  });

  it('should use DEFAULT_FETCH_TIMEOUT_MS when no timeoutMs given', () => {
    assert.strictEqual(typeof DEFAULT_FETCH_TIMEOUT_MS, 'number');
    assert.ok(DEFAULT_FETCH_TIMEOUT_MS > 0);
  });

  it('should pass custom headers through to native fetch', async () => {
    fetchStub.resolves(new Response('ok'));
    await fetchWithTimeout('http://localhost:8642', {
      headers: { 'X-Custom': 'value' },
      timeoutMs: 5000,
    });
    const callArgs = fetchStub.firstCall.args[1];
    assert.strictEqual(callArgs.headers['X-Custom'], 'value');
  });

  it('should strip timeoutMs from the init passed to native fetch', async () => {
    fetchStub.resolves(new Response('ok'));
    await fetchWithTimeout('http://localhost:8642', { timeoutMs: 5000 });
    const callArgs = fetchStub.firstCall.args[1];
    assert.strictEqual(callArgs.timeoutMs, undefined);
  });

  it('should abort when caller signal is already aborted', async () => {
    const abortCtrl = new AbortController();
    abortCtrl.abort();
    fetchStub.callsFake(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new Error('aborted');
      return new Response('ok');
    });
    await assert.rejects(
      () => fetchWithTimeout('http://localhost', { signal: abortCtrl.signal }),
      /aborted/,
    );
  });
});

describe('fetchWithTimeout — safety layer (Windows/undici)', () => {
  let fetchStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    fetchStub.restore();
    clock.restore();
  });

  it('should reject via safety timer when fetch ignores AbortController abort', async () => {
    // Before: fetch() hung forever when AbortController.abort() was silently
    // ignored on Windows (undici bug), permanently deadlocking the tree.
    // After: Promise.race safety layer guarantees fetchWithTimeout always settles.
    fetchStub.returns(new Promise<Response>(() => { /* never settles */ }));

    const promise = fetchWithTimeout('http://localhost:8642', { timeoutMs: 1000 });

    // Advance past the abort timer (1000ms) AND safety timer (1000 + 2000 = 3000ms).
    await clock.tickAsync(3001);

    await assert.rejects(promise, /Fetch timed out \(safety\)/);
  });

  it('should not leak safety timer on successful fetch', async () => {
    fetchStub.resolves(new Response('ok', { status: 200 }));

    await fetchWithTimeout('http://localhost:8642', { timeoutMs: 1000 });

    // All timers (abort + safety) should be cleared in the finally block.
    // A leaked timer would cause an unhandled rejection when the clock advances.
    assert.strictEqual(clock.countTimers(), 0, 'all timers should be cleared after success');
  });
});

describe('isTransientError', () => {
  it('should return true for ECONNRESET', () => {
    assert.ok(isTransientError(new Error('read ECONNRESET')));
  });

  it('should return true for ETIMEDOUT', () => {
    assert.ok(isTransientError(new Error('connect ETIMEDOUT 127.0.0.1:8642')));
  });

  it('should return true for fetch failed', () => {
    assert.ok(isTransientError(new Error('fetch failed')));
  });

  it('should return true for aborted', () => {
    assert.ok(isTransientError(new Error('The operation was aborted')));
  });

  it('should return false for non-transient errors', () => {
    assert.strictEqual(isTransientError(new Error('JSON parse error')), false);
  });

  it('should return false for non-Error values', () => {
    assert.strictEqual(isTransientError('string'), false);
    assert.strictEqual(isTransientError(null), false);
  });

  it('should return false for safety timeout (not retryable)', () => {
    // The safety-layer timeout fires when AbortController is silently ignored
    // on Windows. Retrying would just hang again, so it must NOT be transient.
    assert.strictEqual(
      isTransientError(new Error('Fetch timed out (safety)')),
      false,
    );
  });
});

describe('fetchWithRetry', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('should return on first success', async () => {
    fetchStub.resolves(new Response('ok', { status: 200 }));
    const resp = await fetchWithRetry('http://localhost:8642');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(fetchStub.callCount, 1);
  });

  it('should retry once on 500 error', async () => {
    fetchStub
      .onFirstCall().resolves(new Response('err', { status: 500 }))
      .onSecondCall().resolves(new Response('ok', { status: 200 }));
    const resp = await fetchWithRetry('http://localhost:8642');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(fetchStub.callCount, 2);
  });

  it('should retry once on transient network error', async () => {
    fetchStub
      .onFirstCall().rejects(new Error('fetch failed'))
      .onSecondCall().resolves(new Response('ok', { status: 200 }));
    const resp = await fetchWithRetry('http://localhost:8642');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(fetchStub.callCount, 2);
  });

  it('should not retry on 4xx error', async () => {
    fetchStub.resolves(new Response('not found', { status: 404 }));
    const resp = await fetchWithRetry('http://localhost:8642');
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(fetchStub.callCount, 1);
  });

  it('should not retry on non-transient error', async () => {
    fetchStub.rejects(new Error('JSON parse error'));
    await assert.rejects(
      () => fetchWithRetry('http://localhost:8642'),
      /JSON parse error/,
    );
    assert.strictEqual(fetchStub.callCount, 1);
  });
});
