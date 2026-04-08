/**
 * Connection management: state transitions, banner UI, heartbeat,
 * and keep-alive logic extracted from app.js.
 */
import * as S from './state.ts';

// --- External dependencies that remain in app.js ---
// These are not yet exported from their own modules, so we use
// @ts-ignore to reference them via the caller's injection.

/** Injected by app.js at init — applies write-flag from /api/health. */
let _applyHealthWriteFlag: (data: unknown) => void = () => {};
/** Injected by app.js at init — triggers a generation poll cycle. */
let _pollGeneration: () => void = () => {};

/**
 * Called once from app.js to wire up the two callbacks that
 * connection.ts needs but that still live in app.js.
 */
export function initConnectionDeps(deps: {
  applyHealthWriteFlag: (data: unknown) => void;
  pollGeneration: () => void;
}): void {
  _applyHealthWriteFlag = deps.applyHealthWriteFlag;
  _pollGeneration = deps.pollGeneration;
}

// --- Connection state transitions ---

// Transition to 'disconnected'. Shows the banner, disables
// server-dependent controls, updates the live indicator to red.
export function setDisconnected(): void {
  if (S.connectionState === 'disconnected') return;
  S.setConnectionState('disconnected');
  S.setBannerDismissed(false);
  showConnectionBanner();
  updateConnectionBannerText();
  updateLiveIndicatorForConnection();
  setOfflineControlsDisabled(true);
}

// Transition to 'reconnecting'. Used when /api/health succeeds
// after being disconnected — server is back but generation
// endpoint not yet confirmed.
export function setReconnecting(): void {
  if (S.connectionState === 'reconnecting') return;
  S.setConnectionState('reconnecting');
  S.setNextHeartbeatAt(null);
  showConnectionBanner();
  updateConnectionBannerText();
  updateLiveIndicatorForConnection();
}

// Transition to 'connected'. Hides banner, re-enables controls,
// resets backoff, stops heartbeat/keep-alive timers.
export function setConnected(): void {
  if (S.connectionState === 'connected') return;
  S.setConnectionState('connected');
  S.setConsecutivePollFailures(0);
  S.setCurrentBackoffMs(S.BACKOFF_INITIAL_MS);
  S.setNextHeartbeatAt(null);
  S.setHeartbeatInFlight(false);
  S.setHeartbeatAttemptCount(0);
  hideConnectionBanner();
  updateLiveIndicatorForConnection();
  setOfflineControlsDisabled(false);
  stopHeartbeat();
}

// --- Banner show / hide ---

// Updates banner message and diagnostics from current state (next retry, interval, attempt count).
// Called on show and every 1s while banner is visible so countdown stays accurate.
export function updateConnectionBannerText(): void {
  if (S.connectionState === 'connected' || S.bannerDismissed) return;
  const msgEl = document.getElementById('banner-message');
  const diagEl = document.getElementById('banner-diagnostics');
  if (!msgEl || !diagEl) return;
  const parts: string[] = [];
  if (S.connectionState === 'reconnecting') {
    msgEl.textContent = 'Reconnecting\u2026';
    diagEl.textContent = 'Restoring connection\u2026';
    return;
  }
  if (S.heartbeatInFlight) {
    msgEl.textContent = 'Connection lost \u2014 checking\u2026';
    parts.push('Attempt ' + S.heartbeatAttemptCount);
  } else if (S.nextHeartbeatAt != null) {
    const secs = Math.max(0, Math.ceil((S.nextHeartbeatAt - Date.now()) / 1000));
    msgEl.textContent = 'Connection lost \u2014 next retry in ' + secs + 's';
    const intervalSec = S.currentBackoffMs / 1000;
    parts.push('Retrying every ' + intervalSec + 's');
    if (S.currentBackoffMs >= S.BACKOFF_MAX_MS) parts.push('(max interval)');
    parts.push('Attempt ' + S.heartbeatAttemptCount);
  } else {
    msgEl.textContent = 'Connection lost \u2014 reconnecting\u2026';
    parts.push('Attempt ' + S.heartbeatAttemptCount);
  }
  diagEl.textContent = parts.join(' \u2022 ');
}

// Show the connection banner and start 1s ticker for countdown/diagnostics. Respects S.bannerDismissed.
export function showConnectionBanner(): void {
  if (S.bannerDismissed) return;
  const banner = document.getElementById('connection-banner');
  if (!banner) return;
  banner.classList.add('show');
  document.body.classList.add('has-connection-banner');
  if (!S.bannerUpdateIntervalId) {
    S.setBannerUpdateIntervalId(setInterval(updateConnectionBannerText, 1000));
  }
}

// Hide the connection banner, stop countdown ticker, remove body padding offset.
export function hideConnectionBanner(): void {
  if (S.bannerUpdateIntervalId) {
    clearInterval(S.bannerUpdateIntervalId);
    S.setBannerUpdateIntervalId(null);
  }
  const banner = document.getElementById('connection-banner');
  if (banner) {
    banner.classList.remove('show');
    document.body.classList.remove('has-connection-banner');
  }
}

// --- Connection status integration ---
// Delegates all pill DOM updates to masthead.js via window.mastheadStatus.
// This function is the single call-site in app.js — all connection-state
// changes (WebSocket open/close/error, polling toggle) route through here.
export function updateLiveIndicatorForConnection(): void {
  if (!window.mastheadStatus) return;
  window.mastheadStatus.setConnection(S.connectionState, S.pollingEnabled);
}

// --- Disable / enable server-dependent controls ---
// OFFLINE_DISABLE_IDS — moved to state.ts

// Toggle 'offline-disabled' class (opacity:0.4, pointer-events:none)
// on server-dependent controls.
export function setOfflineControlsDisabled(disabled: boolean): void {
  S.OFFLINE_DISABLE_IDS.forEach(function(id: string) {
    const el = document.getElementById(id);
    if (el) {
      if (disabled) el.classList.add('offline-disabled');
      else el.classList.remove('offline-disabled');
    }
  });
}

// --- Heartbeat: lightweight /api/health checks for reconnection ---
// Used after S.HEALTH_CHECK_THRESHOLD consecutive poll failures.
// Health endpoint is fast (no DB query).

export function startHeartbeat(): void {
  if (S.heartbeatTimerId) return;
  doHeartbeat();
}

// Ping /api/health. On success restart normal polling.
// On failure schedule another heartbeat with backoff.
// Skip if a check is already in flight to avoid duplicate requests and timer races.
export function doHeartbeat(): void {
  if (S.heartbeatInFlight) return;
  if (S.connectionState === 'disconnected' || S.connectionState === 'reconnecting') {
    S.setHeartbeatAttemptCount(S.heartbeatAttemptCount + 1);
  }
  S.setHeartbeatInFlight(true);
  updateConnectionBannerText();
  fetch('/api/health', S.authOpts())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      S.setHeartbeatInFlight(false);
      if (data && data.ok) {
        _applyHealthWriteFlag(data);
        setReconnecting();
        S.setConsecutivePollFailures(0);
        S.setCurrentBackoffMs(S.BACKOFF_INITIAL_MS);
        S.setNextHeartbeatAt(null);
        S.setHeartbeatTimerId(null);
        _pollGeneration();
        return;
      }
      updateConnectionBannerText();
      scheduleHeartbeat();
    })
    .catch(function() {
      S.setHeartbeatInFlight(false);
      updateConnectionBannerText();
      scheduleHeartbeat();
    });
}

// Schedule next heartbeat with exponential backoff (1s,2s,4s,...,30s).
export function scheduleHeartbeat(): void {
  S.setCurrentBackoffMs(Math.min(
    S.currentBackoffMs * S.BACKOFF_MULTIPLIER, S.BACKOFF_MAX_MS
  ));
  S.setNextHeartbeatAt(Date.now() + S.currentBackoffMs);
  S.setHeartbeatTimerId(setTimeout(doHeartbeat, S.currentBackoffMs));
}

// Cancel any pending heartbeat timer.
export function stopHeartbeat(): void {
  if (S.heartbeatTimerId) {
    clearTimeout(S.heartbeatTimerId);
    S.setHeartbeatTimerId(null);
  }
  S.setNextHeartbeatAt(null);
}

// --- Keep-alive: periodic health check when polling is OFF ---
// When polling is disabled the long-poll stops, so this slow
// keep-alive (every 15s) detects disconnection instead.
export function startKeepAlive(): void {
  stopKeepAlive();
  S.setKeepAliveTimerId(setInterval(function() {
    fetch('/api/health', S.authOpts())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.ok) {
          _applyHealthWriteFlag(data);
          if (S.connectionState !== 'connected') setConnected();
        } else {
          setDisconnected();
        }
      })
      .catch(function() {
        setDisconnected();
        stopKeepAlive();
        startHeartbeat();
      });
  }, S.KEEP_ALIVE_INTERVAL_MS));
}

export function stopKeepAlive(): void {
  if (S.keepAliveTimerId) {
    clearInterval(S.keepAliveTimerId);
    S.setKeepAliveTimerId(null);
  }
}
