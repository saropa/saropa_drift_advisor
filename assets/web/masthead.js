/**
 * Masthead pill — connection-status UI controller.
 *
 * Self-contained module: owns the STATUS_LABELS constants and exposes
 * a minimal API on `window.mastheadStatus` for app.js to drive.
 *
 * Loaded as a separate <script> by html_content.dart, after app.js
 * so the DOM elements exist.
 *
 * DOM contract:
 *   #live-indicator — button inside .masthead-pill that displays the
 *                     current connection state (Online / Paused / Offline
 *                     / Reconnecting). Click toggles Online ↔ Paused when
 *                     connected; disabled when offline.
 *
 * Styles live in _masthead.scss.
 */
(function initMasthead() {
  'use strict';

  // Centralised labels for the masthead connection-status pill.
  // Change wording here once — both setConnection and the click
  // handler read from this object.
  var STATUS = {
    online:            '\u25cf Online',
    onlineTitle:       'Online \u2014 click to pause change detection.',
    paused:            '\u25cf Paused',
    pausedTitle:       'Paused \u2014 click to resume live updates.',
    offline:           '\u25cf Offline',
    offlineTitle:      'Offline \u2014 connection lost. Reconnect to resume live updates.',
    reconnecting:      '\u25cf Reconnecting\u2026',
    reconnectingTitle: 'Offline \u2014 reconnecting\u2026'
  };

  var indicator = document.getElementById('live-indicator');
  if (!indicator) return;

  /**
   * Public API exposed on window for app.js connection-state integration.
   *
   * app.js calls mastheadStatus.setConnection() whenever the WebSocket
   * connection state changes or polling is toggled. This module owns all
   * DOM manipulation and display-string logic for the masthead pill.
   */
  window.mastheadStatus = {
    /**
     * Update the pill to reflect the current connection state.
     *
     * @param {'connected'|'disconnected'|'reconnecting'} state
     * @param {boolean} pollingEnabled - only meaningful when state === 'connected'
     */
    setConnection: function (state, pollingEnabled) {
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
    setBusy: function () {
      indicator.disabled = true;
      indicator.textContent = '\u2026';
    },

    /**
     * Callback invoked when the user clicks the pill to toggle polling.
     * Set by app.js during initialisation. If null, clicks are ignored.
     * @type {function|null}
     */
    onToggle: null
  };

  // Clicking the pill delegates to app.js via the onToggle callback,
  // which handles the /api/change-detection POST and calls setConnection
  // with the result. Guard: only fire when enabled (connected state).
  indicator.addEventListener('click', function () {
    if (indicator.disabled) return;
    if (typeof window.mastheadStatus.onToggle === 'function') {
      window.mastheadStatus.onToggle();
    }
  });
})();
