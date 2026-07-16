/**
 * Heartbeat screen (Feature 80, phase 1): live table-activity board.
 *
 * Top: ECG-style monitor (heartbeat-chart.ts) aggregating all recent events.
 * Below: a card grid of ACTIVE tables only (heartbeat-cards.ts — card DOM,
 * heat glow, per-table sparklines). This module owns the lifecycle: the
 * adaptive activity poll and the single rAF loop that drives monitor + cards.
 *
 * Lifecycle: polling and the rAF loop run ONLY while the heartbeat tab is
 * active AND the document is visible; both fully suspend otherwise (no
 * background CPU, and the board never glows from its own polling — the
 * server additionally excludes internal probes).
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { nextPollDelay } from './heartbeat-heat.ts';
import { createHeartbeatMonitor, HeartbeatMonitor } from './heartbeat-chart.ts';
import { applyCardEvents, applyTables, cardsFrame, hasCards } from './heartbeat-cards.ts';
import { invalidateSparklines } from './heartbeat-sparkline.ts';
import {
  captureDisarmBestEffort,
  captureSetForbidden,
  captureSetUnsupported,
  captureSyncFromPoll,
  initHeartbeatCapture,
  isCaptureArmed,
} from './heartbeat-capture.ts';

/** Steady poll cadence while events are arriving. */
const POLL_MS = 750;
/** Idle cadence ceiling — see nextPollDelay in heartbeat-heat.ts for WHY the
 *  interval decays (a fixed 750 ms cadence polled idle battery-powered debug
 *  targets ~80×/min). */
const POLL_IDLE_CEILING_MS = 2500;
/** Failure backoff cap — keeps retries polite when the server is gone. */
const POLL_BACKOFF_MAX_MS = 6000;

let monitor: HeartbeatMonitor | null = null;
let tabActive = false;
let pollTimer: number | null = null;
let pollFailures = 0;
/** Successful polls in a row that carried zero events — drives the adaptive
 *  idle cadence (nextPollDelay). Reset to 0 by any event, which snaps the
 *  very next poll back to the steady 750 ms. */
let emptyPolls = 0;
let sinceGen = 0;
let rafId: number | null = null;
let lastFrameTs = 0;
/** Guards against a slow poll response landing after suspension. */
let pollToken = 0;

function byId(id: string): HTMLElement | null { return document.getElementById(id); }

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
  if (empty) empty.hidden = hasCards() || statusShowing;
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
        captureSetForbidden();
        return;
      }
      // Endpoint missing (older server / server half not deployed yet):
      // degrade quietly rather than hammering a 404.
      if (res.status === 404 || res.status === 501) {
        setMonitorMessage(vt('viewer.heartbeat.unavailable'), 'muted');
        captureSetUnsupported();
        return;
      }
      if (!res.ok) throw new Error('activity poll HTTP ' + res.status);
      pollFailures = 0;
      setMonitorMessage(null);
      const data = res.data || {};
      // Capture sync (phase 2): while armed, this very poll renewed the
      // server-side lease; the response's captureArmed is the authority the
      // toggle snaps to (lease expiry, other viewers, kill switch flips).
      captureSyncFromPoll(data.captureArmed);
      if (typeof data.activityGeneration === 'number') sinceGen = data.activityGeneration;
      applyTables(Array.isArray(data.tables) ? data.tables : []);
      updateEmptyState();
      const events = Array.isArray(data.recentEvents) ? data.recentEvents : [];
      const totals = applyCardEvents(events);
      if (monitor && (totals.reads || totals.writes)) monitor.recordEvents(totals.reads, totals.writes);
      updateVital();
      // Adaptive cadence: any event snaps back to the steady 750 ms; proven
      // silence decays stepwise toward the ceiling (pure schedule, unit-tested
      // in heartbeat-heat.test.mjs). While capture is ARMED the cadence never
      // decays: each poll renews the server's ~5 s capture lease, and at the
      // 2.5 s idle ceiling only one missed poll of headroom would remain —
      // an armed capture is active observation, not an idle screen.
      emptyPolls = events.length > 0 || isCaptureArmed() ? 0 : emptyPolls + 1;
      schedulePoll(nextPollDelay(emptyPolls, POLL_MS, POLL_IDLE_CEILING_MS));
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

// --- Single rAF loop: decays card heat, draws sparklines + the monitor. ---

function frame(ts: number): void {
  rafId = requestAnimationFrame(frame);
  const dt = lastFrameTs === 0 ? 0 : ts - lastFrameTs;
  lastFrameTs = ts;
  cardsFrame(dt, ts);
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
    if (pollTimer == null) {
      pollFailures = 0;
      // Fresh watch = fresh cadence: the user just navigated here, so poll
      // eagerly again even if the previous session had decayed to idle.
      emptyPolls = 0;
      pollOnce();
    }
  } else {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    if (pollTimer != null) { clearTimeout(pollTimer); pollTimer = null; }
    pollToken++; // invalidate any in-flight response
    // Screen-inactive ⇒ capture off (phase 2): tab switch and visibility
    // hidden both land here, the same suspension points that stop the poll
    // loop. Best-effort — the server's poll-renewed lease is the guarantee.
    captureDisarmBestEffort();
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
  // Capture toggle (phase 2): wires the control + the unload-time disarms;
  // tab-switch/visibility disarms ride updateRunState above.
  initHeartbeatCapture();
  updateEmptyState();
  document.addEventListener('sda-tab-switch', function (e) {
    tabActive = (e as CustomEvent).detail === 'heartbeat';
    updateRunState();
  });
  document.addEventListener('visibilitychange', updateRunState);
  // Theme switches recolor the canvases on the very next frame (theme.ts
  // dispatches sda-theme-change); the canvases' own 1 Hz color refresh stays
  // as the fallback for theme changes that bypass applyTheme (none known).
  document.addEventListener('sda-theme-change', function () {
    if (monitor) monitor.invalidateColors();
    invalidateSparklines();
  });
  // Activation audit: every navigation path (toolbar icon, home launcher
  // card, home search result card, tab-close fallback) runs through tabs.ts
  // switchTab and therefore fires sda-tab-switch. The one case an event can
  // never cover is heartbeat ALREADY being the active tab when this init
  // runs (e.g. a future restored-session boot) — read the live tab state
  // once so the screen starts polling instead of waiting for a switch.
  tabActive = S.activeTabId === 'heartbeat';
  updateRunState();
}
