/**
 * Phase 3 gate (connection-reliability-ongoing.md, gap 3): the circuit breaker
 * collapses uncapped independent retries into a single backoff when the server
 * is genuinely down.
 *
 * Unit tests (CircuitBreaker):
 *  - starts in closed state
 *  - stays closed when failures are below the threshold
 *  - trips open after FAILURE_THRESHOLD consecutive failures
 *  - rejects requests when open (before cooldown)
 *  - transitions to half-open after cooldown elapses
 *  - half-open allows exactly one concurrent probe
 *  - ignores stale success after breaker reopened from a concurrent failure
 *  - closes on successful half-open probe
 *  - reopens on failed half-open probe (restarts cooldown)
 *  - success resets the consecutive failure counter
 *  - reset() force-closes from open state
 *  - reset() force-closes from half-open state
 *  - does not fire onDidChange for no-op transitions
 *  - CircuitBreakerOpenError has the expected name
 *
 * Integration tests (retry budget):
 *  - total mayAttempt() successes are bounded while breaker is open
 *  - recovery resumes within one cooldown cycle of the server returning
 *
 * URL group extraction (endpointGroupFromUrl):
 *  - extracts first path segment after /api/
 *  - returns 'default' for non-/api/ paths
 *  - returns 'default' for malformed URLs
 *
 * Registry (CircuitBreakerRegistry):
 *  - lazily creates separate breakers per group
 *  - forUrl extracts the group and returns the matching breaker
 *  - isolates failures: tripping one group leaves others closed
 *  - resetAll force-closes every group
 *  - fires onDidChange with group name on state transitions
 *  - snapshot returns all tracked groups and their states
 *  - dispose cleans up all breakers
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
  FAILURE_THRESHOLD,
  COOLDOWN_MS,
  endpointGroupFromUrl,
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

  it('half-open allows exactly one concurrent probe', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    clock.tick(COOLDOWN_MS);

    // First caller passes — the single-probe slot is taken.
    assert.strictEqual(breaker.mayAttempt(), true);
    assert.strictEqual(breaker.state, 'half-open');

    // Second concurrent caller is rejected — probe already in flight.
    assert.strictEqual(breaker.mayAttempt(), false);
    assert.strictEqual(breaker.mayAttempt(), false);
  });

  it('ignores stale success after breaker reopened from a concurrent failure', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();
    clock.tick(COOLDOWN_MS);

    // Half-open probe starts.
    breaker.mayAttempt();
    assert.strictEqual(breaker.state, 'half-open');

    // Probe fails — breaker reopens.
    breaker.recordFailure();
    assert.strictEqual(breaker.state, 'open');

    // A stale success from a previously-started request arrives late.
    // It must NOT close the breaker — the failure is authoritative.
    breaker.recordSuccess();
    assert.strictEqual(breaker.state, 'open');
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

describe('endpointGroupFromUrl', () => {
  it('extracts the first path segment after /api/', () => {
    assert.strictEqual(endpointGroupFromUrl('http://localhost:8642/api/schema/metadata'), 'schema');
    assert.strictEqual(endpointGroupFromUrl('http://localhost:8642/api/dvr/start'), 'dvr');
    assert.strictEqual(endpointGroupFromUrl('http://localhost:8642/api/sql'), 'sql');
    assert.strictEqual(endpointGroupFromUrl('http://localhost:8642/api/analytics/anomalies'), 'analytics');
    assert.strictEqual(endpointGroupFromUrl('http://localhost:8642/api/health'), 'health');
  });

  it('returns "default" for non-/api/ paths', () => {
    assert.strictEqual(endpointGroupFromUrl('http://localhost:8642/other/path'), 'default');
    assert.strictEqual(endpointGroupFromUrl('http://localhost:8642/'), 'default');
  });

  it('returns "default" for malformed URLs', () => {
    assert.strictEqual(endpointGroupFromUrl('not-a-url'), 'default');
    assert.strictEqual(endpointGroupFromUrl(''), 'default');
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    registry.dispose();
    clock.restore();
  });

  it('lazily creates separate breakers per group', () => {
    const schema = registry.getOrCreate('schema');
    const dvr = registry.getOrCreate('dvr');
    assert.notStrictEqual(schema, dvr);
    // Same group returns the same instance.
    assert.strictEqual(registry.getOrCreate('schema'), schema);
  });

  it('forUrl extracts the group and returns the matching breaker', () => {
    const breaker = registry.forUrl('http://localhost:8642/api/schema/metadata');
    assert.strictEqual(breaker, registry.getOrCreate('schema'));
  });

  it('isolates failures: tripping one group leaves others closed', () => {
    const schema = registry.getOrCreate('schema');
    const analytics = registry.getOrCreate('analytics');

    for (let i = 0; i < FAILURE_THRESHOLD; i++) schema.recordFailure();
    assert.strictEqual(schema.state, 'open');
    assert.strictEqual(analytics.state, 'closed',
      'analytics must stay closed when only schema failed');
    assert.strictEqual(analytics.mayAttempt(), true);
  });

  it('resetAll force-closes every group', () => {
    const schema = registry.getOrCreate('schema');
    const dvr = registry.getOrCreate('dvr');

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      schema.recordFailure();
      dvr.recordFailure();
    }
    assert.strictEqual(schema.state, 'open');
    assert.strictEqual(dvr.state, 'open');

    registry.resetAll();
    assert.strictEqual(schema.state, 'closed');
    assert.strictEqual(dvr.state, 'closed');
  });

  it('fires onDidChange with group name on state transitions', () => {
    const events: Array<{ group: string; state: string }> = [];
    registry.onDidChange((e) => events.push(e));

    const breaker = registry.getOrCreate('analytics');
    for (let i = 0; i < FAILURE_THRESHOLD; i++) breaker.recordFailure();

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].group, 'analytics');
    assert.strictEqual(events[0].state, 'open');
  });

  it('snapshot returns all tracked groups and their states', () => {
    registry.getOrCreate('schema');
    const dvr = registry.getOrCreate('dvr');
    for (let i = 0; i < FAILURE_THRESHOLD; i++) dvr.recordFailure();

    const snap = registry.snapshot();
    assert.strictEqual(snap.length, 2);

    const schemaEntry = snap.find((s) => s.group === 'schema');
    const dvrEntry = snap.find((s) => s.group === 'dvr');
    assert.strictEqual(schemaEntry?.state, 'closed');
    assert.strictEqual(dvrEntry?.state, 'open');
  });

  it('dispose cleans up all breakers', () => {
    registry.getOrCreate('schema');
    registry.getOrCreate('dvr');
    // Should not throw.
    registry.dispose();
  });
});
