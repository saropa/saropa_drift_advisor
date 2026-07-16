/**
 * Heartbeat capture toggle — pure state reconciliation (Feature 80, phase 2).
 *
 * DOM-free by design so `node --test` can exercise the exact decision table
 * the screen runs (same harness pattern as heartbeat-heat.ts). The DOM/network
 * half lives in heartbeat-capture.ts; everything here is a pure function of
 * the four inputs below, so every render is derived, never patched — the
 * toggle can never drift out of sync with what the server last said.
 */

/**
 * What the client currently knows about the capture endpoint:
 * - 'unknown'     — no poll response seen yet (fresh screen / reconnecting).
 * - 'available'   — the poll response carried a boolean `captureArmed`.
 * - 'forbidden'   — server answered 403: the global monitoring kill switch is
 *                   off, so arming is refused (render off + disabled).
 * - 'unsupported' — older server whose /api/activity response has no
 *                   `captureArmed` field (or the endpoint 404s). The control
 *                   is hidden entirely: a permanently-dead toggle would read
 *                   as broken, absence reads as "this server can't do that".
 */
export type CaptureAvailability =
  | 'unknown'
  | 'available'
  | 'forbidden'
  | 'unsupported';

/** Derived render state for the capture control. */
export interface CaptureUi {
  /** Render the control at all (false only for 'unsupported' servers). */
  visible: boolean;
  /** Toggle checked state. */
  checked: boolean;
  /** Toggle greyed out and unclickable. */
  disabled: boolean;
  /** Show the pulsing "capturing" live indicator. */
  live: boolean;
}

/**
 * Single source of truth for how the capture control renders.
 *
 * `serverArmed` is the server's last reported state (the authority: a lease
 * can expire while the tab is throttled, or another viewer can disarm — the
 * poll snaps the toggle to match). `postPending` + `localChecked` cover the
 * one window where the local click is newer than the server's answer: while
 * a POST is in flight the toggle shows the user's choice optimistically, and
 * is disabled so a second click cannot race the first.
 */
export function captureUi(
  availability: CaptureAvailability,
  serverArmed: boolean,
  postPending: boolean,
  localChecked: boolean,
): CaptureUi {
  if (availability === 'unsupported') {
    return { visible: false, checked: false, disabled: true, live: false };
  }
  // 'unknown' (pre-first-poll) and 'forbidden' (kill switch) both render an
  // off, disabled toggle — the user can see the feature exists but cannot
  // arm it until the server confirms it is willing.
  if (availability !== 'available') {
    return { visible: true, checked: false, disabled: true, live: false };
  }
  const checked = postPending ? localChecked : serverArmed;
  return {
    visible: true,
    checked: checked,
    disabled: postPending,
    // The live indicator follows the rendered toggle, not raw serverArmed:
    // during an in-flight disarm the dot must stop pulsing immediately, or
    // the screen claims "capturing" for a hook the user just turned off.
    live: checked,
  };
}

/**
 * Whether a screen-inactive lifecycle event (tab switch away, visibility
 * hidden, pagehide/beforeunload) should fire a best-effort disarm POST.
 *
 * Only when capture is actually armed and the endpoint is known to exist —
 * otherwise every casual tab switch would spam a pointless POST at the
 * server (or 404 an old one). Disarming client-side is best-effort by
 * design: the server-side ~5 s lease is the guarantee that a killed tab can
 * never leave the host app's interceptor hot.
 */
export function shouldSendLifecycleDisarm(
  availability: CaptureAvailability,
  armed: boolean,
): boolean {
  return availability === 'available' && armed;
}
