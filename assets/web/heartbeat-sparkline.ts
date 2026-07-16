/**
 * Heartbeat screen — per-card activity sparkline (Feature 80, phase 1
 * hardening).
 *
 * Each table card carries a miniature scrolling trace of that table's own
 * last 30 s of activity, sharing the main monitor's visual language: thin
 * glowing trace in the cool accent, warm re-stroke over buckets that contain
 * writes, faint baseline, left-edge fade into the past. Ring math comes from
 * heartbeat-heat.ts (same bucket model as the monitor, coarser buckets), the
 * trace path from heartbeat-chart.ts — one silhouette, two scales.
 *
 * Cost discipline: sparklines are drawn from the screen's SINGLE rAF loop
 * (heartbeat-cards.ts forwards the frame) — no per-card rAF. A sparkline is
 * redrawn ONLY when its ring visibly changed (events recorded, a non-empty
 * ring advanced, theme/resize invalidation); a grid full of idle cards costs
 * zero canvas work per frame. Theme colors are read once per second for the
 * whole module, not per card.
 */
import {
  HeartbeatBucket,
  advanceBuckets,
  makeBucketRing,
  spikeHeight,
} from './heartbeat-heat.ts';
import { buildTracePath, withAlpha } from './heartbeat-chart.ts';

/** Coarser buckets than the monitor's 250 ms: a card canvas is a fraction of
 *  the monitor's width, so 60 columns is all the horizontal resolution the
 *  eye gets — finer buckets would just alias. */
export const SPARK_BUCKET_MS = 500;

/** 60 × 500 ms = the same 30 s window as the main monitor, so a spike on a
 *  card lines up in time with the corresponding beat on the monitor. */
export const SPARK_BUCKET_COUNT = 60;

/** Theme colors shared by ALL sparklines (the --hb-* custom properties are
 *  inherited from .heartbeat-screen, so every card resolves identical
 *  values — one getComputedStyle per second serves the whole grid). */
interface SparkColors {
  read: string;
  warm: string;
  grid: string;
}

let colors: SparkColors = { read: '#888', warm: '#888', grid: 'rgba(128,128,128,0.2)' };
let lastColorReadMs = 0;

/** Monotonic repaint generation. Bumping it makes every sparkline — including
 *  idle flat ones that normally skip redraw — repaint on its next frame.
 *  Bumped on theme change and window resize (a resized flat canvas is a
 *  stretched, blurry bitmap until repainted). */
let redrawGen = 1;
let resizeHooked = false;

/** Cached media query — reduced-motion users get static bars instead of the
 *  glowing scrolling trace (checked live via .matches so an OS-level toggle
 *  takes effect without a reload). */
const reduceMotion: MediaQueryList | null =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** Forces every sparkline to re-read theme colors and repaint on its next
 *  frame. Called on the sda-theme-change event. */
export function invalidateSparklines(): void {
  lastColorReadMs = 0;
  redrawGen++;
}

function ensureResizeHook(): void {
  if (resizeHooked || typeof window === 'undefined') return;
  resizeHooked = true;
  window.addEventListener('resize', function () { redrawGen++; });
}

function refreshColors(el: Element, nowMs: number): void {
  if (nowMs - lastColorReadMs < 1000 && lastColorReadMs !== 0) return;
  lastColorReadMs = nowMs;
  const cs = getComputedStyle(el);
  colors = {
    read: cs.getPropertyValue('--hb-read').trim() || '#888',
    warm: cs.getPropertyValue('--hb-warm').trim() || '#888',
    grid: cs.getPropertyValue('--hb-grid').trim() || 'rgba(128,128,128,0.2)',
  };
}

export interface CardSparkline {
  /** Adds one poll tick's events for this card's table to the newest bucket. */
  recordEvents(reads: number, writes: number): void;
  /** Advances time + redraws if anything changed. Forwarded from the screen's
   *  single rAF loop by heartbeat-cards.ts. */
  frame(nowMs: number): void;
}

export function createCardSparkline(canvas: HTMLCanvasElement): CardSparkline {
  const ring: HeartbeatBucket[] = makeBucketRing(SPARK_BUCKET_COUNT);
  let lastAdvanceMs = 0;
  /** True when the last draw is stale (data changed since). */
  let dirty = true;
  /** True while any bucket still holds events — lets idle advances skip work. */
  let hasData = false;
  /** redrawGen value at the last draw; a mismatch forces a repaint. */
  let drawnGen = 0;
  ensureResizeHook();

  function ringEmpty(): boolean {
    for (let i = 0; i < ring.length; i++) {
      if (ring[i].reads + ring[i].writes > 0) return false;
    }
    return true;
  }

  /** Backing store = CSS box × devicePixelRatio, same as the monitor, so the
   *  thin trace stays crisp on high-DPI displays. No-op when unchanged. */
  function fitCanvas(): { w: number; h: number } {
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const bh = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    return { w: bw, h: bh };
  }

  /** Reduced-motion rendering: static bars, no glow, no trace silhouette —
   *  the data is still legible but nothing sweeps or pulses. */
  function drawBars(ctx: CanvasRenderingContext2D, w: number, baseY: number, amp: number): void {
    const step = w / SPARK_BUCKET_COUNT;
    for (let i = 0; i < SPARK_BUCKET_COUNT; i++) {
      const b = ring[i];
      const total = b.reads + b.writes;
      if (total <= 0) continue;
      const h = Math.max(1, spikeHeight(total) * amp);
      // Warm when the bucket contains writes — same channel semantics as the
      // trace, carried by the bar itself since there is no overlay stroke.
      ctx.fillStyle = withAlpha(ctx, b.writes > 0 ? colors.warm : colors.read, 0.85);
      ctx.fillRect(i * step + step * 0.2, baseY - h, step * 0.6, h);
    }
  }

  function draw(nowMs: number): void {
    // Context is re-acquired every draw, never cached: the card grid resorts
    // by re-inserting card elements, and a context obtained before a DOM move
    // is not guaranteed usable across all engines. getContext on an existing
    // canvas is cheap (returns the same object when still valid).
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = fitCanvas();
    refreshColors(canvas.parentElement || canvas, nowMs);
    ctx.clearRect(0, 0, w, h);

    const dpr = window.devicePixelRatio || 1;
    // Baseline low in the box (like the monitor's 0.7) leaves headroom for
    // spikes; amp stops short of the top edge so glow is not clipped.
    const baseY = h * 0.74;
    const amp = h * 0.62;

    // Faint baseline: the "alive but idle" resting line.
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(baseY) + 0.5);
    ctx.lineTo(w, Math.round(baseY) + 0.5);
    ctx.stroke();

    if (reduceMotion && reduceMotion.matches) {
      drawBars(ctx, w, baseY, amp);
      return;
    }

    // Left-edge fade, same as the monitor: the trace dissolves into the past
    // instead of ending in a hard cut.
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, withAlpha(ctx, colors.read, 0.05));
    grad.addColorStop(0.35, withAlpha(ctx, colors.read, 0.5));
    grad.addColorStop(1, withAlpha(ctx, colors.read, 1));

    // Thinner stroke + smaller glow than the monitor — a card trace is an
    // accent, not the headline instrument.
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.shadowColor = withAlpha(ctx, colors.read, 0.75);
    ctx.shadowBlur = 5 * dpr;
    ctx.strokeStyle = grad;
    buildTracePath(ctx, ring, w, baseY, amp, function (b) { return b.reads + b.writes; });
    ctx.stroke();

    // Warm overlay over write-containing buckets — identical channel language
    // to the monitor so the eye transfers between the two without relearning.
    ctx.shadowColor = withAlpha(ctx, colors.warm, 0.75);
    ctx.strokeStyle = withAlpha(ctx, colors.warm, 0.9);
    buildTracePath(ctx, ring, w, baseY, amp, function (b) { return b.writes > 0 ? b.reads + b.writes : 0; });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  return {
    recordEvents: function (reads: number, writes: number): void {
      const last = ring[ring.length - 1];
      if (!last) return;
      last.reads += Math.max(0, reads);
      last.writes += Math.max(0, writes);
      if (reads > 0 || writes > 0) {
        hasData = true;
        dirty = true;
      }
    },
    frame: function (nowMs: number): void {
      if (lastAdvanceMs === 0) lastAdvanceMs = nowMs;
      const steps = Math.floor((nowMs - lastAdvanceMs) / SPARK_BUCKET_MS);
      if (steps > 0) {
        advanceBuckets(ring, steps);
        lastAdvanceMs += steps * SPARK_BUCKET_MS;
        // Advancing only changes pixels when there were events to scroll.
        // Idle cards therefore never mark themselves dirty — this is the
        // cheap-skip that keeps a big idle grid at zero canvas work.
        if (hasData) {
          dirty = true;
          hasData = !ringEmpty();
        }
      }
      if (!dirty && drawnGen === redrawGen) return;
      draw(nowMs);
      dirty = false;
      drawnGen = redrawGen;
    },
  };
}
