/**
 * Unit tests for the Heartbeat screen's pure heat/decay/bucket math
 * (heartbeat-heat.ts, Feature 80).
 *
 * The math is TypeScript bundled into the web app; there is no JS runtime for
 * it in unit tests, so — like the history-filter harness — esbuild compiles
 * the real `heartbeat-heat.ts` to an in-memory ESM module and the tests
 * exercise the actual exports. heartbeat-heat.ts is intentionally DOM-free so
 * it bundles cleanly here (the screen and chart modules are not).
 *
 * Run: `node --test assets/web/test/heartbeat-heat.test.mjs`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const out = await build({
  entryPoints: [join(here, '..', 'heartbeat-heat.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const mod = await import(
  'data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text)
);
const {
  HEAT_IMPULSE,
  HEAT_DECAY_TAU_MS,
  MAX_IMPULSES_PER_TICK,
  HEAT_FLOOR,
  applyImpulses,
  decayHeat,
  makeBucketRing,
  advanceBuckets,
  spikeHeight,
  eventsPerMinute,
} = mod;

describe('applyImpulses — impulse and clamp', () => {
  it('one event adds exactly one impulse', () => {
    assert.equal(applyImpulses(0, 1), HEAT_IMPULSE);
  });

  it('clamps to 1 no matter how hot the input', () => {
    assert.equal(applyImpulses(0.9, 1), 1);
    assert.equal(applyImpulses(1, 3), 1);
  });

  it('caps at MAX_IMPULSES_PER_TICK per tick: a 100-event burst equals a 3-event burst', () => {
    assert.equal(applyImpulses(0, 100), applyImpulses(0, MAX_IMPULSES_PER_TICK));
    // Three impulses saturate by design (3 × 0.35 > 1).
    assert.equal(applyImpulses(0, 100), 1);
  });

  it('zero or negative event counts leave heat unchanged', () => {
    assert.equal(applyImpulses(0.5, 0), 0.5);
    assert.equal(applyImpulses(0.5, -4), 0.5);
  });
});

describe('decayHeat — exponential decay', () => {
  it('decays by exp(-dt/tau)', () => {
    const h = decayHeat(1, HEAT_DECAY_TAU_MS);
    assert.ok(Math.abs(h - Math.exp(-1)) < 1e-9);
  });

  it('composes: many small steps equal one big step (frame-rate independence)', () => {
    // Synthetic uneven dt sequence summing to 480 ms — the rAF loop never
    // ticks uniformly, and the visual half-life must not depend on it.
    const steps = [16, 33, 16, 100, 250, 65];
    const totalMs = steps.reduce((a, b) => a + b, 0);
    let stepwise = 1;
    for (const dt of steps) stepwise = decayHeat(stepwise, dt);
    const oneShot = decayHeat(1, totalMs);
    assert.ok(Math.abs(stepwise - oneShot) < 1e-9);
  });

  it('snaps to exactly 0 below the visibility floor', () => {
    // 10 tau ≈ e^-10 ≈ 0.000045 — far below HEAT_FLOOR.
    assert.equal(decayHeat(1, HEAT_DECAY_TAU_MS * 10), 0);
    assert.equal(decayHeat(HEAT_FLOOR, 1), 0);
  });

  it('zero/negative dt leaves heat unchanged (resume-from-suspend reset)', () => {
    assert.equal(decayHeat(0.7, 0), 0.7);
    assert.equal(decayHeat(0.7, -5), 0.7);
  });
});

describe('bucket ring — aggregation for the monitor', () => {
  it('makeBucketRing builds zeroed buckets', () => {
    const ring = makeBucketRing(4);
    assert.equal(ring.length, 4);
    assert.deepEqual(ring[0], { reads: 0, writes: 0 });
  });

  it('advanceBuckets shifts old data left and zero-fills the right', () => {
    const ring = makeBucketRing(3);
    ring[2].reads = 5; // newest bucket has data
    advanceBuckets(ring, 1);
    assert.equal(ring.length, 3);
    assert.equal(ring[1].reads, 5); // aged by one slot
    assert.deepEqual(ring[2], { reads: 0, writes: 0 });
  });

  it('advancing past the window clears everything', () => {
    const ring = makeBucketRing(3);
    ring[0].writes = 2;
    ring[2].reads = 9;
    advanceBuckets(ring, 99);
    assert.deepEqual(ring, [
      { reads: 0, writes: 0 },
      { reads: 0, writes: 0 },
      { reads: 0, writes: 0 },
    ]);
  });

  it('advancing zero steps is a no-op', () => {
    const ring = makeBucketRing(2);
    ring[1].reads = 3;
    advanceBuckets(ring, 0);
    assert.equal(ring[1].reads, 3);
  });
});

describe('spikeHeight — bounded, monotonic', () => {
  it('is 0 for no events and grows with count', () => {
    assert.equal(spikeHeight(0), 0);
    assert.ok(spikeHeight(1) > 0.2); // a lone event is clearly visible
    assert.ok(spikeHeight(3) > spikeHeight(1));
    assert.ok(spikeHeight(10) > spikeHeight(3));
  });

  it('saturates at 1 instead of clipping off-scale', () => {
    // 1 - exp(-1000/3) rounds to exactly 1.0 in float64 — the bound is <= 1.
    assert.ok(spikeHeight(1000) <= 1);
    assert.ok(spikeHeight(1000) > 0.99);
    assert.ok(spikeHeight(10) < 1); // realistic counts stay strictly inside
  });
});

describe('eventsPerMinute — vital readout', () => {
  it('scales window totals to a per-minute rate', () => {
    // 4 buckets × 250 ms = 1 s window holding 2 events → 120 events/min.
    const ring = makeBucketRing(4);
    ring[0].reads = 1;
    ring[3].writes = 1;
    assert.equal(eventsPerMinute(ring, 250), 120);
  });

  it('is 0 for an empty ring or window', () => {
    assert.equal(eventsPerMinute([], 250), 0);
    assert.equal(eventsPerMinute(makeBucketRing(4), 250), 0);
  });
});
