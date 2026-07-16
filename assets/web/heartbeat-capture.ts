/**
 * Heartbeat capture toggle — DOM + network half (Feature 80, phase 2).
 *
 * Arms/disarms host-app statement capture via POST /api/activity/capture and
 * keeps the toggle synced to the `captureArmed` boolean on every
 * /api/activity poll response (heartbeat-screen.ts feeds both signals in).
 * The server is the source of truth: arming grants a ~5 s LEASE that the
 * screen's existing poll loop renews implicitly, so no extra renewal traffic
 * exists here — only the toggle POST and best-effort lifecycle disarms.
 *
 * All render decisions are pure functions in heartbeat-capture-logic.ts
 * (unit-tested); this module only reads/writes the DOM and the wire.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import {
  CaptureAvailability,
  captureUi,
  shouldSendLifecycleDisarm,
} from './heartbeat-capture-logic.ts';

let availability: CaptureAvailability = 'unknown';
/** Server's last reported armed state (authoritative between clicks). */
let serverArmed = false;
/** True while a toggle POST is in flight — the click wins over stale polls. */
let postPending = false;
/** Monotonic POST sequence (same pattern as panel.ts's _loadSeq): a toggle
 *  click or lifecycle disarm bumps it, and a response whose token no longer
 *  matches is discarded — so overlapping POSTs (arm, then tab-switch disarm
 *  before the arm resolves) can never apply out of order. */
let postSeq = 0;
/** The user's in-flight choice, shown optimistically while postPending. */
let localChecked = false;

function byId(id: string): HTMLElement | null { return document.getElementById(id); }

/** Sets the caption under the toggle: the wiring-honesty default, or a
 *  warn-toned override (kill switch / failed POST). */
function setNote(msg: string | null, warn?: boolean): void {
  const note = byId('hb-capture-note');
  if (!note) return;
  note.textContent = msg != null ? msg : vt('viewer.heartbeat.capture.note');
  note.className = 'meta hb-capture-note' + (warn ? ' hb-capture-note--warn' : '');
}

/** Re-derives the whole control from state — never patches incrementally. */
function render(): void {
  const wrap = byId('hb-capture');
  const input = byId('hb-capture-input') as HTMLInputElement | null;
  const live = byId('hb-capture-live');
  if (!wrap || !input) return;
  const ui = captureUi(availability, serverArmed, postPending, localChecked);
  wrap.hidden = !ui.visible;
  input.checked = ui.checked;
  input.disabled = ui.disabled;
  if (live) live.hidden = !ui.live;
}

/** Whether capture is currently rendered as armed. The poll loop reads this
 *  to hold the steady 750 ms cadence while armed: at the idle ceiling
 *  (2.5 s) only one missed poll of lease headroom remains, and an armed
 *  capture is active observation — never "idle" — regardless of traffic. */
export function isCaptureArmed(): boolean {
  return availability === 'available' && (postPending ? localChecked : serverArmed);
}

/** Feed from heartbeat-screen.ts on every successful /api/activity poll.
 *  A non-boolean value means an older server without phase 2 — hide the
 *  control rather than leaving a permanently dead toggle. */
export function captureSyncFromPoll(armed: unknown): void {
  if (typeof armed !== 'boolean') {
    availability = 'unsupported';
  } else {
    availability = 'available';
    serverArmed = armed;
    // Server says disarmed while the local toggle is on (lease expired in a
    // throttled tab, or another viewer disarmed): snap the toggle off. Only
    // an in-flight POST outranks the poll (its response will resync).
    if (!postPending) localChecked = armed;
  }
  render();
}

/** Feed from heartbeat-screen.ts when the activity poll returns 403: the
 *  global monitoring kill switch is off, so capture is unavailable. */
export function captureSetForbidden(): void {
  availability = 'forbidden';
  serverArmed = false;
  localChecked = false;
  setNote(vt('viewer.heartbeat.capture.unavailable'), true);
  render();
}

/** Feed from heartbeat-screen.ts when /api/activity itself is missing. */
export function captureSetUnsupported(): void {
  availability = 'unsupported';
  serverArmed = false;
  localChecked = false;
  render();
}

/** User clicked the toggle: POST the new state; the response is authoritative. */
function postCapture(enabled: boolean): void {
  const token = ++postSeq;
  postPending = true;
  localChecked = enabled;
  setNote(null);
  render();
  fetch('/api/activity/capture', S.authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabled }),
  }))
    .then(function (r) { return r.json().then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); })
    .then(function (res) {
      // A newer POST (or a lifecycle disarm) superseded this one — its
      // response is stale and must not overwrite the later state.
      if (token !== postSeq) return;
      postPending = false;
      // 403 = kill switch: capture unavailable, render off/disabled.
      if (res.status === 403) { captureSetForbidden(); return; }
      if (!res.ok) throw new Error('capture POST HTTP ' + res.status);
      availability = 'available';
      serverArmed = !!(res.data && res.data.captureArmed);
      localChecked = serverArmed;
      render();
    })
    .catch(function () {
      if (token !== postSeq) return;
      // Failed POST: snap back to the server's last known state and say so —
      // a silently reverting toggle would look like the click never landed.
      postPending = false;
      localChecked = serverArmed;
      setNote(vt('viewer.heartbeat.capture.error'), true);
      render();
    });
}

/**
 * Best-effort disarm for every screen-inactive lifecycle point. `unloading`
 * marks the pagehide/beforeunload paths, where an ordinary fetch may be
 * killed with the page:
 * - `navigator.sendBeacon` survives unload but CANNOT carry the
 *   Authorization header, so it is only used when no auth token is set;
 * - otherwise a fetch with `keepalive: true` lets the browser finish the
 *   request after the page is gone while still sending the Bearer header.
 * Either way this is best-effort by design — the server's ~5 s lease is the
 * guarantee that a killed tab never leaves the host interceptor hot.
 */
export function captureDisarmBestEffort(unloading?: boolean): void {
  if (!shouldSendLifecycleDisarm(availability, serverArmed || localChecked)) return;
  // Supersede any in-flight toggle POST: its late response must not re-arm
  // the UI after this disarm (the fire-and-forget below is not awaited).
  postSeq++;
  serverArmed = false;
  localChecked = false;
  postPending = false;
  render();
  const body = JSON.stringify({ enabled: false });
  try {
    if (unloading && !S.DRIFT_VIEWER_AUTH_TOKEN && navigator.sendBeacon) {
      navigator.sendBeacon('/api/activity/capture', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/activity/capture', S.authOpts({
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: body,
    })).catch(function () { /* best-effort: the lease covers a lost disarm */ });
  } catch (_e) { /* best-effort: never let a disarm attempt break teardown */ }
}

/** Wires the capture control. Called by initHeartbeatScreen; tab-switch and
 *  visibility disarms ride the screen's existing updateRunState suspension
 *  path (heartbeat-screen.ts) rather than duplicate listeners here — only
 *  the unload events, which that path cannot see, are registered here. */
export function initHeartbeatCapture(): void {
  const input = byId('hb-capture-input') as HTMLInputElement | null;
  if (!input) return; // control absent (older shell) — degrade silently
  const label = byId('hb-capture-label');
  if (label) label.textContent = vt('viewer.heartbeat.capture.label');
  const liveText = byId('hb-capture-live-text');
  if (liveText) liveText.textContent = vt('viewer.heartbeat.capture.live');
  // Multi-client behavior (any viewer's poll renews the lease; a disarm from
  // one viewer disarms all) surfaces as the toggle's hover tooltip.
  const toggle = byId('hb-capture-toggle');
  if (toggle) toggle.title = vt('viewer.heartbeat.capture.multiClient');
  setNote(null);
  input.addEventListener('change', function () { postCapture(input.checked); });
  // pagehide covers real navigations/tab closes; beforeunload is the legacy
  // fallback for browsers/paths that skip pagehide. Both may fire — the
  // armed guard in captureDisarmBestEffort makes the second a no-op.
  window.addEventListener('pagehide', function () { captureDisarmBestEffort(true); });
  window.addEventListener('beforeunload', function () { captureDisarmBestEffort(true); });
  render();
}
