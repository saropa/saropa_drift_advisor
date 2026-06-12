/**
 * Masthead pill — connection-status UI controller.
 *
 * Self-contained module: resolves its pill labels through the web l10n
 * registry (vt) and exposes a minimal API for app.js to drive.
 *
 * DOM contract:
 *   #live-indicator — button inside .masthead-pill that displays the
 *                     current connection state (Online / Paused / Offline
 *                     / Reconnecting). Click toggles Online ↔ Paused when
 *                     connected; disabled when offline.
 *
 * Styles live in _masthead.scss.
 */

import { vt } from './l10n.ts';

/** Public API shape for the masthead connection-status pill. */
export interface MastheadStatus {
  setConnection(state: string, pollingEnabled: boolean): void;
  setBusy(): void;
  onToggle: Function | null;
}

// Decorative status dot prepended to every pill label. It is a symbol, not text,
// so it stays OUT of the l10n catalog (it must never vary per locale) and is
// concatenated onto the localized status word \u2014 the one place prepending a
// non-English literal is correct rather than English concatenation. The status
// words and full tooltip sentences live in strings-web.ts (masthead.status.* /
// masthead.title.*) and resolve via vt() at call time so a late-installed locale
// overlay still applies.
const STATUS_DOT = '\u25cf ';

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
        indicator.textContent = STATUS_DOT + vt(pollingEnabled ? 'masthead.status.online' : 'masthead.status.paused');
        indicator.classList.toggle('paused', !pollingEnabled);
        indicator.title = vt(pollingEnabled ? 'masthead.title.online' : 'masthead.title.paused');
      } else if (state === 'disconnected') {
        indicator.textContent = STATUS_DOT + vt('masthead.status.offline');
        indicator.classList.add('disconnected');
        indicator.classList.remove('paused', 'reconnecting');
        indicator.disabled = true;
        indicator.title = vt('masthead.title.offline');
      } else {
        indicator.textContent = STATUS_DOT + vt('masthead.status.reconnecting');
        indicator.classList.add('disconnected', 'reconnecting');
        indicator.classList.remove('paused');
        indicator.disabled = true;
        indicator.title = vt('masthead.title.reconnecting');
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
