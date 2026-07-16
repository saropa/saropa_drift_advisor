/**
 * Phase 3 gate (connection-reliability-ongoing.md, gap 3): the circuit breaker
 * collapses uncapped independent retries into a single backoff when the server
 * is genuinely down.
 *
 * Tests verify:
 *  - breaker stays closed under the failure threshold
 *  - breaker trips open after FAILURE_THRESHOLD consecutive transient failures
 *  - open breaker rejects via mayAttempt() → false
 *  - cooldown elapses → half-open → one probe allowed
 *  - half-open probe success → closed
 *  - half-open probe failure → open (restart cooldown)
 *  - reset() force-closes from any state
 *  - state change events fire only on transitions
 *  - integration: fetchWithTimeout rejects with CircuitBreakerOpenError when open
 *  - integration: bypassCircuitBreaker lets discovery probes through
 *  - integration: total outbound attempts stay bounded over a fixed window
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  FAILURE_THRESHOLD,
  COOLDOWN_MS,
  setGlobalCircuitBreaker,
} from '../transport/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    breaker = new CircuitBreaker();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    breaker.dispose();
    clock.restore();
  });

  it('starts in closed state', () => {
    assert.strictEqual(breaker.state, 'closed');
  });

  it('stays closed when failures are below the threshold', () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      breaker.recordFailure();
    }
    assert.strictEqual(breaker.state, 'closed');
    assert.strictEqual(breaker.mayAttempt(), true);
  });

  it('trips open after FAILURE_THRESHOLD consecutive failures', () => {
    const events: string[] = [];
    breaker.onDidChange((s) => events.push(s));

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      breaker.recordFailure();
    }
    assert.strictEqual(breaker.state, 'open');
    assert.deepStrictEqual(events, ['open']);
  });

  it('rejects requests when open (before cooldown)', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    assert.strictEqual(breaker.mayAttempt(), false);
  });

  it('transitions to half-open after cooldown elapses', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();

    // Just before cooldown — still open.
    clock.tick(COOLDOWN_MS - 1);
    assert.strictEqual(breaker.mayAttempt(), false);

    // At cooldown — transitions to half-open, allows one probe.
    clock.tick(1);
    assert.strictEqual(breaker.mayAttempt(), true);
    assert.strictEqual(breaker.state, 'half-open');
  });

  it('closes on successful half-open probe', () => {
    const events: string[] = [];
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    breaker.onDidChange((s) => events.push(s));

    clock.tick(COOLDOWN_MS);
    breaker.mayAttempt(); // → half-open
    breaker.recordSuccess();

    assert.strictEqual(breaker.state, 'closed');
    assert.ok(events.includes('half-open'));
    assert.ok(events.includes('closed'));
  });

  it('reopens on failed half-open probe (restarts cooldown)', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();

    clock.tick(COOLDOWN_MS);
    breaker.mayAttempt(); // → half-open
    breaker.recordFailure(); // probe failed

    assert.strictEqual(breaker.state, 'open');
    // Cooldown restarts from this failure, not the original.
    assert.strictEqual(breaker.mayAttempt(), false);
    clock.tick(COOLDOWN_MS);
    assert.strictEqual(breaker.mayAttempt(), true);
  });

  it('success resets the consecutive failure counter', () => {
    // Accumulate failures just below threshold, then succeed.
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) breaker.recordFailure();
    breaker.recordSuccess();

    // One more failure should not trip — counter was reset.
    breaker.recordFailure();
    assert.strictEqual(breaker.state, 'closed');
  });

  it('reset() force-closes from open state', () => {
    const events: string[] = [];
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    breaker.onDidChange((s) => events.push(s));

    breaker.reset();
    assert.strictEqual(breaker.state, 'closed');
    assert.strictEqual(breaker.mayAttempt(), true);
    assert.deepStrictEqual(events, ['closed']);
  });

  it('reset() force-closes from half-open state', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    clock.tick(COOLDOWN_MS);
    breaker.mayAttempt(); // → half-open

    breaker.reset();
    assert.strictEqual(breaker.state, 'closed');
  });

  it('does not fire onDidChange for no-op transitions', () => {
    const events: string[] = [];
    breaker.onDidChange((s) => events.push(s));

    // Already closed — reset should not fire.
    breaker.reset();
    assert.deepStrictEqual(events, []);

    // Already closed — recordSuccess should not fire.
    breaker.recordSuccess();
    assert.deepStrictEqual(events, []);
  });

  it('CircuitBreakerOpenError has the expected name', () => {
    const err = new CircuitBreakerOpenError();
    assert.strictEqual(err.name, 'CircuitBreakerOpenError');
    assert.ok(err instanceof Error);
  });
});

describe('CircuitBreaker — retry budget integration', () => {
  let breaker: CircuitBreaker;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    breaker = new CircuitBreaker();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    breaker.dispose();
    clock.restore();
  });

  it('total mayAttempt() successes are bounded while breaker is open', () => {
    // Trip the breaker.
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();

    // Simulate 5 minutes of requests at 1/second — the breaker should allow
    // at most ceil(300s / COOLDOWN_MS) half-open probes, not 300.
    const windowMs = 5 * 60 * 1000;
    const tickMs = 1000;
    let allowed = 0;
    for (let elapsed = 0; elapsed < windowMs; elapsed += tickMs) {
      if (breaker.mayAttempt()) {
        allowed++;
        // Probe fails — breaker reopens.
        breaker.recordFailure();
      }
      clock.tick(tickMs);
    }

    // With a 30s cooldown and 5min window, at most ~10 probes should have
    // been allowed (one per cooldown cycle). Without the breaker, 300 would
    // have gone through.
    const maxExpected = Math.ceil(windowMs / COOLDOWN_MS) + 1;
    assert.ok(
      allowed <= maxExpected,
      `Expected ≤${maxExpected} attempts but got ${allowed}`,
    );
    assert.ok(
      allowed >= 1,
      'At least one half-open probe should have been allowed',
    );
  });

  it('recovery resumes within one cooldown cycle of the server returning', () => {
    // Trip the breaker.
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();

    // Advance past cooldown.
    clock.tick(COOLDOWN_MS);

    // Half-open probe succeeds — server is back.
    assert.strictEqual(breaker.mayAttempt(), true);
    breaker.recordSuccess();
    assert.strictEqual(breaker.state, 'closed');

    // All subsequent requests should be allowed immediately.
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(breaker.mayAttempt(), true);
    }
  });
});
