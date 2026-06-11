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

    function nlModalOnEscape(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNlModal();
      }
    }

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
    export function openNlModal() {
      var modal = document.getElementById('nl-modal');
      var ta = document.getElementById('nl-modal-input');
      if (!modal || !ta) return;
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      ta.focus();
      if (!S.nlModalEscapeListenerActive) {
        document.addEventListener('keydown', nlModalOnEscape);
        S.setNlModalEscapeListenerActive(true);
      }
      scheduleNlLivePreview();
    }
    export function closeNlModal() {
      var modal = document.getElementById('nl-modal');
      if (!modal) return;
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      if (S.nlModalEscapeListenerActive) {
        document.removeEventListener('keydown', nlModalOnEscape);
        S.setNlModalEscapeListenerActive(false);
      }
      // Kill any in-flight dictation so the mic doesn't keep streaming after close.
      stopNlMic();
      var openBtn = document.getElementById('nl-open');
      if (openBtn) openBtn.focus();
    }
    async function useNlModal() {
      var ta = document.getElementById('nl-modal-input');
      var sqlEl = document.getElementById('sql-input');
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
          closeNlModal();
        } else {
          setNlModalError(result.error || 'Could not convert to SQL.', true);
        }
      } catch (err) {
        setNlModalError('Error: ' + (err.message || err), true);
      }
    }

    /**
     * Wires up NL modal DOM event listeners.
     * Call once after DOMContentLoaded / initial render.
     */
    export function initNlModalListeners() {
      var nlOpenEl = document.getElementById('nl-open');
      if (nlOpenEl) nlOpenEl.addEventListener('click', openNlModal);
      var nlBackdrop = document.getElementById('nl-modal-backdrop');
      if (nlBackdrop) nlBackdrop.addEventListener('click', closeNlModal);
      var nlCancel = document.getElementById('nl-cancel');
      if (nlCancel) nlCancel.addEventListener('click', closeNlModal);
      var nlUse = document.getElementById('nl-use');
      if (nlUse) nlUse.addEventListener('click', function () { useNlModal(); });
      // Dictation: only reveal + wire the mic when the browser supports the API,
      // so unsupported browsers (Firefox) keep the button hidden, not dead.
      var nlMic = document.getElementById('nl-mic');
      if (nlMic && nlSpeechApi()) {
        nlMic.hidden = false;
        nlMic.addEventListener('click', toggleNlMic);
      }
      var nlModalInput = document.getElementById('nl-modal-input');
      if (nlModalInput) {
        nlModalInput.addEventListener('input', scheduleNlLivePreview);
        nlModalInput.addEventListener('paste', function () {
          setTimeout(scheduleNlLivePreview, 0);
        });
      }
    }
