/**
 * Masthead pill — connection-status UI controller.
 *
 * Self-contained module: owns the STATUS_LABELS constants and exposes
 * a minimal API for app.js to drive.
 *
 * DOM contract:
 *   #live-indicator — button inside .masthead-pill that displays the
 *                     current connection state (Online / Paused / Offline
 *                     / Reconnecting). Click toggles Online ↔ Paused when
 *                     connected; disabled when offline.
 *
 * Styles live in _masthead.scss.
 */

/** Public API shape for the masthead connection-status pill. */
export interface MastheadStatus {
  setConnection(state: string, pollingEnabled: boolean): void;
  setBusy(): void;
  onToggle: Function | null;
}

// Centralised labels for the masthead connection-status pill.
// Change wording here once — both setConnection and the click
// handler read from this object.
const STATUS = {
  online:            '\u25cf Online',
  onlineTitle:       'Online \u2014 click to pause change detection.',
  paused:            '\u25cf Paused',
  pausedTitle:       'Paused \u2014 click to resume live updates.',
  offline:           '\u25cf Offline',
  offlineTitle:      'Offline \u2014 connection lost. Reconnect to resume live updates.',
  reconnecting:      '\u25cf Reconnecting\u2026',
  reconnectingTitle: 'Offline \u2014 reconnecting\u2026',
};

/**
 * Initialises the masthead pill and returns the status API, or null
 * if the DOM element is missing.
 */
export function initMasthead(): MastheadStatus | null {
  const indicator = document.getElementById('live-indicator') as HTMLButtonElement | null;
  if (!indicator) { console.log('[SDA] initMasthead: #live-indicator NOT found'); return null; }
  console.log('[SDA] initMasthead: #live-indicator found, creating API');

  const api: MastheadStatus = {
    /**
     * Update the pill to reflect the current connection state.
     *
     * @param state - 'connected', 'disconnected', or 'reconnecting'
     * @param pollingEnabled - only meaningful when state === 'connected'
     */
    setConnection(state: string, pollingEnabled: boolean): void {
      console.log('[SDA] masthead.setConnection: state=' + state + ', polling=' + pollingEnabled);
      if (state === 'connected') {
        indicator.classList.remove('disconnected', 'reconnecting');
        indicator.disabled = false;
        indicator.textContent = pollingEnabled ? STATUS.online : STATUS.paused;
        indicator.classList.toggle('paused', !pollingEnabled);
        indicator.title = pollingEnabled ? STATUS.onlineTitle : STATUS.pausedTitle;
      } else if (state === 'disconnected') {
        indicator.textContent = STATUS.offline;
        indicator.classList.add('disconnected');
        indicator.classList.remove('paused', 'reconnecting');
        indicator.disabled = true;
        indicator.title = STATUS.offlineTitle;
      } else {
        indicator.textContent = STATUS.reconnecting;
        indicator.classList.add('disconnected', 'reconnecting');
        indicator.classList.remove('paused');
        indicator.disabled = true;
        indicator.title = STATUS.reconnectingTitle;
      }
    },

    /** Show a transient ellipsis while a toggle request is in-flight. */
    setBusy(): void {
      indicator.disabled = true;
      indicator.textContent = '\u2026';
    },

    /**
     * Callback invoked when the user clicks the pill to toggle polling.
     * Set by app.js during initialisation. If null, clicks are ignored.
     */
    onToggle: null,
  };

  // Clicking the pill delegates to app.js via the onToggle callback,
  // which handles the /api/change-detection POST and calls setConnection
  // with the result. Guard: only fire when enabled (connected state).
  indicator.addEventListener('click', () => {
    console.log('[SDA] masthead click: disabled=' + indicator.disabled + ', hasOnToggle=' + (typeof api.onToggle === 'function'));
    if (indicator.disabled) return;
    if (typeof api.onToggle === 'function') {
      api.onToggle();
    }
  });

  return api;
}
