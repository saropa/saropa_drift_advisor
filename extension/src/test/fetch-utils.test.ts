import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  fetchWithTimeout,
  fetchWithRetry,
  isTransientError,
  DEFAULT_FETCH_TIMEOUT_MS,
} from '../transport/fetch-utils';
import {
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
  FAILURE_THRESHOLD,
  setGlobalBreakerRegistry,
} from '../transport/circuit-breaker';

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

describe('fetchWithTimeout — circuit breaker integration', () => {
  let fetchStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    clock = sinon.useFakeTimers();
    registry = new CircuitBreakerRegistry();
    setGlobalBreakerRegistry(registry);
  });

  afterEach(() => {
    fetchStub.restore();
    clock.restore();
    registry.dispose();
    setGlobalBreakerRegistry(undefined as never);
  });

  it('rejects immediately with CircuitBreakerOpenError when breaker is open', async () => {
    // Trip the 'schema' group breaker — the URL determines the group.
    const breaker = registry.getOrCreate('schema');
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    assert.strictEqual(breaker.state, 'open');

    await assert.rejects(
      () => fetchWithTimeout('http://localhost:8642/api/schema/metadata'),
      (err: Error) => err instanceof CircuitBreakerOpenError,
    );
    assert.strictEqual(fetchStub.callCount, 0, 'no network call when breaker is open');
  });

  it('feeds failure to breaker on network error', async () => {
    fetchStub.rejects(new Error('fetch failed'));

    await assert.rejects(
      () => fetchWithTimeout('http://localhost:8642/api/health', { bypassCircuitBreaker: true }),
      /fetch failed/,
    );
    // One failure is not enough to trip.
    const breaker = registry.getOrCreate('health');
    assert.strictEqual(breaker.state, 'closed');
  });

  it('feeds safety-timeout to breaker (the Windows/undici fix)', async () => {
    // Simulate FAILURE_THRESHOLD hanging fetches that all trigger the safety timer.
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      fetchStub.returns(new Promise<Response>(() => { /* never settles */ }));
      const promise = fetchWithTimeout('http://localhost:8642/api/schema/metadata', {
        timeoutMs: 100,
        bypassCircuitBreaker: true,
      });
      await clock.tickAsync(2101);
      await assert.rejects(promise, /Fetch timed out \(safety\)/);
      fetchStub.resetHistory();
    }
    const breaker = registry.getOrCreate('schema');
    assert.strictEqual(breaker.state, 'open',
      'safety timeouts must feed the breaker — this was the Phase 3 bug');
  });

  it('does not double-count CircuitBreakerOpenError (instanceof or name match)', async () => {
    // Trip the 'health' group breaker, then allow one half-open probe.
    const breaker = registry.getOrCreate('health');
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    clock.tick(30_000); // cooldown
    breaker.mayAttempt(); // half-open, probe in flight

    // Simulate an error whose name matches but isn't the same constructor
    // (cross-module duplication scenario).
    const foreignError = new Error('Circuit breaker is open');
    foreignError.name = 'CircuitBreakerOpenError';
    fetchStub.rejects(foreignError);

    const failuresBefore = (breaker as unknown as { _consecutiveFailures: number })._consecutiveFailures;
    await assert.rejects(
      () => fetchWithTimeout('http://localhost:8642/api/health', { bypassCircuitBreaker: true }),
    );
    const failuresAfter = (breaker as unknown as { _consecutiveFailures: number })._consecutiveFailures;
    assert.strictEqual(failuresAfter, failuresBefore,
      'breaker-open errors must not be counted as server failures');
  });

  it('isolates failures: one endpoint group tripped does not block another', async () => {
    // Trip the 'analytics' group breaker.
    const analytics = registry.getOrCreate('analytics');
    for (let i = 0; i < FAILURE_THRESHOLD; i++) analytics.recordFailure();
    assert.strictEqual(analytics.state, 'open');

    // A schema request to a different group should still pass through.
    fetchStub.resolves(new Response('ok', { status: 200 }));
    const resp = await fetchWithTimeout('http://localhost:8642/api/schema/metadata');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(fetchStub.callCount, 1, 'schema group is unaffected by analytics outage');
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

  it('should throw the server error body on a JSON-bodied 403 (kill switch)', async () => {
    // The monitoring kill switch answers every data endpoint with 403 + a
    // structured JSON error; the funnel converts it so every surface toasts
    // the explanation instead of a bare status.
    const message = 'Access Denied: halted by the global kill switch.';
    fetchStub.resolves(
      new Response(JSON.stringify({ error: message }), { status: 403 }),
    );
    await assert.rejects(
      () => fetchWithRetry('http://localhost:8642/api/tables'),
      (err: Error) => err.message === message,
    );
    // The kill-switch error is not transient — exactly one fetch, even
    // though a GET is idempotent and 5xx/network failures WOULD retry.
    assert.strictEqual(fetchStub.callCount, 1);
  });

  it('should pass a bodyless/non-JSON 403 through untouched', async () => {
    // Existing per-endpoint handlers format their own "… failed: 403";
    // only the kill switch's JSON error shape is intercepted.
    fetchStub.resolves(new Response('forbidden', { status: 403 }));
    const resp = await fetchWithRetry('http://localhost:8642/api/database');
    assert.strictEqual(resp.status, 403);
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

  // Audit M4: a non-idempotent POST must NOT be retried, even on a transient
  // error — the first attempt may have applied a server-side write before the
  // connection dropped, so re-sending would duplicate it.
  it('should NOT retry a POST (non-idempotent) on transient error', async () => {
    fetchStub
      .onFirstCall().rejects(new Error('fetch failed'))
      .onSecondCall().resolves(new Response('ok', { status: 200 }));
    await assert.rejects(
      () => fetchWithRetry('http://localhost:8642/api/import', { method: 'POST' }),
      /fetch failed/,
    );
    assert.strictEqual(fetchStub.callCount, 1);
  });

  it('should retry a POST flagged idempotent on transient error', async () => {
    fetchStub
      .onFirstCall().rejects(new Error('fetch failed'))
      .onSecondCall().resolves(new Response('ok', { status: 200 }));
    const resp = await fetchWithRetry('http://localhost:8642/api/sql', {
      method: 'POST',
      idempotent: true,
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(fetchStub.callCount, 2);
  });

  it('should retry PUT/DELETE (idempotent by method) on transient error', async () => {
    fetchStub
      .onFirstCall().rejects(new Error('fetch failed'))
      .onSecondCall().resolves(new Response('ok', { status: 200 }));
    const resp = await fetchWithRetry('http://localhost:8642/api/snapshot/x', {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(fetchStub.callCount, 2);
  });

  it('should strip idempotent from the init passed to native fetch', async () => {
    fetchStub.resolves(new Response('ok'));
    await fetchWithRetry('http://localhost:8642', { idempotent: true });
    const callArgs = fetchStub.firstCall.args[1] as Record<string, unknown>;
    assert.strictEqual(callArgs.idempotent, undefined);
  });
});
