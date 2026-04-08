/**
 * Natural-language modal module.
 *
 * Provides the "Ask in English..." modal UI: open/close, live preview
 * of NL-to-SQL conversion, and the "Use" action that populates the
 * main SQL editor.
 */
import * as S from './state.ts';
import { nlToSql } from './nl-to-sql.ts';

// TODO: loadSchemaMeta is still in app.js — will need to be imported
//       once it moves to a shared module.
declare function loadSchemaMeta(): Promise<any>;

    function nlModalOnEscape(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNlModal();
      }
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
      var nlModalInput = document.getElementById('nl-modal-input');
      if (nlModalInput) {
        nlModalInput.addEventListener('input', scheduleNlLivePreview);
        nlModalInput.addEventListener('paste', function () {
          setTimeout(scheduleNlLivePreview, 0);
        });
      }
    }
