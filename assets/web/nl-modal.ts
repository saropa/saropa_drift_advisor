/**
 * Natural-language modal module.
 *
 * Provides the "Ask in English..." modal UI: open/close, live preview
 * of NL-to-SQL conversion, and the "Use" action that populates the
 * main SQL editor.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { nlToSql, isDateColumn, narrateAnswer, detectRefinement, combineRefinement, detectNlKeyword, applyTemporalSwap } from './nl-to-sql.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import { getPref, PREF_NL_KEYWORDS, DEFAULTS } from './settings.ts';
import { esc, setButtonBusy } from './utils.ts';
import { formatSqlSafe } from './sql-format.ts';
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

    /**
     * The most recent NlResult from the live preview. The wake-phrase narrator
     * reads its answerKind / verb / qualifier to phrase the spoken answer, so it
     * must reflect the question currently shown in the preview. Set on every
     * applyNlLivePreview run; consumed by previewNlResults when result.wake.
     */
    var lastNlResult = null;

    /**
     * Refine-in-English loop (Feature 18 polish): the last question that was run
     * (Use / Preview results) or shown as a fresh preview. A follow-up that
     * starts with an additive connective ("now only active", "and sorted by
     * name") is appended to this base and the combined English is re-parsed, so
     * the user narrows the prior query instead of restarting. Empty until the
     * first query; reset when the question box is cleared.
     */
    var nlBaseQuestion = '';

    /**
     * Resolves the question to actually convert: when [raw] is a refinement and
     * a base exists, returns the base + fragment combined; otherwise [raw]. Pure
     * read of [nlBaseQuestion] — it never mutates the base (callers update the
     * base only at fresh-preview / run time, so live keystrokes can't corrupt the
     * accumulated question mid-type).
     */
    function effectiveNlQuestion(raw: string): string {
      var ref = detectRefinement(raw);
      if (ref.isRefinement && nlBaseQuestion) {
        return combineRefinement(nlBaseQuestion, ref.fragment);
      }
      return raw;
    }

    /** Shows or hides the "refining the last query" hint with the combined text. */
    function setNlRefineHint(combined: string) {
      var hint = document.getElementById('nl-refine-hint');
      if (!hint) return;
      if (combined) {
        hint.textContent = vt('viewer.sql.nl.refineHint', combined);
        hint.hidden = false;
      } else {
        hint.textContent = '';
        hint.hidden = true;
      }
    }

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
        // Voice commands (clear / run again / time-window swap) are handled here
        // before the transcript is inserted, so saying "clear" runs the command
        // instead of typing the word. Gated by the Keywords preference.
        if (interpretNlKeyword(transcript)) return;
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
          setNlModalError(vt('viewer.sql.nl.mic.blocked'), true);
        } else if (code === 'no-speech') {
          setNlModalError(vt('viewer.sql.nl.mic.noSpeech'), true);
        } else if (code !== 'aborted') {
          setNlModalError(vt('viewer.sql.nl.mic.error', code), true);
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

    /**
     * Clears the question box and ends the refine loop. Resets nlBaseQuestion so
     * the next query starts a fresh base (not a follow-up on the cleared text),
     * drops any modal error, and re-runs the live preview, which on an empty box
     * blanks the SQL preview and restores the default refinement chips.
     */
    function clearNlQuestion() {
      var ta = document.getElementById('nl-modal-input') as HTMLTextAreaElement | null;
      if (!ta) return;
      ta.value = '';
      nlBaseQuestion = '';
      setNlModalError('', false);
      ta.focus();
      scheduleNlLivePreview();
    }

    /**
     * When the Keywords preference is on, interprets [text] (a dictated phrase
     * or typed line) as a voice command and performs it, returning true so the
     * caller skips inserting [text] as literal query text. Returns false when
     * keywords are off or the text is a normal question.
     *
     *   clear / start again       → empties the question box
     *   run again / again         → re-runs the current query
     *   "(what about) last year"  → swaps the prior query's time window
     *
     * A time-window swap with no prior window to swap falls through (false) so
     * the spoken phrase seeds a fresh question rather than being silently lost.
     */
    function interpretNlKeyword(text): boolean {
      if (!getPref(PREF_NL_KEYWORDS, DEFAULTS[PREF_NL_KEYWORDS])) return false;
      var cmd = detectNlKeyword(text);
      if (!cmd) return false;
      if (cmd.kind === 'clear') {
        clearNlQuestion();
        return true;
      }
      if (cmd.kind === 'run') {
        previewNlResults();
        return true;
      }
      if (cmd.kind === 'temporalSwap') {
        var swapped = applyTemporalSwap(nlBaseQuestion, cmd.phrase);
        if (!swapped) return false;
        var ta = document.getElementById('nl-modal-input') as HTMLTextAreaElement | null;
        if (ta) ta.value = swapped;
        nlBaseQuestion = swapped;
        scheduleNlLivePreview();
        return true;
      }
      return false;
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
    /** Lightweight singularizer for readable chip phrases (companies→company). */
    function nlSingular(n) {
      if (/ies$/.test(n)) return n.replace(/ies$/, 'y');
      if (/(ses|xes|zes|ches|shes)$/.test(n)) return n.replace(/es$/, '');
      if (/s$/.test(n) && !/ss$/.test(n)) return n.replace(/s$/, '');
      return n;
    }

    /** The table chosen in the clarifier dropdown, or undefined for auto-detect. */
    function nlTableOverride() {
      var sel = document.getElementById('nl-table-select') as HTMLSelectElement | null;
      return sel && sel.value ? sel.value : undefined;
    }

    /** Fills the clarifier dropdown with every table (once). */
    function populateNlTableSelect(meta) {
      var sel = document.getElementById('nl-table-select') as HTMLSelectElement | null;
      if (!sel || sel.options.length > 1) return;
      var tables = (meta && meta.tables) || [];
      for (var i = 0; i < tables.length; i++) {
        var o = document.createElement('option');
        o.value = tables[i].name;
        o.textContent = tables[i].name;
        sel.appendChild(o);
      }
    }

    /**
     * Shows a hint when the table was guessed (and not overridden), so the user
     * knows to pick one if the guess is wrong — turning the old dead-end into a
     * one-click correction.
     */
    function updateNlClarifier(result) {
      var hint = document.getElementById('nl-clarify-hint');
      var clarify = document.getElementById('nl-clarify');
      if (!hint || !clarify) return;
      var guessed = result && result.table && !nlTableOverride()
        && (result.confidence === 'guess' || result.confidence === 'ambiguous');
      if (guessed) {
        hint.textContent = vt('viewer.sql.nl.clarify.guessed', result.table);
        clarify.classList.add('nl-clarify-guess');
      } else {
        hint.textContent = '';
        clarify.classList.remove('nl-clarify-guess');
      }
    }

    /**
     * Builds schema-derived refinement chips for [tableName]: each is a
     * natural-language phrase that clicking appends to (or removes from) the
     * question. Relationship chips come first (the differentiator), then
     * date / boolean / numeric facets, then count / sort / limit.
     */
    function nlRefinements(tableName, meta) {
      var tables = (meta && meta.tables) || [];
      var t = null;
      for (var i = 0; i < tables.length; i++) if (tables[i].name === tableName) { t = tables[i]; break; }
      if (!t) return [];
      var cols = t.columns || [];
      var fks = (meta && meta.foreignKeys) || [];
      var chips = [];
      // Relationships first.
      var children = fks.filter(function (e) { return e.toTable === tableName; });
      for (var i = 0; i < children.length && i < 2; i++) {
        var ct = children[i].fromTable;
        chips.push({ label: '>1 ' + ct, phrase: 'with more than one ' + nlSingular(ct) });
        chips.push({ label: 'no ' + ct, phrase: 'without any ' + ct });
      }
      var parents = fks.filter(function (e) { return e.fromTable === tableName; });
      for (var i = 0; i < parents.length && i < 1; i++) {
        var pt = parents[i].toTable;
        chips.push({ label: 'has ' + nlSingular(pt), phrase: 'with a ' + nlSingular(pt) });
      }
      // Date facets.
      var dateCol = cols.filter(isDateColumn)[0];
      if (dateCol) {
        chips.push({ label: 'this week', phrase: 'created this week' });
        chips.push({ label: 'today', phrase: 'changed today' });
        chips.push({ label: 'stale 90d', phrase: 'not updated in 90 days' });
      }
      // Boolean flags — exact when Drift declared a bool, else a flag-shaped name.
      var boolCols = cols.filter(function (c) {
        return c.driftType === 'bool'
          || (/bool|int/i.test(c.type || '') && /^is_|^has_|active|enabled|verified|archived|deleted|subscribed/i.test(c.name));
      });
      for (var i = 0; i < boolCols.length && i < 2; i++) {
        var nm = boolCols[i].name.toLowerCase().replace(/^(is|has)_/, '').replace(/_/g, ' ');
        chips.push({ label: 'only ' + nm, phrase: nm });
      }
      // Numeric extreme — a real measure, so skip ids, boolean flags, and
      // date/time columns ("highest active" / "highest updated_at" are nonsense).
      var numCol = cols.filter(function (c) {
        return /int|real|num|float|double|dec/i.test(c.type || '')
          && !/^id$|_id$|date|time|_at\b|_on\b|created|updated|changed|timestamp|^is_|^has_|active|enabled|disabled|verified|visible|hidden|archived|deleted|locked|subscribed|public|private/i.test(c.name);
      })[0];
      if (numCol) chips.push({ label: 'highest ' + numCol.name, phrase: 'highest ' + numCol.name });
      // Always-available shaping.
      chips.push({ label: 'count', phrase: 'as a total' });
      chips.push({ label: 'newest', phrase: 'newest first' });
      chips.push({ label: 'top 10', phrase: 'top 10' });
      return chips.slice(0, 10);
    }

    /** Adds the phrase to the question, or removes it if already present. */
    function toggleNlRefinement(phrase) {
      var ta = document.getElementById('nl-modal-input') as HTMLTextAreaElement | null;
      if (!ta) return;
      var cur = String(ta.value || '');
      var idx = cur.toLowerCase().indexOf(phrase.toLowerCase());
      if (idx >= 0) {
        ta.value = (cur.slice(0, idx) + cur.slice(idx + phrase.length)).replace(/\s{2,}/g, ' ').trim();
      } else {
        ta.value = (cur.trim() + ' ' + phrase).trim();
      }
      ta.focus();
      scheduleNlLivePreview();
    }

    /** Renders the refinement chips, marking ones already in the question. */
    function renderNlRefinements(tableName, meta) {
      var wrap = document.getElementById('nl-refine');
      if (!wrap) return;
      var ta = document.getElementById('nl-modal-input') as HTMLTextAreaElement | null;
      var q = (ta ? String(ta.value || '') : '').toLowerCase();
      var chips = nlRefinements(tableName, meta);
      wrap.innerHTML = '';
      chips.forEach(function (chip) {
        var applied = q.indexOf(chip.phrase.toLowerCase()) >= 0;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'nl-chip' + (applied ? ' nl-chip-on' : '');
        b.textContent = chip.label;
        b.title = vt(applied ? 'viewer.sql.nl.chip.remove' : 'viewer.sql.nl.chip.add', chip.phrase);
        b.addEventListener('click', function () { toggleNlRefinement(chip.phrase); });
        wrap.appendChild(b);
      });
    }

    async function applyNlLivePreview() {
      var ta = document.getElementById('nl-modal-input');
      var preview = document.getElementById('nl-modal-sql-preview');
      if (!ta || !preview) return;
      var question = String(ta.value || '').trim();
      // Any change to the question makes prior sample results stale — drop them
      // so the table never shows rows for SQL that no longer matches the preview.
      clearNlPreviewResults();
      try {
        var meta = await loadSchemaMeta();
        populateNlTableSelect(meta);
        var override = nlTableOverride();
        if (!question) {
          // No question yet: clear the preview but still show the chips for the
          // chosen (or first) table so the user has somewhere to start. An empty
          // box also ends the refine loop — the next query starts a fresh base.
          preview.value = '';
          setNlModalError('', false);
          setNlRefineHint('');
          nlBaseQuestion = '';
          updateNlClarifier(null);
          var first = override || (meta.tables && meta.tables[0] && meta.tables[0].name);
          renderNlRefinements(first, meta);
          return;
        }
        // Refine-in-English: a connective-led follow-up ("now only active") is
        // appended to the last query's base; otherwise the raw question stands.
        var effective = effectiveNlQuestion(question);
        var refining = effective !== question;
        setNlRefineHint(refining ? effective : '');
        var result = nlToSql(effective, meta, { table: override });
        lastNlResult = result;
        if (result.sql) {
          // Format the generated SQL for the preview (item 2) so the readonly
          // box shows a readable, multi-line query.
          preview.value = formatSqlSafe(result.sql);
          setNlModalError('', false);
          // A fresh (non-refining) question that converts becomes the new base
          // for the next follow-up; a refining preview leaves the base untouched
          // so rapid keystrokes can't accumulate partial fragments (the base
          // advances only when the refined query is actually run).
          if (!refining) nlBaseQuestion = question;
          // Wake phrase ("hey saropa, …") turns the panel into a chat reply: run
          // the query and narrate the answer now, rather than waiting for a click.
          if (result.wake) previewNlResults();
        } else if (result.wake) {
          // Addressed by name but nothing left to ask after stripping the phrase.
          preview.value = '';
          setNlModalError('', false);
          renderNlNarrativeMessage(vt('viewer.sql.nl.noQuestion'));
        } else {
          preview.value = '';
          setNlModalError(result.error || vt('viewer.sql.nl.convertFailed'), true);
        }
        updateNlClarifier(result);
        renderNlRefinements((result && result.table) || override, meta);
      } catch (err) {
        preview.value = '';
        setNlModalError(vt('viewer.sql.nl.error', err.message || err), true);
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
        setNlModalError(vt('viewer.sql.nl.enterQuestion'), true);
        return;
      }
      try {
        var meta = await loadSchemaMeta();
        // Convert the effective (possibly refined) question, then advance the
        // base to it so a subsequent "and …" / "now …" builds on what was run.
        var effective = effectiveNlQuestion(question);
        var result = nlToSql(effective, meta);
        if (result.sql) {
          nlBaseQuestion = effective;
          setNlRefineHint('');
          // Format the SQL written into the main editor (item 2).
          sqlEl.value = formatSqlSafe(result.sql);
          var mainErr = document.getElementById('sql-error');
          if (mainErr) {
            mainErr.textContent = '';
            mainErr.style.display = 'none';
          }
          // Surface the result where it runs: open / switch to the Run SQL tab
          // with the generated query loaded, instead of closing a dialog.
          openTool('sql');
          setNlModalError('', false);
          // Reset the Ask panel's transient UI — stops any live dictation so the
          // mic doesn't keep streaming, and drops the in-panel sample rows.
          closeNlModal();
        } else {
          setNlModalError(result.error || vt('viewer.sql.nl.convertFailed'), true);
        }
      } catch (err) {
        setNlModalError(vt('viewer.sql.nl.error', err.message || err), true);
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
        setNlModalError(vt('viewer.sql.nl.copyEmpty'), true);
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
          setNlModalError(vt('viewer.sql.nl.copyFailed'), true);
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
        setNlModalError(vt('viewer.sql.nl.previewNeedsSql'), true);
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
        setButtonBusy(btn, true, vt('viewer.sql.nl.preview.busy'));
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
          setNlModalError(data.error || vt('viewer.sql.nl.previewFailed'), true);
          resultsEl.hidden = true;
          resultsEl.innerHTML = '';
          return;
        }
        renderNlPreviewRows(resultsEl, data.rows || []);
        // Running a refined query commits it as the new base, so the next
        // "and …" follow-up narrows this result rather than the original.
        var nlInput = document.getElementById('nl-modal-input') as HTMLTextAreaElement | null;
        var ranQuestion = nlInput ? String(nlInput.value || '').trim() : '';
        if (ranQuestion) {
          nlBaseQuestion = effectiveNlQuestion(ranQuestion);
          setNlRefineHint('');
        }
        // Wake-phrase questions get a spoken-style answer above the rows.
        if (lastNlResult && lastNlResult.wake) {
          await renderNlNarrative(resultsEl, lastNlResult, data.rows || []);
        }
      } catch (err) {
        setNlModalError(vt('viewer.sql.nl.previewError', (err as any).message || err), true);
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      } finally {
        if (btn) {
          btn.disabled = false;
          setButtonBusy(btn, false, origLabel || vt('nl.modal.preview'));
        }
      }
    }

    /** Renders preview rows as a compact table (or an empty-state line). */
    function renderNlPreviewRows(container, rows) {
      container.hidden = false;
      if (!rows || rows.length === 0) {
        container.innerHTML = '<p class="meta nl-modal-results-empty">' + esc(vt('viewer.sql.nl.results.empty')) + '</p>';
        return;
      }
      var keys = Object.keys(rows[0]);
      var html = '<p class="meta">' + esc(vt('viewer.sql.nl.results.firstRows', rows.length)) + '</p>';
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

    // Answer kinds whose SQL returns a single aggregate cell to read directly.
    // The rest (rows / latest / oldest / distinct / duplicate / group) need an
    // exact COUNT(*) for their narrated total.
    var NL_SCALAR_KINDS = { count: 1, sum: 1, avg: 1, max: 1, min: 1 };

    /**
     * Renders the spoken-style answer at the TOP of the results area for a
     * wake-phrase question: the sentence, a divider, then the full SQL that
     * derived it (per the user's request to always show the query). Scalar
     * answers read the single returned cell; the rest run one extra COUNT(*)
     * (trailing LIMIT stripped) so the narrated total is exact, not the 10-row
     * preview cap.
     */
    async function renderNlNarrative(resultsEl, result, rows) {
      var sentence;
      if (NL_SCALAR_KINDS[result.answerKind]) {
        var value = (rows && rows.length) ? firstCell(rows[0]) : null;
        sentence = narrateAnswer(result, value, null);
      } else {
        var total = await nlExactCount(result.sql);
        sentence = narrateAnswer(result, null, total);
      }
      if (!sentence) return;
      prependNlNarrative(resultsEl, sentence, result.sql);
    }

    /** First column value of a result row (aggregates return a single cell). */
    function firstCell(row) {
      var keys = Object.keys(row || {});
      if (!keys.length) return null;
      var v = row[keys[0]];
      return v == null ? null : Number(v);
    }

    /**
     * Exact row count for a non-scalar answer. The generated SQL caps rows with a
     * trailing LIMIT for the preview; counting that would undercount, so the
     * trailing LIMIT is stripped before wrapping in COUNT(*). Returns null on
     * any error, which narrateAnswer renders as "0".
     */
    async function nlExactCount(sql) {
      var inner = String(sql || '').replace(/;\s*$/, '').replace(/\s+limit\s+\d+\s*$/i, '');
      try {
        var resp = await fetch('/api/sql', S.authOpts({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'SELECT COUNT(*) AS n FROM (\n' + inner + '\n)' }),
        }));
        var data = await resp.json();
        if (!resp.ok || !data.rows || !data.rows.length) return null;
        return firstCell(data.rows[0]);
      } catch (err) {
        return null;
      }
    }

    /** Inserts the narrative bubble (sentence + divider + SQL) above the rows. */
    function prependNlNarrative(resultsEl, sentence, sql) {
      resultsEl.hidden = false;
      var html =
        '<div class="nl-narrative">' +
        '<p class="nl-narrative-say">' + esc(sentence) + '</p>' +
        '<hr class="nl-narrative-rule">' +
        '<pre class="nl-narrative-sql">' + esc(String(sql || '')) + '</pre>' +
        '</div>';
      resultsEl.insertAdjacentHTML('afterbegin', html);
    }

    /**
     * Narrative bubble carrying only a message (no SQL) — used when the user said
     * the wake phrase but left no answerable question.
     */
    function renderNlNarrativeMessage(msg) {
      var resultsEl = document.getElementById('nl-modal-results');
      if (!resultsEl) return;
      resultsEl.hidden = false;
      resultsEl.innerHTML =
        '<div class="nl-narrative"><p class="nl-narrative-say">' + esc(msg) + '</p></div>';
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
      // there's no open/cancel/backdrop to wire anymore. We watch every panel
      // switch: arriving at Ask focuses the question box; leaving it stops any
      // in-flight dictation and clears stale sample rows (closeNlModal). The
      // check is deferred so it runs AFTER sidebar-panels has flipped the
      // active-panel attribute.
      document.querySelectorAll('[data-panel-btn]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setTimeout(function () {
            var sb = document.getElementById('app-sidebar');
            var layout = document.getElementById('app-layout');
            var askShowing = !!sb && !!layout
              && sb.getAttribute('data-active-panel') === 'ask'
              && !layout.classList.contains('app-sidebar-panel-collapsed');
            if (askShowing) {
              var ta = document.getElementById('nl-modal-input');
              if (ta) (ta as HTMLElement).focus();
              scheduleNlLivePreview();
            } else {
              closeNlModal();
            }
          }, 0);
        });
      });
      var nlUse = document.getElementById('nl-use');
      if (nlUse) nlUse.addEventListener('click', function () { useNlModal(); });
      // Dictation: only reveal + wire the mic when the browser supports the API,
      // so unsupported browsers (Firefox) keep the button hidden, not dead.
      var nlMic = document.getElementById('nl-mic');
      if (nlMic && nlSpeechApi()) {
        nlMic.hidden = false;
        nlMic.addEventListener('click', toggleNlMic);
      }
      var nlClear = document.getElementById('nl-clear');
      if (nlClear) nlClear.addEventListener('click', clearNlQuestion);
      var nlHelp = document.getElementById('nl-help');
      if (nlHelp) nlHelp.addEventListener('click', toggleNlHelp);
      var nlHelpSearch = document.getElementById('nl-help-search');
      if (nlHelpSearch) nlHelpSearch.addEventListener('input', filterNlHelp);
      var nlCopy = document.getElementById('nl-copy');
      if (nlCopy) nlCopy.addEventListener('click', function () { copyNlSql(); });
      // Clarifier dropdown: picking a table overrides the auto-detected one and
      // re-runs the preview against it.
      var nlTableSel = document.getElementById('nl-table-select');
      if (nlTableSel) nlTableSel.addEventListener('change', scheduleNlLivePreview);
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
