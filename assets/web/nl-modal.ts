/**
 * Natural-language modal module.
 *
 * Provides the "Ask in English..." modal UI: open/close, live preview
 * of NL-to-SQL conversion, and the "Use" action that populates the
 * main SQL editor.
 */
import * as S from './state.ts';
import { nlToSql } from './nl-to-sql.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import { esc, setButtonBusy } from './utils.ts';
import { selectPanel } from './sidebar-panels.ts';
import { openTool } from './tabs.ts';

    /**
     * Web Speech API dictation for the NL question box.
     *
     * The recognizer is created lazily and reused. We keep a single module-level
     * handle so closeNlModal() can stop an in-flight session — recognition must
     * never outlive the dialog (the mic stays hot and keeps streaming audio
     * otherwise). nlMicActive guards against double-start, which throws on some
     * engines.
     */
    var nlRecognition = null;
    var nlMicActive = false;

    function nlSpeechApi() {
      // Chromium exposes the prefixed name; standard name is the spec target.
      // Cast through any: the DOM lib type for Window has no SpeechRecognition.
      var w = window as any;
      return w.SpeechRecognition || w.webkitSpeechRecognition || null;
    }

    function setNlMicRecording(on) {
      nlMicActive = on;
      var btn = document.getElementById('nl-mic');
      if (!btn) return;
      btn.classList.toggle('recording', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var icon = btn.querySelector('.material-symbols-outlined');
      // Swap to a "listening" glyph so the active state reads without color alone.
      if (icon) icon.textContent = on ? 'mic_off' : 'mic';
    }

    function ensureNlRecognition() {
      if (nlRecognition) return nlRecognition;
      var Api = nlSpeechApi();
      if (!Api) return null;
      var rec = new Api();
      rec.lang = (navigator.language || 'en-US');
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = function (event) {
        var ta = document.getElementById('nl-modal-input');
        if (!ta) return;
        // Concatenate every final transcript chunk from this session.
        var transcript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
        }
        transcript = transcript.trim();
        if (!transcript) return;
        // Append to existing text (with a separating space) rather than
        // overwrite, so dictation adds to whatever the user already typed.
        var existing = String(ta.value || '');
        ta.value = existing ? existing.replace(/\s*$/, '') + ' ' + transcript : transcript;
        scheduleNlLivePreview();
      };
      rec.onerror = function (event) {
        var code = event && event.error;
        // not-allowed / service-not-allowed = mic permission denied or blocked.
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setNlModalError('Microphone access was blocked. Allow it in your browser to dictate.', true);
        } else if (code === 'no-speech') {
          setNlModalError('No speech detected. Tap the mic and try again.', true);
        } else if (code !== 'aborted') {
          setNlModalError('Speech recognition error: ' + code, true);
        }
      };
      rec.onend = function () {
        setNlMicRecording(false);
      };
      nlRecognition = rec;
      return rec;
    }

    function toggleNlMic() {
      var rec = ensureNlRecognition();
      if (!rec) return;
      if (nlMicActive) {
        rec.stop();
        return;
      }
      setNlModalError('', false);
      try {
        rec.start();
        setNlMicRecording(true);
      } catch (err) {
        // start() throws if called while already running; resync UI state.
        setNlMicRecording(false);
      }
    }

    function stopNlMic() {
      if (nlRecognition && nlMicActive) {
        // abort() (not stop()) discards the in-flight result — the dialog is
        // closing, so we don't want a late transcript writing into a hidden box.
        nlRecognition.abort();
      }
      setNlMicRecording(false);
    }
    /**
     * Restores the help sections to their default state: first group open, the
     * rest collapsed, all examples visible, empty-state hidden. Used when the
     * search box is cleared and when the panel is (re)opened.
     */
    function resetNlHelpSections() {
      var panel = document.getElementById('nl-help-panel');
      if (!panel) return;
      var secs = panel.querySelectorAll('.nl-help-sec');
      for (var i = 0; i < secs.length; i++) {
        var sec = secs[i] as HTMLDetailsElement;
        sec.open = (i === 0);
        sec.hidden = false;
        var items = sec.querySelectorAll('li');
        for (var j = 0; j < items.length; j++) items[j].hidden = false;
      }
      var empty = panel.querySelector('.nl-help-empty') as HTMLElement | null;
      if (empty) empty.hidden = true;
    }

    /**
     * Filters the help examples by the search term: hides non-matching <li>s,
     * hides sections left with no match, and force-expands the sections that do
     * match so hits are visible without manual clicking. An empty term restores
     * the default layout. Matching is plain case-insensitive substring — these
     * are short example phrases, so no fuzzy logic is warranted.
     */
    function filterNlHelp() {
      var input = document.getElementById('nl-help-search') as HTMLInputElement | null;
      var panel = document.getElementById('nl-help-panel');
      if (!input || !panel) return;
      var term = String(input.value || '').trim().toLowerCase();
      if (!term) { resetNlHelpSections(); return; }
      var secs = panel.querySelectorAll('.nl-help-sec');
      var anyVisible = false;
      for (var i = 0; i < secs.length; i++) {
        var sec = secs[i] as HTMLDetailsElement;
        var items = sec.querySelectorAll('li');
        var secHas = false;
        for (var j = 0; j < items.length; j++) {
          var el = items[j];
          var match = (el.textContent || '').toLowerCase().indexOf(term) >= 0;
          el.hidden = !match;
          if (match) secHas = true;
        }
        sec.hidden = !secHas;
        sec.open = secHas;
        if (secHas) anyVisible = true;
      }
      var empty = panel.querySelector('.nl-help-empty') as HTMLElement | null;
      if (empty) empty.hidden = anyVisible;
    }

    /**
     * Toggles the phrase-coverage help panel and keeps the [i] button's
     * aria-expanded in sync, so the disclosure state is exposed to assistive
     * tech rather than communicated by the icon alone.
     */
    function toggleNlHelp() {
      var panel = document.getElementById('nl-help-panel');
      var btn = document.getElementById('nl-help');
      if (!panel) return;
      var show = panel.hidden;
      panel.hidden = !show;
      if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
      // On open, start from a clean, default layout (clear any prior filter).
      if (show) {
        var input = document.getElementById('nl-help-search') as HTMLInputElement | null;
        if (input) input.value = '';
        resetNlHelpSections();
      }
    }
    /** Collapses the help panel (called on close so a reopen starts clean). */
    function hideNlHelp() {
      var panel = document.getElementById('nl-help-panel');
      var btn = document.getElementById('nl-help');
      if (panel) panel.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    /** NL conversion messages stay in the modal so they do not clear or replace run/query errors under the main editor. */
    export function setNlModalError(msg, visible) {
      var modalErr = document.getElementById('nl-modal-error');
      if (visible && msg) {
        if (modalErr) {
          modalErr.textContent = msg;
          modalErr.style.display = 'block';
        }
      } else if (modalErr) {
        modalErr.style.display = 'none';
      }
    }
    async function applyNlLivePreview() {
      var ta = document.getElementById('nl-modal-input');
      var preview = document.getElementById('nl-modal-sql-preview');
      if (!ta || !preview) return;
      var question = String(ta.value || '').trim();
      // Any change to the question makes prior sample results stale — drop them
      // so the table never shows rows for SQL that no longer matches the preview.
      clearNlPreviewResults();
      if (!question) {
        preview.value = '';
        setNlModalError('', false);
        return;
      }
      try {
        var meta = await loadSchemaMeta();
        var result = nlToSql(question, meta);
        if (result.sql) {
          preview.value = result.sql;
          setNlModalError('', false);
        } else {
          preview.value = '';
          setNlModalError(result.error || 'Could not convert to SQL.', true);
        }
      } catch (err) {
        preview.value = '';
        setNlModalError('Error: ' + (err.message || err), true);
      }
    }
    export function scheduleNlLivePreview() {
      if (S.nlLiveDebounce) clearTimeout(S.nlLiveDebounce);
      S.setNlLiveDebounce(setTimeout(function () {
        S.setNlLiveDebounce(null);
        applyNlLivePreview();
      }, 120));
    }
    /** Shows the Ask panel in the sidebar and focuses the question box. */
    export function openNlModal() {
      selectPanel('ask');
      var ta = document.getElementById('nl-modal-input');
      if (ta) ta.focus();
      scheduleNlLivePreview();
    }
    /**
     * Resets the Ask panel's transient UI (dictation, help disclosure, sample
     * results). The panel is hidden by the sidebar's panel switch, not by this
     * function — there's no modal to close — but we still stop the mic and
     * clear stale preview rows when the user finishes a query.
     */
    export function closeNlModal() {
      stopNlMic();
      hideNlHelp();
      clearNlPreviewResults();
    }
    async function useNlModal() {
      var ta = document.getElementById('nl-modal-input');
      var sqlEl = document.getElementById('sql-input') as HTMLTextAreaElement | null;
      if (!ta || !sqlEl) return;
      var question = String(ta.value || '').trim();
      if (!question) {
        setNlModalError('Enter a question first.', true);
        return;
      }
      try {
        var meta = await loadSchemaMeta();
        var result = nlToSql(question, meta);
        if (result.sql) {
          sqlEl.value = result.sql;
          var mainErr = document.getElementById('sql-error');
          if (mainErr) {
            mainErr.textContent = '';
            mainErr.style.display = 'none';
          }
          // Surface the result where it runs: open/!switch to the Run SQL tab
          // with the generated query loaded, instead of closing a dialog.
          openTool('sql');
          setNlModalError('', false);
        } else {
          setNlModalError(result.error || 'Could not convert to SQL.', true);
        }
      } catch (err) {
        setNlModalError('Error: ' + (err.message || err), true);
      }
    }

    /**
     * Copies the generated SQL preview to the clipboard.
     *
     * Distinct from Use: Use overwrites the main editor and closes the dialog;
     * Copy just puts the text on the clipboard so the user can paste it
     * elsewhere while keeping the dialog (and the main editor) untouched.
     */
    async function copyNlSql() {
      var preview = document.getElementById('nl-modal-sql-preview') as HTMLTextAreaElement | null;
      var btn = document.getElementById('nl-copy');
      var sql = preview ? String(preview.value || '').trim() : '';
      if (!sql) {
        setNlModalError('Nothing to copy yet — enter a question first.', true);
        return;
      }
      try {
        await navigator.clipboard.writeText(sql);
      } catch (err) {
        // Clipboard API needs a secure context / permission; fall back to a
        // hidden-textarea execCommand copy so the button still works on http.
        try {
          preview.focus();
          preview.select();
          document.execCommand('copy');
        } catch (err2) {
          setNlModalError('Could not copy to the clipboard.', true);
          return;
        }
      }
      // Brief visual confirmation: swap the icon to a check, then restore.
      if (btn) {
        var icon = btn.querySelector('.material-symbols-outlined');
        if (icon) {
          var prev = icon.textContent;
          icon.textContent = 'check';
          btn.classList.add('copied');
          setTimeout(function () {
            icon.textContent = prev;
            btn.classList.remove('copied');
          }, 1100);
        }
      }
    }

    /**
     * Runs the generated SQL and renders the first 10 rows inside the dialog.
     *
     * The preview SQL is wrapped as a subquery with an outer LIMIT 10 rather
     * than appended with " LIMIT 10": the generated query may already carry its
     * own LIMIT / ORDER BY / aggregates, and the subquery wrapper caps the row
     * count without having to parse or rewrite the inner SQL. SELECT * over the
     * subquery preserves the inner column names.
     */
    async function previewNlResults() {
      var preview = document.getElementById('nl-modal-sql-preview') as HTMLTextAreaElement | null;
      var resultsEl = document.getElementById('nl-modal-results');
      var btn = document.getElementById('nl-preview-run') as HTMLButtonElement | null;
      var sql = preview ? String(preview.value || '').trim() : '';
      if (!sql) {
        setNlModalError('Enter a question to generate SQL first.', true);
        return;
      }
      if (!resultsEl) return;
      setNlModalError('', false);
      // Strip a trailing semicolon so the subquery wrapper stays valid SQL.
      var inner = sql.replace(/;\s*$/, '');
      var limited = 'SELECT * FROM (\n' + inner + '\n) LIMIT 10';
      var origLabel = btn ? btn.textContent : '';
      if (btn) {
        btn.disabled = true;
        setButtonBusy(btn, true, 'Running…');
      }
      try {
        var resp = await fetch('/api/sql', S.authOpts({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: limited }),
        }));
        var data = await resp.json();
        if (!resp.ok) {
          // Surface the server error in the modal error line, not the results box.
          setNlModalError(data.error || 'Preview failed.', true);
          resultsEl.hidden = true;
          resultsEl.innerHTML = '';
          return;
        }
        renderNlPreviewRows(resultsEl, data.rows || []);
      } catch (err) {
        setNlModalError('Preview error: ' + ((err as any).message || err), true);
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      } finally {
        if (btn) {
          btn.disabled = false;
          setButtonBusy(btn, false, origLabel || 'Preview results');
        }
      }
    }

    /** Renders preview rows as a compact table (or an empty-state line). */
    function renderNlPreviewRows(container, rows) {
      container.hidden = false;
      if (!rows || rows.length === 0) {
        container.innerHTML = '<p class="meta nl-modal-results-empty">Query ran — 0 rows.</p>';
        return;
      }
      var keys = Object.keys(rows[0]);
      var html = '<p class="meta">First ' + rows.length + ' row(s)</p>';
      html += '<div class="data-table-scroll-wrap"><table><thead><tr>';
      html += keys.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('');
      html += '</tr></thead><tbody>';
      rows.forEach(function (row) {
        html += '<tr>' + keys.map(function (k) {
          return '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>';
        }).join('') + '</tr>';
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    }

    /** Clears the in-dialog preview results (called on close and on reconvert). */
    function clearNlPreviewResults() {
      var resultsEl = document.getElementById('nl-modal-results');
      if (resultsEl) {
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      }
    }

    /**
     * Wires up NL modal DOM event listeners.
     * Call once after DOMContentLoaded / initial render.
     */
    export function initNlModalListeners() {
      // The panel is shown by the Ask activity-bar icon (sidebar-panels.ts);
      // there's no open/cancel/backdrop to wire anymore. When Ask is selected
      // we focus the question box for a keyboard-ready start.
      var askBtn = document.querySelector('[data-panel-btn="ask"]');
      if (askBtn) {
        askBtn.addEventListener('click', function () {
          // Focus only when the panel is now showing (not when toggled shut).
          var sb = document.getElementById('app-sidebar');
          var layout = document.getElementById('app-layout');
          var showing = sb && layout
            && sb.getAttribute('data-active-panel') === 'ask'
            && !layout.classList.contains('app-sidebar-panel-collapsed');
          if (showing) {
            var ta = document.getElementById('nl-modal-input');
            if (ta) (ta as HTMLElement).focus();
            scheduleNlLivePreview();
          }
        });
      }
      var nlUse = document.getElementById('nl-use');
      if (nlUse) nlUse.addEventListener('click', function () { useNlModal(); });
      // Dictation: only reveal + wire the mic when the browser supports the API,
      // so unsupported browsers (Firefox) keep the button hidden, not dead.
      var nlMic = document.getElementById('nl-mic');
      if (nlMic && nlSpeechApi()) {
        nlMic.hidden = false;
        nlMic.addEventListener('click', toggleNlMic);
      }
      var nlHelp = document.getElementById('nl-help');
      if (nlHelp) nlHelp.addEventListener('click', toggleNlHelp);
      var nlHelpSearch = document.getElementById('nl-help-search');
      if (nlHelpSearch) nlHelpSearch.addEventListener('input', filterNlHelp);
      var nlCopy = document.getElementById('nl-copy');
      if (nlCopy) nlCopy.addEventListener('click', function () { copyNlSql(); });
      var nlPreviewRun = document.getElementById('nl-preview-run');
      if (nlPreviewRun) nlPreviewRun.addEventListener('click', function () { previewNlResults(); });
      var nlModalInput = document.getElementById('nl-modal-input');
      if (nlModalInput) {
        nlModalInput.addEventListener('input', scheduleNlLivePreview);
        nlModalInput.addEventListener('paste', function () {
          setTimeout(scheduleNlLivePreview, 0);
        });
      }
    }
