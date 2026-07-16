/**
 * Heartbeat screen — active-table card grid (Feature 80).
 *
 * Split out of heartbeat-screen.ts (which keeps polling + run-state) so each
 * heartbeat module stays under the repo's file-size cap. This module owns the
 * card DOM, the per-card heat scalars (--read-heat / --write-heat custom
 * properties mapped to glow by _heartbeat-screen.scss), and each card's
 * activity sparkline (heartbeat-sparkline.ts).
 *
 * The screen's single rAF loop calls cardsFrame() — cards never run their own
 * animation loop.
 */
import { vt } from './l10n.ts';
import { esc } from './utils.ts';
import { applyImpulses, decayHeat } from './heartbeat-heat.ts';
import { CardSparkline, createCardSparkline } from './heartbeat-sparkline.ts';

/** One table's activity row from GET /api/activity. */
export interface TableActivity {
  table: string;
  reads: number;
  writes: number;
  hostChanges: number;
  rowCount?: number;
  lastReadAt?: string;
  lastWriteAt?: string;
  lastHostChangeAt?: string;
}

interface CardState {
  el: HTMLElement;
  readsEl: HTMLElement | null;
  writesEl: HTMLElement | null;
  hostEl: HTMLElement | null;
  rowsEl: HTMLElement | null;
  spark: CardSparkline;
  readHeat: number;
  writeHeat: number;
  /** Epoch ms of the newest server-reported activity — drives grid order. */
  lastActiveMs: number;
}

const cards: Map<string, CardState> = new Map();

function byId(id: string): HTMLElement | null { return document.getElementById(id); }

/** True once any table card exists — the screen's empty state keys off it. */
export function hasCards(): boolean { return cards.size > 0; }

/** Latest ISO timestamp among a table's three activity channels, as epoch ms. */
function lastActivityMs(t: TableActivity): number {
  let best = 0;
  [t.lastReadAt, t.lastWriteAt, t.lastHostChangeAt].forEach(function (iso) {
    if (!iso) return;
    const ms = Date.parse(iso);
    if (!isNaN(ms) && ms > best) best = ms;
  });
  return best;
}

function buildCard(t: TableActivity): CardState {
  const el = document.createElement('div');
  el.className = 'hb-card hb-card-enter';
  el.innerHTML =
    '<div class="hb-card-head">' +
    '<span class="hb-card-name" title="' + esc(t.table) + '">' + esc(t.table) + '</span>' +
    '<span class="hb-card-rows meta" data-hb="rows"></span>' +
    '</div>' +
    '<div class="hb-card-stats">' +
    '<span class="hb-stat hb-stat--read" title="' + esc(vt('viewer.heartbeat.reads.tooltip')) + '">' +
    '<span class="hb-dot hb-dot--read" aria-hidden="true"></span>' +
    '<span class="hb-stat-val" data-hb="reads">0</span>' +
    '<span class="hb-stat-label">' + esc(vt('viewer.heartbeat.reads')) + '</span></span>' +
    '<span class="hb-stat hb-stat--write" title="' + esc(vt('viewer.heartbeat.writes.tooltip')) + '">' +
    '<span class="hb-dot hb-dot--write" aria-hidden="true"></span>' +
    '<span class="hb-stat-val" data-hb="writes">0</span>' +
    '<span class="hb-stat-label">' + esc(vt('viewer.heartbeat.writes')) + '</span></span>' +
    '<span class="hb-stat hb-stat--host" title="' + esc(vt('viewer.heartbeat.detectedChanges.tooltip')) + '">' +
    '<span class="hb-dot hb-dot--host" aria-hidden="true"></span>' +
    '<span class="hb-stat-val" data-hb="host">0</span>' +
    '<span class="hb-stat-label">' + esc(vt('viewer.heartbeat.detectedChanges')) + '</span></span>' +
    '</div>' +
    // Per-table mini trace. role="img" + aria-label because a canvas is
    // otherwise silent to screen readers; the label names the exact table so
    // the announcement is tied to a specific item, not "a chart".
    '<div class="hb-spark" title="' + esc(vt('viewer.heartbeat.sparkline.aria', t.table)) + '">' +
    '<canvas class="hb-spark-canvas" role="img" aria-label="' +
    esc(vt('viewer.heartbeat.sparkline.aria', t.table)) + '"></canvas>' +
    '</div>';
  // The enter animation class is dropped after it plays so re-sorting the grid
  // (which re-appends nodes) does not replay it on every reorder.
  el.addEventListener('animationend', function () { el.classList.remove('hb-card-enter'); });
  const sparkCanvas = el.querySelector('.hb-spark-canvas') as HTMLCanvasElement;
  return {
    el: el,
    readsEl: el.querySelector('[data-hb="reads"]'),
    writesEl: el.querySelector('[data-hb="writes"]'),
    hostEl: el.querySelector('[data-hb="host"]'),
    rowsEl: el.querySelector('[data-hb="rows"]'),
    spark: createCardSparkline(sparkCanvas),
    readHeat: 0,
    writeHeat: 0,
    lastActiveMs: 0,
  };
}

/** Creates/updates cards from the payload, then reorders the grid so the
 *  most-recently-active table is first. Counter text is patched in place —
 *  no innerHTML churn on updates, so the glow transition never restarts. */
export function applyTables(tables: TableActivity[]): void {
  const grid = byId('hb-grid');
  if (!grid) return;
  tables.forEach(function (t) {
    if (!t || !t.table) return;
    let card = cards.get(t.table);
    if (!card) {
      card = buildCard(t);
      cards.set(t.table, card);
      grid.appendChild(card.el);
    }
    if (card.readsEl) card.readsEl.textContent = String(t.reads || 0);
    if (card.writesEl) card.writesEl.textContent = String(t.writes || 0);
    if (card.hostEl) card.hostEl.textContent = String(t.hostChanges || 0);
    if (card.rowsEl && typeof t.rowCount === 'number') {
      card.rowsEl.textContent =
        t.rowCount === 1 ? vt('viewer.heartbeat.rowCountOne') : vt('viewer.heartbeat.rowCount', t.rowCount);
    }
    card.lastActiveMs = Math.max(card.lastActiveMs, lastActivityMs(t));
  });
  // Stable resort: only move nodes when order actually changed, so the DOM
  // stays quiet during steady-state polling. Moving a card's <canvas> keeps
  // its bitmap; the sparkline additionally re-acquires its context per draw,
  // so reordering can never leave a card drawing into a stale context.
  const ordered = Array.from(cards.values()).sort(function (a, b) { return b.lastActiveMs - a.lastActiveMs; });
  for (let i = 0; i < ordered.length; i++) {
    if (grid.children[i] !== ordered[i].el) grid.insertBefore(ordered[i].el, grid.children[i] || null);
  }
}

/** Applies one poll's recent events to the cards: heat impulses per table per
 *  channel (capped inside applyImpulses) + each card's sparkline bucket.
 *  Returns the poll-wide totals for the main monitor. */
export function applyCardEvents(
  events: Array<{ table: string; kind: string }>,
): { reads: number; writes: number } {
  let readCount = 0;
  let writeCount = 0;
  const perTable: Record<string, { reads: number; writes: number }> = {};
  events.forEach(function (e) {
    if (!e || !e.table) return;
    const slot = perTable[e.table] || (perTable[e.table] = { reads: 0, writes: 0 });
    // hostChange renders on the warm channel: it is inferred write activity.
    if (e.kind === 'read') { slot.reads++; readCount++; }
    else { slot.writes++; writeCount++; }
  });
  Object.keys(perTable).forEach(function (name) {
    const card = cards.get(name);
    if (!card) return;
    card.readHeat = applyImpulses(card.readHeat, perTable[name].reads);
    card.writeHeat = applyImpulses(card.writeHeat, perTable[name].writes);
    card.spark.recordEvents(perTable[name].reads, perTable[name].writes);
    card.lastActiveMs = Math.max(card.lastActiveMs, Date.now());
  });
  return { reads: readCount, writes: writeCount };
}

/** One animation frame for every card: decay the two heat scalars and let the
 *  sparkline advance/redraw. Called from the screen's single rAF loop. */
export function cardsFrame(dtMs: number, nowMs: number): void {
  cards.forEach(function (card) {
    const r = decayHeat(card.readHeat, dtMs);
    const w = decayHeat(card.writeHeat, dtMs);
    // Write CSS props only while hot: idle cards cost zero style work.
    if (r !== card.readHeat || r > 0) card.el.style.setProperty('--read-heat', r.toFixed(3));
    if (w !== card.writeHeat || w > 0) card.el.style.setProperty('--write-heat', w.toFixed(3));
    card.readHeat = r;
    card.writeHeat = w;
    card.spark.frame(nowMs);
  });
}
