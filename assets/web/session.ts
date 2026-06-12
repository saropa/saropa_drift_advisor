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
import { vt } from './l10n.ts';

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
            alert(vt('viewer.session.share.copied', shareUrl, new Date(expiresAt).toLocaleString()));
          })
          .catch(function () {
            prompt(vt('viewer.session.share.promptCopy'), shareUrl);
          });
      } else {
        prompt(vt('viewer.session.share.promptCopy'), shareUrl);
      }
    }

    export function createShareSession() {
      // Use literal newlines so the native prompt() shows line breaks in the message.
      var note = prompt(vt('viewer.session.share.promptNote'));
      if (note === null) return;
      var btn = document.getElementById('tb-share-btn');
      btn.disabled = true;
      setButtonBusy(btn, true, vt('viewer.session.share.busy'));
      var state = captureViewerState();
      if (note) state.note = note;

      fetch('/api/session/share', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }))
        .then(function (r) {
          if (!r.ok) throw new Error(vt('viewer.session.share.serverError', r.status));
          return r.json();
        })
        .then(function (data) {
          copyShareUrl(location.origin + location.pathname + data.url, data.expiresAt);
        })
        .catch(function (e) {
          alert(vt('viewer.session.share.failed', e.message));
        })
        .finally(function () {
          btn.disabled = false;
          // Restore the hamburger menu item's icon + label after busy state.
          // Material icon glyph name ('share') is a machine value, not UI text.
          btn.classList.remove('btn-busy');
          btn.innerHTML =
            '<span class="material-symbols-outlined" aria-hidden="true">share</span>' +
            vt('viewer.session.share.menuLabel');
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
      // Markup (strong/br/span) lives at the call site; only the human-readable
      // text is externalized so word order can change per locale.
      banner.innerHTML =
        '<strong>' + vt('viewer.session.expired.title') + '</strong><br>' +
        vt('viewer.session.expired.body') + '<br>' +
        '<span style="font-size:11px;color:#856404;">' +
        vt('viewer.session.expired.hint') + '</span>';
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
        countdownEl.textContent = vt('viewer.session.countdown.expired');
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
        countdownEl.textContent = vt('viewer.session.countdown.expiresInMinSec', mins, secs);
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
          warningBanner.textContent = vt('viewer.session.countdown.warning');
          var bar = document.getElementById('session-info-bar');
          if (bar && bar.nextSibling) {
            bar.parentNode.insertBefore(warningBanner, bar.nextSibling);
          } else if (bar) {
            bar.parentNode.appendChild(warningBanner);
          }
        }
      } else {
        countdownEl.textContent = vt('viewer.session.countdown.expiresInMin', mins);
      }
    }

    export function extendSession() {
      if (!S.currentSessionId) return;

      var extBtn = document.getElementById('session-extend-btn');
      if (extBtn) {
        extBtn.disabled = true;
        extBtn.textContent = vt('viewer.session.extend.busy');
      }

      fetch('/api/session/' + encodeURIComponent(S.currentSessionId) + '/extend',
        S.authOpts({ method: 'POST' })
      )
        .then(function(r) {
          if (!r.ok) throw new Error(vt('viewer.session.extend.serverError'));
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
          showCopyToast(vt('viewer.session.extend.done'));
        })
        .catch(function(e) {
          alert(vt('viewer.session.extend.failed', e.message));
        })
        .finally(function() {
          if (extBtn) {
            extBtn.disabled = false;
            extBtn.textContent = vt('viewer.session.extend.label');
          }
        });
    }

    export function renderSessionInfoBar(state, createdAt, expiresAt) {
      var infoBar = document.createElement('div');
      infoBar.id = 'session-info-bar';
      infoBar.style.cssText =
        'background:var(--link);color:var(--bg);padding:0.3rem 0.5rem;font-size:12px;text-align:center;';

      // Left side: session info text with optional note. The note variant is a
      // separate key (not English concatenation) so the whole phrase can be
      // reordered per locale; the created-timestamp suffix is appended via its
      // own token.
      var info = state.note
        ? vt('viewer.session.info.sharedWithNote', esc(state.note))
        : vt('viewer.session.info.shared');
      info += vt('viewer.session.info.created', new Date(createdAt).toLocaleString());
      var infoSpan = document.createElement('span');
      infoSpan.textContent = info;

      // Right side: live countdown and Extend button.
      var countdownSpan = document.createElement('span');
      countdownSpan.id = 'session-countdown';
      countdownSpan.style.cssText = 'margin-left:1rem;font-weight:bold;';

      var extendBtn = document.createElement('button');
      extendBtn.id = 'session-extend-btn';
      extendBtn.textContent = vt('viewer.session.extend.label');
      extendBtn.title = vt('viewer.session.extend.title');
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
      var annoHtml = '<strong>' + vt('viewer.session.annotations.heading') + '</strong><br>';
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
