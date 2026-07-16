/**
 * Heartbeat screen — pure heat/decay/bucket math (Feature 80).
 *
 * DOM-free by design so `node --test` can exercise the exact functions the
 * screen runs (same harness pattern as history-filter.ts). The heat model:
 * each activity event adds a fixed impulse, clamped to 1; a single shared
 * requestAnimationFrame loop decays every heat scalar exponentially. The
 * chart aggregates raw events into fixed-width time buckets so spike height
 * reflects traffic density, not individual event jitter.
 */

/** Heat added per event. 0.35 means one lone event gives a visible-but-modest
 *  pulse while a burst of 3 quick events saturates to full brightness. */
export const HEAT_IMPULSE = 0.35;

/** Exponential decay time constant. heat *= exp(-dt/450ms) reads as ~1.5 s to
 *  visually dark after a lone event, yet re-brightens instantly under load. */
export const HEAT_DECAY_TAU_MS = 450;

/** One poll (~750 ms) can deliver a 100-event burst for one table; three
 *  impulses already saturate (3 × 0.35 > 1), so extra impulses are wasted
 *  work. Cap per table per channel per poll tick. */
export const MAX_IMPULSES_PER_TICK = 3;

/** Below this the glow is invisible; snap to exactly 0 so render code can
 *  cheaply skip untouched cards instead of writing ever-smaller CSS values. */
export const HEAT_FLOOR = 0.004;

/**
 * Applies up to [MAX_IMPULSES_PER_TICK] impulses for `eventCount` events seen
 * in one poll tick. Result is clamped to [0, 1]. Negative or fractional
 * counts are floored to a whole number of impulses.
 */
export function applyImpulses(heat: number, eventCount: number): number {
  const impulses = Math.min(
    Math.max(0, Math.floor(eventCount)),
    MAX_IMPULSES_PER_TICK,
  );
  return Math.min(1, Math.max(0, heat) + HEAT_IMPULSE * impulses);
}

/**
 * Decays a heat scalar by `dtMs` of elapsed time. Exponential, so composing
 * two decays of dt1 and dt2 equals one decay of dt1+dt2 — the rAF loop can
 * therefore run at any frame rate (or resume after a suspension with a reset
 * dt) without changing the visual half-life.
 */
export function decayHeat(heat: number, dtMs: number): number {
  if (heat <= HEAT_FLOOR) return 0;
  if (dtMs <= 0) return heat;
  const next = heat * Math.exp(-dtMs / HEAT_DECAY_TAU_MS);
  return next <= HEAT_FLOOR ? 0 : next;
}

/** One chart time bucket: how many read events vs write-ish events (writes +
 *  detected host changes both render warm) landed in its time slice. */
export interface HeartbeatBucket {
  reads: number;
  writes: number;
}

/** Builds a zeroed ring of `count` buckets (index 0 = oldest, last = newest). */
export function makeBucketRing(count: number): HeartbeatBucket[] {
  const ring: HeartbeatBucket[] = [];
  for (let i = 0; i < count; i++) ring.push({ reads: 0, writes: 0 });
  return ring;
}

/**
 * Advances the ring by `steps` bucket widths: oldest buckets fall off the
 * left, fresh zeroed buckets appear on the right. Steps beyond the ring
 * length simply clear it (equivalent, and avoids pointless shifting).
 */
export function advanceBuckets(ring: HeartbeatBucket[], steps: number): void {
  const n = Math.max(0, Math.floor(steps));
  if (n === 0) return;
  if (n >= ring.length) {
    for (let i = 0; i < ring.length; i++) {
      ring[i].reads = 0;
      ring[i].writes = 0;
    }
    return;
  }
  ring.splice(0, n);
  for (let i = 0; i < n; i++) ring.push({ reads: 0, writes: 0 });
}

/**
 * Normalized spike height (0..1) for a bucket's total event count.
 * 1 - exp(-count/3): one event ≈ 0.28 (clearly visible), three ≈ 0.63,
 * ten ≈ 0.96 — dense traffic saturates instead of clipping off-scale, so the
 * monitor never needs a rescaling axis (it is ambient, not analytical).
 */
export function spikeHeight(totalEvents: number): number {
  if (totalEvents <= 0) return 0;
  return 1 - Math.exp(-totalEvents / 3);
}

/**
 * Events-per-minute over the whole ring window, for the monitor vital
 * readout. `bucketMs` is each bucket's width; the window is ring × bucketMs.
 */
export function eventsPerMinute(ring: HeartbeatBucket[], bucketMs: number): number {
  if (ring.length === 0 || bucketMs <= 0) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) total += ring[i].reads + ring[i].writes;
  const windowMs = ring.length * bucketMs;
  return Math.round(total * (60000 / windowMs));
}
