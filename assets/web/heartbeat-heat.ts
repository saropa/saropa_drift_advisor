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

/** Empty polls tolerated at the steady cadence before the poll interval
 *  starts to decay. Eight polls × 750 ms ≈ 6 s of proven silence — long
 *  enough that a human pausing between actions never sees a laggy board. */
export const IDLE_POLL_THRESHOLD = 8;

/** Geometric growth per empty poll beyond the threshold. 1.5× steps reach a
 *  2.5 s ceiling from 750 ms in three steps — gentle, not a cliff. */
export const IDLE_POLL_GROWTH = 1.5;

/**
 * Adaptive poll schedule: returns the delay before the NEXT activity poll
 * given how many consecutive polls came back with zero events.
 *
 * WHY: the original fixed 750 ms cadence meant an idle Heartbeat tab issued
 * ~80 HTTP requests/min against the debug target — a real battery/radio cost
 * on physical phones that sit connected for hours. The schedule keeps the
 * steady cadence while events arrive, then decays stepwise toward `ceilingMs`
 * once the screen is provably idle. The CALLER resets `consecutiveEmpty` to 0
 * the instant any event arrives, which snaps the very next delay back to
 * `baseMs` — responsiveness under load is unchanged.
 *
 * Pure by design (like the heat math above) so `node --test` exercises the
 * exact schedule the screen runs.
 */
export function nextPollDelay(
  consecutiveEmpty: number,
  baseMs: number,
  ceilingMs: number,
): number {
  const n = Math.max(0, Math.floor(consecutiveEmpty));
  if (n <= IDLE_POLL_THRESHOLD) return baseMs;
  const grown = baseMs * Math.pow(IDLE_POLL_GROWTH, n - IDLE_POLL_THRESHOLD);
  // max() guards a misconfigured ceiling below base: base always wins so the
  // schedule can never return a FASTER-than-steady cadence while idle.
  return Math.max(baseMs, Math.min(ceilingMs, Math.round(grown)));
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
