/**
 * Session sharing and restore module.
 *
 * Handles creating, restoring, and managing shared sessions with
 * countdown timers, extend functionality, and annotation display.
 */
import * as S from './state.ts';
import { esc, setButtonBusy } from './utils.ts';
import { showCopyToast } from './table-view.ts';
import { openTableTab } from './tabs.ts';

    function captureViewerState(): Record<string, any> {
      var state: Record<string, any> = {
        currentTable: S.currentTableName,
        sqlInput: document.getElementById('sql-input').value,
        searchTerm: document.getElementById('search-input')
          ? document.getElementById('search-input').value
          : '',
        theme: localStorage.getItem(S.THEME_KEY),
        limit: S.limit,
        offset: S.offset,
        timestamp: new Date().toISOString(),
      };
      return state;
    }

    export function copyShareUrl(shareUrl, expiresAt) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl)
          .then(function () {
            alert('Share URL copied to clipboard!\n\n' + shareUrl +
              '\n\nExpires: ' + new Date(expiresAt).toLocaleString());
          })
          .catch(function () {
            prompt('Copy this share URL:', shareUrl);
          });
      } else {
        prompt('Copy this share URL:', shareUrl);
      }
    }

    export function createShareSession() {
      // Use literal newlines so the native prompt() shows line breaks in the message.
      var note = prompt('Add a note for your team (optional):\n\nSession will expire in 1 hour.');
      if (note === null) return;
      var btn = document.getElementById('fab-share-btn');
      btn.disabled = true;
      setButtonBusy(btn, true, 'Sharing\u2026');
      var state = captureViewerState();
      if (note) state.note = note;

      fetch('/api/session/share', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }))
        .then(function (r) {
          if (!r.ok) throw new Error('Server error ' + r.status);
          return r.json();
        })
        .then(function (data) {
          copyShareUrl(location.origin + location.pathname + data.url, data.expiresAt);
        })
        .catch(function (e) {
          alert('Failed to create share: ' + e.message);
        })
        .finally(function () {
          btn.disabled = false;
          // Restore the FAB action's icon + label structure after busy state.
          btn.classList.remove('btn-busy');
          btn.innerHTML =
            '<span class="material-symbols-outlined" aria-hidden="true">share</span>' +
            '<span class="fab-action-label">Share</span>';
        });
    }

    export function applySessionState(state) {
      if (state.currentTable) {
        // Open the shared table in its own tab
        setTimeout(function () { openTableTab(state.currentTable); }, 500);
      }

      if (state.sqlInput) {
        document.getElementById('sql-input').value = state.sqlInput;
      }

      if (state.searchTerm && document.getElementById('search-input')) {
        document.getElementById('search-input').value = state.searchTerm;
      }

      if (state.limit) S.setLimit(state.limit);
      if (state.offset) S.setOffset(state.offset);
    }

    export function showSessionExpiredBanner() {
      var banner = document.createElement('div');
      banner.style.cssText =
        'background:#f8d7da;color:#721c24;padding:0.75rem;' +
        'font-size:13px;text-align:center;border-bottom:2px solid #f5c6cb;';
      banner.innerHTML =
        '<strong>Session Expired</strong><br>' +
        'The shared session you are trying to access has expired or was not found.<br>' +
        '<span style="font-size:11px;color:#856404;">' +
        'Sessions expire after 1 hour. Ask the person who shared the link to create a new one.</span>';
      document.body.prepend(banner);
    }

    export function updateSessionCountdown(countdownEl) {
      var target = S.currentSessionExpiresAt;
      if (!target) return;
      var now = new Date();
      var exp = new Date(target);
      var diffMs = exp.getTime() - now.getTime();

      if (diffMs <= 0) {
        // Session has expired: show expired state in the info bar.
        countdownEl.textContent = 'EXPIRED';
        countdownEl.style.color = '#ff4444';
        var bar = document.getElementById('session-info-bar');
        if (bar) bar.style.background = '#cc3333';
        if (S.sessionCountdownInterval) {
          clearInterval(S.sessionCountdownInterval);
          S.setSessionCountdownInterval(null);
        }
        var extBtn = document.getElementById('session-extend-btn');
        if (extBtn) extBtn.style.display = 'none';
        return;
      }

      var mins = Math.floor(diffMs / 60000);
      var secs = Math.floor((diffMs % 60000) / 1000);

      // Under 10 minutes: yellow warning styling + faster updates.
      if (mins < 10) {
        countdownEl.style.color = '#ffcc00';
        countdownEl.textContent = 'Expires in ' + mins + 'm ' + secs + 's';
        // Switch to 10-second update cadence for urgency (once only).
        if (!S.sessionFastMode && S.sessionCountdownInterval) {
          S.setSessionFastMode(true);
          clearInterval(S.sessionCountdownInterval);
          S.setSessionCountdownInterval(setInterval(function() {
            updateSessionCountdown(countdownEl);
          }, 10000));
        }
        // Show a one-time warning banner below the info bar.
        if (!S.sessionWarningShown) {
          S.setSessionWarningShown(true);
          var warningBanner = document.createElement('div');
          warningBanner.id = 'session-expiry-warning';
          warningBanner.style.cssText =
            'background:#fff3cd;color:#856404;padding:0.3rem 0.5rem;' +
            'font-size:12px;text-align:center;border-bottom:1px solid #ffc107;';
          warningBanner.textContent =
            'Warning: This session expires in less than 10 minutes. ' +
            'Click "Extend" to add more time.';
          var bar = document.getElementById('session-info-bar');
          if (bar && bar.nextSibling) {
            bar.parentNode.insertBefore(warningBanner, bar.nextSibling);
          } else if (bar) {
            bar.parentNode.appendChild(warningBanner);
          }
        }
      } else {
        countdownEl.textContent = 'Expires in ' + mins + ' min';
      }
    }

    export function extendSession() {
      if (!S.currentSessionId) return;

      var extBtn = document.getElementById('session-extend-btn');
      if (extBtn) {
        extBtn.disabled = true;
        extBtn.textContent = 'Extending\u2026';
      }

      fetch('/api/session/' + encodeURIComponent(S.currentSessionId) + '/extend',
        S.authOpts({ method: 'POST' })
      )
        .then(function(r) {
          if (!r.ok) throw new Error('Failed to extend session');
          return r.json();
        })
        .then(function(data) {
          // Update the tracked expiry time and reset warning/fast-mode flags.
          S.setCurrentSessionExpiresAt(data.expiresAt);
          S.setSessionWarningShown(false);
          S.setSessionFastMode(false);

          // Remove the warning banner if present.
          var warning = document.getElementById('session-expiry-warning');
          if (warning) warning.remove();

          // Reset the info bar color back to normal.
          var bar = document.getElementById('session-info-bar');
          if (bar) bar.style.background = 'var(--link)';

          // Restart the countdown with normal 30-second interval.
          var countdownEl = document.getElementById('session-countdown');
          if (countdownEl) {
            countdownEl.style.color = '';
            if (S.sessionCountdownInterval) clearInterval(S.sessionCountdownInterval);
            updateSessionCountdown(countdownEl);
            S.setSessionCountdownInterval(setInterval(function() {
              updateSessionCountdown(countdownEl);
            }, 30000));
          }

          // Show confirmation via the existing copy-toast element.
          showCopyToast('Session extended!');
        })
        .catch(function(e) {
          alert('Failed to extend session: ' + e.message);
        })
        .finally(function() {
          if (extBtn) {
            extBtn.disabled = false;
            extBtn.textContent = 'Extend';
          }
        });
    }

    export function renderSessionInfoBar(state, createdAt, expiresAt) {
      var infoBar = document.createElement('div');
      infoBar.id = 'session-info-bar';
      infoBar.style.cssText =
        'background:var(--link);color:var(--bg);padding:0.3rem 0.5rem;font-size:12px;text-align:center;';

      // Left side: session info text with optional note.
      var info = 'Shared session';
      if (state.note) info += ': "' + esc(state.note) + '"';
      info += ' (created ' + new Date(createdAt).toLocaleString() + ')';
      var infoSpan = document.createElement('span');
      infoSpan.textContent = info;

      // Right side: live countdown and Extend button.
      var countdownSpan = document.createElement('span');
      countdownSpan.id = 'session-countdown';
      countdownSpan.style.cssText = 'margin-left:1rem;font-weight:bold;';

      var extendBtn = document.createElement('button');
      extendBtn.id = 'session-extend-btn';
      extendBtn.textContent = 'Extend';
      extendBtn.title = 'Extend session by 1 hour';
      extendBtn.style.cssText =
        'margin-left:0.5rem;font-size:11px;padding:0.1rem 0.4rem;cursor:pointer;' +
        'background:var(--bg);color:var(--link);border:1px solid var(--bg);border-radius:3px;';
      extendBtn.addEventListener('click', function() { extendSession(); });

      infoBar.appendChild(infoSpan);
      infoBar.appendChild(countdownSpan);
      infoBar.appendChild(extendBtn);
      document.body.prepend(infoBar);

      // Store expiry and start the live countdown timer.
      S.setCurrentSessionExpiresAt(expiresAt);
      updateSessionCountdown(countdownSpan);
      S.setSessionCountdownInterval(setInterval(function() {
        updateSessionCountdown(countdownSpan);
      }, 30000));
    }

    export function renderSessionAnnotations(annotations) {
      if (!annotations || annotations.length === 0) return;
      var annoEl = document.createElement('div');
      annoEl.style.cssText =
        'background:var(--bg-pre);padding:0.3rem 0.5rem;font-size:11px;border-left:3px solid var(--link);margin:0.3rem 0;';
      var annoHtml = '<strong>Annotations:</strong><br>';
      annotations.forEach(function (a) {
        annoHtml += '<span class="meta">[' + esc(a.author) + ' at ' +
          new Date(a.at).toLocaleTimeString() + ']</span> ' +
          esc(a.text) + '<br>';
      });
      annoEl.innerHTML = annoHtml;
      document.body.children[1]
        ? document.body.insertBefore(annoEl, document.body.children[1])
        : document.body.appendChild(annoEl);
    }

    export function restoreSession() {
      var params = new URLSearchParams(location.search);
      var sessionId = params.get('session');
      if (!sessionId) return;

      fetch('/api/session/' + encodeURIComponent(sessionId), S.authOpts())
        .then(function (r) {
          if (!r.ok) {
            // Show a visible error banner instead of silent console.warn.
            showSessionExpiredBanner();
            throw new Error('Session expired or not found');
          }
          return r.json();
        })
        .then(function (data) {
          var state = data.state || {};
          // Store session ID and expiry for countdown and extend.
          S.setCurrentSessionId(sessionId);
          S.setCurrentSessionExpiresAt(data.expiresAt);
          applySessionState(state);
          renderSessionInfoBar(state, data.createdAt, data.expiresAt);
          renderSessionAnnotations(data.annotations);
        })
        .catch(function (e) {
          console.warn('Session restore failed:', e.message);
        });
    }
