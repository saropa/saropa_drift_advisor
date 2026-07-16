/**
 * Heartbeat screen (Feature 80, phase 1): live table-activity board.
 *
 * Top: ECG-style monitor (heartbeat-chart.ts) aggregating all recent events.
 * Below: a card grid of ACTIVE tables only (the server already hides idle
 * tables), most-recently-active first. Each card carries two heat scalars —
 * reads (cool, theme accent) and writes + detected changes (warm) — driven
 * onto CSS custom properties --read-heat / --write-heat; _heartbeat-screen.scss
 * maps them to glow and border color.
 *
 * Lifecycle: polling (~750 ms) and the single rAF loop run ONLY while the
 * heartbeat tab is active AND the document is visible; both fully suspend
 * otherwise (no background CPU, and the board never glows from its own
 * polling — the server additionally excludes internal probes).
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { esc } from './utils.ts';
import { applyImpulses, decayHeat } from './heartbeat-heat.ts';
import { createHeartbeatMonitor, HeartbeatMonitor } from './heartbeat-chart.ts';

/** Steady poll cadence while the screen is watched. */
const POLL_MS = 750;
/** Failure backoff cap — keeps retries polite when the server is gone. */
const POLL_BACKOFF_MAX_MS = 6000;

interface TableActivity {
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
  readHeat: number;
  writeHeat: number;
  /** Epoch ms of the newest server-reported activity — drives grid order. */
  lastActiveMs: number;
}

const cards: Map<string, CardState> = new Map();
let monitor: HeartbeatMonitor | null = null;
let tabActive = false;
let pollTimer: number | null = null;
let pollFailures = 0;
let sinceGen = 0;
let rafId: number | null = null;
let lastFrameTs = 0;
/** Guards against a slow poll response landing after suspension. */
let pollToken = 0;

function byId(id: string): HTMLElement | null { return document.getElementById(id); }

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

/** True while a status message (disabled/unavailable/reconnecting) is up. */
let statusShowing = false;

/** Shows one status message over the monitor (or hides it when msg is null). */
function setMonitorMessage(msg: string | null, tone?: string): void {
  statusShowing = msg != null;
  const el = byId('hb-monitor-msg');
  if (el) {
    el.hidden = msg == null;
    el.textContent = msg || '';
    el.className = 'hb-monitor-msg' + (tone ? ' hb-monitor-msg--' + tone : '');
  }
  // A visible status owns the narrative — the "waiting for activity" line
  // below would contradict "monitoring disabled" / "connection lost".
  updateEmptyState();
}

/** The calm empty state: shown until the first activity arrives, and never
 *  alongside a monitor status message (see setMonitorMessage). */
function updateEmptyState(): void {
  const empty = byId('hb-empty');
  if (empty) empty.hidden = cards.size > 0 || statusShowing;
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
    '</div>';
  // The enter animation class is dropped after it plays so re-sorting the grid
  // (which re-appends nodes) does not replay it on every reorder.
  el.addEventListener('animationend', function () { el.classList.remove('hb-card-enter'); });
  return {
    el: el,
    readsEl: el.querySelector('[data-hb="reads"]'),
    writesEl: el.querySelector('[data-hb="writes"]'),
    hostEl: el.querySelector('[data-hb="host"]'),
    rowsEl: el.querySelector('[data-hb="rows"]'),
    readHeat: 0,
    writeHeat: 0,
    lastActiveMs: 0,
  };
}

/** Creates/updates cards from the payload, then reorders the grid so the
 *  most-recently-active table is first. Counter text is patched in place —
 *  no innerHTML churn on updates, so the glow transition never restarts. */
function applyTables(tables: TableActivity[]): void {
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
  // stays quiet during steady-state polling.
  const ordered = Array.from(cards.values()).sort(function (a, b) { return b.lastActiveMs - a.lastActiveMs; });
  for (let i = 0; i < ordered.length; i++) {
    if (grid.children[i] !== ordered[i].el) grid.insertBefore(ordered[i].el, grid.children[i] || null);
  }
  updateEmptyState();
}

/** Applies one poll's recent events: heat impulses per table per channel
 *  (capped inside applyImpulses) + monitor bucket counts. */
function applyEvents(events: Array<{ table: string; kind: string }>): void {
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
    card.lastActiveMs = Math.max(card.lastActiveMs, Date.now());
  });
  if (monitor && (readCount || writeCount)) monitor.recordEvents(readCount, writeCount);
}

function updateVital(): void {
  if (!monitor) return;
  const epm = monitor.eventsPerMinute();
  const valEl = byId('hb-vitals-value');
  if (valEl) valEl.textContent = String(epm);
  const wrap = byId('hb-vitals');
  if (wrap) wrap.setAttribute('aria-label', vt('viewer.heartbeat.vitalSummary', epm));
}

function schedulePoll(delayMs: number): void {
  if (pollTimer != null) clearTimeout(pollTimer);
  pollTimer = window.setTimeout(pollOnce, delayMs);
}

function pollOnce(): void {
  pollTimer = null;
  if (!shouldRun()) return;
  const token = ++pollToken;
  fetch('/api/activity?since=' + sinceGen, S.authOpts())
    .then(function (r) { return r.json().then(function (data) { return { status: r.status, ok: r.ok, data: data }; }); })
    .then(function (res) {
      if (token !== pollToken || !shouldRun()) return;
      // Kill switch: structured 403 — show the server's message, stop polling.
      // Re-activating the tab retries (monitoring may have been re-enabled).
      if (res.status === 403) {
        const msg = (res.data && (res.data.error || res.data.message)) || vt('viewer.heartbeat.disabled');
        setMonitorMessage(String(msg), 'disabled');
        return;
      }
      // Endpoint missing (older server / server half not deployed yet):
      // degrade quietly rather than hammering a 404.
      if (res.status === 404 || res.status === 501) {
        setMonitorMessage(vt('viewer.heartbeat.unavailable'), 'muted');
        return;
      }
      if (!res.ok) throw new Error('activity poll HTTP ' + res.status);
      pollFailures = 0;
      setMonitorMessage(null);
      const data = res.data || {};
      if (typeof data.activityGeneration === 'number') sinceGen = data.activityGeneration;
      applyTables(Array.isArray(data.tables) ? data.tables : []);
      applyEvents(Array.isArray(data.recentEvents) ? data.recentEvents : []);
      updateVital();
      schedulePoll(POLL_MS);
    })
    .catch(function () {
      if (token !== pollToken || !shouldRun()) return;
      // Back off but keep trying; the global connection machinery
      // (connection.ts) independently surfaces the banner when the whole
      // server is gone. Resumes the steady cadence on the next success.
      pollFailures++;
      setMonitorMessage(vt('viewer.heartbeat.reconnecting'), 'muted');
      schedulePoll(Math.min(POLL_MS * Math.pow(2, pollFailures), POLL_BACKOFF_MAX_MS));
    });
}

// --- Single rAF loop: decays every card's heat + advances the monitor. ---

function frame(ts: number): void {
  rafId = requestAnimationFrame(frame);
  const dt = lastFrameTs === 0 ? 0 : ts - lastFrameTs;
  lastFrameTs = ts;
  cards.forEach(function (card) {
    const r = decayHeat(card.readHeat, dt);
    const w = decayHeat(card.writeHeat, dt);
    // Write CSS props only while hot: idle cards cost zero style work.
    if (r !== card.readHeat || r > 0) card.el.style.setProperty('--read-heat', r.toFixed(3));
    if (w !== card.writeHeat || w > 0) card.el.style.setProperty('--write-heat', w.toFixed(3));
    card.readHeat = r;
    card.writeHeat = w;
  });
  if (monitor) monitor.frame(ts);
}

function shouldRun(): boolean {
  return tabActive && document.visibilityState === 'visible';
}

/** Starts/stops polling + the rAF loop to match tab/visibility state. */
function updateRunState(): void {
  if (shouldRun()) {
    if (rafId == null) {
      // Reset the frame clock so time hidden is NOT applied as one giant decay
      // step on resume — heat continues from where the eye last saw it.
      lastFrameTs = 0;
      rafId = requestAnimationFrame(frame);
    }
    if (pollTimer == null) { pollFailures = 0; pollOnce(); }
  } else {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    if (pollTimer != null) { clearTimeout(pollTimer); pollTimer = null; }
    pollToken++; // invalidate any in-flight response
  }
}

/** Fills the shell's static text via vt() so it flows through the l10n
 *  overlay (the HTML shell carries structure only — same as the Views tab). */
function localizeShell(): void {
  const lead = byId('hb-lead');
  if (lead) lead.textContent = vt('viewer.heartbeat.lead');
  const label = byId('hb-vitals-label');
  if (label) label.textContent = vt('viewer.heartbeat.vitalLabel');
  const empty = byId('hb-empty');
  if (empty) empty.textContent = vt('viewer.heartbeat.waiting');
}

/** Wires the Heartbeat screen. Subscribes to the tab-switch event dispatched
 *  by tabs.ts (decoupled from app.js's onTabSwitch monolith) and to page
 *  visibility, so poll + rAF suspend the moment the screen is not watched. */
export function initHeartbeatScreen(): void {
  const canvas = byId('hb-monitor') as HTMLCanvasElement | null;
  if (!canvas) return; // panel absent (e.g. older shell) — degrade silently
  localizeShell();
  monitor = createHeartbeatMonitor(canvas);
  updateEmptyState();
  document.addEventListener('sda-tab-switch', function (e) {
    tabActive = (e as CustomEvent).detail === 'heartbeat';
    updateRunState();
  });
  document.addEventListener('visibilitychange', updateRunState);
}
