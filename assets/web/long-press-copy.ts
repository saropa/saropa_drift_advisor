/**
 * Touch long-press (hold) → clipboard copy for identifiers shown across the viewer:
 * table names (sidebar, browse cards, tabs, diagram, breadcrumbs, FK links),
 * column names (data grid headers, table-definition rows, SQL result headers),
 * and cell values in the main grid (mobile-friendly when the hover copy chip is awkward).
 *
 * Uses a short hold delay and cancels on movement or finger lift so scrolling and taps
 * stay natural. Suppresses the synthetic click after a successful hold to avoid
 * accidental navigation (e.g. opening a table tab again).
 */
import { copyCellValue } from './table-view.ts';

/** Hold duration: long enough to avoid accidental copies, short enough to feel responsive. */
const HOLD_MS = 520;
/** Cancel the hold if the finger moves farther than this (px) from the start point. */
const MOVE_MAX_PX = 14;

let listenersInstalled = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let startX = 0;
let startY = 0;
let touchStartEl: Element | null = null;
let activeTouchId: number | null = null;

function clearHold(): void {
  if (holdTimer != null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

/**
 * Skips long-press when the touch began on a real text field (not QB checkboxes).
 */
function inBlockingFormField(el: Element | null): boolean {
  if (!el) return true;
  if (el.closest('textarea, select')) return true;
  var inp = el.closest('input');
  if (inp instanceof HTMLInputElement) {
    var t = (inp.type || 'text').toLowerCase();
    if (t !== 'checkbox' && t !== 'radio') return true;
  }
  return false;
}

/**
 * Returns the string to copy for a long-press starting on `target`, or null if none.
 * Order matters: more specific selectors before generic ones (e.g. pin button before table link).
 */
export function resolveLongPressCopyText(target: Element | null): string | null {
  if (!target) return null;

  var explicit = target.closest('[data-longpress-copy]');
  if (explicit) {
    var v = explicit.getAttribute('data-longpress-copy');
    return v != null && v !== '' ? v : null;
  }

  if (target.closest('.table-pin-btn, .tab-btn-close, .cell-inline-editor')) return null;

  var fk = target.closest('.fk-link[data-table][data-column]');
  if (fk) {
    var dt = fk.getAttribute('data-table');
    var dc = fk.getAttribute('data-column');
    if (dt && dc) return dt + '.' + dc;
  }

  var th = target.closest('.drift-table th[data-column-key]');
  if (th) {
    var key = th.getAttribute('data-column-key');
    return key != null && key !== '' ? key : null;
  }

  var td = target.closest('.drift-table td[data-column-key]');
  if (td) {
    var btn = td.querySelector('.cell-copy-btn');
    var raw = btn && btn.getAttribute('data-raw');
    if (raw != null) return raw;
    var txt = (td.textContent || '').trim();
    return txt || td.getAttribute('data-column-key');
  }

  var defName = target.closest('.table-def-name');
  if (defName) {
    var n = (defName.textContent || '').trim();
    return n || null;
  }

  var tableLink = target.closest('a.table-link[data-table]');
  if (tableLink && !target.closest('.table-pin-btn')) {
    var tn = tableLink.getAttribute('data-table');
    return tn != null && tn !== '' ? tn : null;
  }

  var browse = target.closest('.tables-browse-card[data-table]');
  if (browse) {
    var b = browse.getAttribute('data-table');
    return b != null && b !== '' ? b : null;
  }

  var diagram = target.closest('.diagram-table[data-table]');
  if (diagram) {
    var d = diagram.getAttribute('data-table');
    return d != null && d !== '' ? d : null;
  }

  var sizeLink = target.closest('a.size-table-link[data-table]');
  if (sizeLink) {
    var s = sizeLink.getAttribute('data-table');
    return s != null && s !== '' ? s : null;
  }

  var sqlTh = target.closest('th[data-column-key]');
  if (sqlTh) {
    var sk = sqlTh.getAttribute('data-column-key');
    return sk != null && sk !== '' ? sk : null;
  }

  var tabBtn = target.closest('.tab-btn[data-tab]');
  if (tabBtn) {
    var tid = tabBtn.getAttribute('data-tab') || '';
    if (tid.indexOf('tbl:') === 0) return tid.slice(4);
  }

  var qbLabel = target.closest('#qb-columns label');
  if (qbLabel) {
    var cbin = qbLabel.querySelector('input[type="checkbox"][value]');
    if (cbin) {
      var val = cbin.getAttribute('value');
      return val != null && val !== '' ? val : null;
    }
  }

  return null;
}

/**
 * Prevents the click that follows touchend from activating links/buttons after a copy.
 */
function armClickSuppression(): void {
  function onClickCap(e: Event): void {
    document.removeEventListener('click', onClickCap, true);
    e.preventDefault();
    e.stopPropagation();
  }
  setTimeout(function() {
    document.addEventListener('click', onClickCap, true);
  }, 0);
  setTimeout(function() {
    document.removeEventListener('click', onClickCap, true);
  }, 500);
}

/**
 * Registers global touch listeners (capture phase, passive) once per page load.
 */
export function initLongPressCopy(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  document.addEventListener(
    'touchstart',
    function (e: TouchEvent) {
      if (e.touches.length > 1) {
        clearHold();
        activeTouchId = null;
        touchStartEl = null;
        return;
      }
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      var rawTarget = e.target;
      var el = rawTarget instanceof Element ? rawTarget : document.elementFromPoint(t.clientX, t.clientY);
      if (!el || inBlockingFormField(el)) return;

      var preview = resolveLongPressCopyText(el);
      if (!preview) return;

      clearHold();
      activeTouchId = t.identifier;
      startX = t.clientX;
      startY = t.clientY;
      touchStartEl = el;

      holdTimer = setTimeout(function () {
        holdTimer = null;
        var toCopy = touchStartEl ? resolveLongPressCopyText(touchStartEl) : null;
        if (!toCopy) return;
        copyCellValue(toCopy);
        if (navigator.vibrate) {
          try {
            navigator.vibrate(12);
          } catch {
            /* optional haptics */
          }
        }
        armClickSuppression();
      }, HOLD_MS);
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    'touchmove',
    function (e: TouchEvent) {
      if (holdTimer == null || activeTouchId == null) return;
      if (e.touches.length > 1) {
        clearHold();
        activeTouchId = null;
        touchStartEl = null;
        return;
      }
      for (var i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouchId) {
          var t = e.touches[i];
          var dx = t.clientX - startX;
          var dy = t.clientY - startY;
          if (dx * dx + dy * dy > MOVE_MAX_PX * MOVE_MAX_PX) {
            clearHold();
            activeTouchId = null;
            touchStartEl = null;
          }
          return;
        }
      }
    },
    { passive: true, capture: true }
  );

  function endTouch(e: TouchEvent): void {
    if (activeTouchId == null) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) {
        clearHold();
        activeTouchId = null;
        touchStartEl = null;
        return;
      }
    }
  }

  document.addEventListener('touchend', endTouch, { passive: true, capture: true });
  document.addEventListener('touchcancel', endTouch, { passive: true, capture: true });
}
