/**
 * Heartbeat screen — ECG-style activity monitor canvas (Feature 80).
 *
 * A scrolling heart-rate-monitor strip: flat glowing baseline when idle (with
 * a slow sweep glint so the screen visibly "breathes"), sharp spikes when
 * events arrive, spike height scaling with events per bucket. This is an
 * ambient live visualization, not an analytical chart — no axes/ticks; the
 * paired events/min vital readout (rendered in DOM by heartbeat-screen.ts)
 * carries the number.
 *
 * Colors are resolved from CSS custom properties on the canvas's container
 * (--hb-read / --hb-warm / --hb-grid, defined per theme in
 * _heartbeat-screen.scss), so the monitor recolors itself in every theme; the
 * only literals below are neutral '#888' last-resort fallbacks for a computed
 * style that fails to resolve (detached canvas, unloaded stylesheet). Values
 * are re-read at ~1 Hz — cheap, and picks up a live theme switch without a
 * MutationObserver.
 */
import {
  HeartbeatBucket,
  advanceBuckets,
  eventsPerMinute,
  makeBucketRing,
  spikeHeight,
} from './heartbeat-heat.ts';

/** Bucket width. 250 ms is finer than the ~750 ms poll so a single poll's
 *  events do not all collapse into one spike column. */
const BUCKET_MS = 250;

/** 120 × 250 ms = a 30 s scrolling window — long enough to see rhythm, short
 *  enough that a burst still dominates the strip. */
const BUCKET_COUNT = 120;

/** The idle sweep glint crosses the strip once per this period. Slow and
 *  calm on purpose: it signals "alive and watching", not activity. */
const SWEEP_PERIOD_MS = 5000;

/** Cached theme colors, refreshed at ~1 Hz (see module doc). */
interface MonitorColors {
  read: string;
  warm: string;
  grid: string;
}

export interface HeartbeatMonitor {
  /** Adds events to the newest bucket (called once per poll tick). */
  recordEvents(reads: number, writes: number): void;
  /** Advances time + redraws. Call from the screen's single rAF loop. */
  frame(nowMs: number): void;
  /** Current events/min across the visible window, for the vital readout. */
  eventsPerMinute(): number;
  /** True when no event is left in the window (flatline). */
  isFlat(): boolean;
  /** Forces the next frame to re-read theme colors. Called on the
   *  sda-theme-change event so a theme switch recolors the trace on the very
   *  next frame instead of waiting out the 1 Hz refresh throttle. */
  invalidateColors(): void;
}

/** Normalizes any CSS color (hex, rgb(), named) to `rgba(...)` with a forced
 *  alpha. Uses the canvas fillStyle round-trip, which the 2D context spec
 *  guarantees returns a parseable normalized form. Exported for the per-card
 *  sparklines (heartbeat-sparkline.ts) so both traces normalize colors
 *  identically. */
export function withAlpha(ctx: CanvasRenderingContext2D, color: string, alpha: number): string {
  ctx.fillStyle = color;
  const norm = String(ctx.fillStyle);
  if (norm.charAt(0) === '#') {
    const r = parseInt(norm.slice(1, 3), 16);
    const g = parseInt(norm.slice(3, 5), 16);
    const b = parseInt(norm.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  // Already rgba(r,g,b,a) — replace the alpha term.
  return norm.replace(/rgba?\(([^)]+)\)/, function (_m, inner) {
    const parts = String(inner).split(',').slice(0, 3).join(',');
    return 'rgba(' + parts + ',' + alpha + ')';
  });
}

/**
 * Builds the ECG trace path onto `ctx`: baseline with a sharp triangular
 * spike per active bucket, plus a small undershoot after tall spikes for the
 * classic cardiac-trace silhouette. `pick` selects which channel drives the
 * path. Shared by the main monitor and the per-card sparklines
 * (heartbeat-sparkline.ts) so both surfaces speak the same visual language —
 * a second hand-rolled path would drift apart over time.
 */
export function buildTracePath(
  ctx: CanvasRenderingContext2D,
  ring: HeartbeatBucket[],
  w: number,
  baseY: number,
  amp: number,
  pick: (b: HeartbeatBucket) => number,
): void {
  const step = w / ring.length;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let i = 0; i < ring.length; i++) {
    const total = pick(ring[i]);
    const x = (i + 0.5) * step;
    if (total <= 0) {
      ctx.lineTo(x, baseY);
      continue;
    }
    const h = spikeHeight(total) * amp;
    // Sharp rise/fall over half a bucket width, then a shallow undershoot —
    // the spike reads as a beat, not a bar.
    ctx.lineTo(x - step * 0.5, baseY);
    ctx.lineTo(x, baseY - h);
    ctx.lineTo(x + step * 0.35, baseY + h * 0.18);
    ctx.lineTo(x + step * 0.6, baseY);
  }
  ctx.lineTo(w, baseY);
}

export function createHeartbeatMonitor(canvas: HTMLCanvasElement): HeartbeatMonitor {
  const ring: HeartbeatBucket[] = makeBucketRing(BUCKET_COUNT);
  let lastAdvanceMs = 0;
  let colors: MonitorColors = { read: '#888', warm: '#888', grid: '#888' };
  let lastColorReadMs = 0;

  function refreshColors(nowMs: number): void {
    if (nowMs - lastColorReadMs < 1000 && lastColorReadMs !== 0) return;
    lastColorReadMs = nowMs;
    const cs = getComputedStyle(canvas.parentElement || canvas);
    colors = {
      read: cs.getPropertyValue('--hb-read').trim() || '#888',
      warm: cs.getPropertyValue('--hb-warm').trim() || '#888',
      grid: cs.getPropertyValue('--hb-grid').trim() || 'rgba(128,128,128,0.2)',
    };
  }

  /** Resizes the backing store to the CSS box × devicePixelRatio so the glow
   *  stroke stays crisp on high-DPI displays. No-op when unchanged. */
  function fitCanvas(): { w: number; h: number } {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    return { w: bw, h: bh };
  }

  function draw(nowMs: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = fitCanvas();
    refreshColors(nowMs);
    ctx.clearRect(0, 0, w, h);

    const dpr = window.devicePixelRatio || 1;
    const baseY = h * 0.7;
    const amp = h * 0.58;

    // Monitor grid: faint verticals every 10 buckets (2.5 s) + 4 horizontals.
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    for (let i = 10; i < BUCKET_COUNT; i += 10) {
      const x = Math.round((i / BUCKET_COUNT) * w) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let r = 1; r < 4; r++) {
      const y = Math.round((r / 4) * h) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Trace fades toward the older (left) edge via a gradient stroke, so the
    // strip visually scrolls into the past instead of ending in a hard cut.
    const readGrad = ctx.createLinearGradient(0, 0, w, 0);
    readGrad.addColorStop(0, withAlpha(ctx, colors.read, 0.06));
    readGrad.addColorStop(0.35, withAlpha(ctx, colors.read, 0.55));
    readGrad.addColorStop(1, withAlpha(ctx, colors.read, 1));

    ctx.lineWidth = 2 * dpr;
    ctx.lineJoin = 'round';
    ctx.shadowColor = withAlpha(ctx, colors.read, 0.85);
    ctx.shadowBlur = 9 * dpr;
    ctx.strokeStyle = readGrad;
    buildTracePath(ctx, ring, w, baseY, amp, function (b) { return b.reads + b.writes; });
    ctx.stroke();

    // Warm overlay: re-stroke only the spikes of buckets that contain writes /
    // detected changes, so write activity visibly tints the beat warm while
    // read-only traffic stays in the cool accent.
    ctx.shadowColor = withAlpha(ctx, colors.warm, 0.85);
    ctx.strokeStyle = withAlpha(ctx, colors.warm, 0.95);
    buildTracePath(ctx, ring, w, baseY, amp, function (b) { return b.writes > 0 ? b.reads + b.writes : 0; });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Idle sweep glint: a soft light band gliding along the strip. Kept even
    // during activity (it is dim enough not to compete) so motion never
    // stutters when traffic stops.
    const sweepX = ((nowMs % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * (w * 1.2) - w * 0.1;
    const band = w * 0.08;
    const sweep = ctx.createLinearGradient(sweepX - band, 0, sweepX + band, 0);
    sweep.addColorStop(0, withAlpha(ctx, colors.read, 0));
    sweep.addColorStop(0.5, withAlpha(ctx, colors.read, 0.10));
    sweep.addColorStop(1, withAlpha(ctx, colors.read, 0));
    ctx.fillStyle = sweep;
    ctx.fillRect(sweepX - band, 0, band * 2, h);
  }

  return {
    recordEvents: function (reads: number, writes: number): void {
      const last = ring[ring.length - 1];
      if (!last) return;
      last.reads += Math.max(0, reads);
      last.writes += Math.max(0, writes);
    },
    frame: function (nowMs: number): void {
      if (lastAdvanceMs === 0) lastAdvanceMs = nowMs;
      const steps = Math.floor((nowMs - lastAdvanceMs) / BUCKET_MS);
      if (steps > 0) {
        advanceBuckets(ring, steps);
        lastAdvanceMs += steps * BUCKET_MS;
      }
      draw(nowMs);
    },
    eventsPerMinute: function (): number {
      return eventsPerMinute(ring, BUCKET_MS);
    },
    isFlat: function (): boolean {
      for (let i = 0; i < ring.length; i++) {
        if (ring[i].reads + ring[i].writes > 0) return false;
      }
      return true;
    },
    invalidateColors: function (): void {
      // Zeroing the throttle clock makes the next refreshColors() call
      // unconditionally re-read the CSS custom properties.
      lastColorReadMs = 0;
    },
  };
}
