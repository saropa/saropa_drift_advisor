/**
 * Sidebar resize bar — drag #app-sidebar-resizer to set the sidebar width.
 *
 * The single left sidebar (#app-sidebar) takes its width from the CSS custom
 * property `--app-sidebar-width` set on #app-layout (see _layout.scss). This
 * module owns that property: it restores the persisted width, then lets the
 * user drag the bar to resize. Dragging the bar all the way in hides the
 * sidebar (collapsed state, owned by sidebar-panels.ts); the bar itself stays
 * in the layout — widened — so a hidden sidebar can always be pulled back open.
 *
 * Two facts are stored separately on purpose: the EXPANDED width (here, one
 * number) and whether the sidebar is currently hidden (the collapsed flag in
 * sidebar-panels.ts). Keeping them apart means hiding then showing the sidebar
 * returns it to the same width the user last chose.
 */
import * as S from './state.ts';
import { setSidebarCollapsed, isSidebarCollapsed } from './sidebar-panels.ts';

// Below MIN the sidebar content gets too cramped to read, so a release under
// COLLAPSE_SNAP is treated as "hide" rather than "very narrow".
const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 180;
const COLLAPSE_SNAP = 120;
const KEY_STEP = 24; // px moved per Arrow keypress

let layout: HTMLElement | null = null;
let resizer: HTMLElement | null = null;

// The user's chosen EXPANDED width. Persisted; restored on load. The collapsed
// state never overwrites this, so showing the sidebar again reuses it.
let expandedWidth = DEFAULT_WIDTH;

// Drag bookkeeping (only meaningful while a pointer drag is active).
let dragging = false;
let startX = 0;
let startWidth = 0;

/** Upper bound: never let the sidebar eat more than ~60% of the viewport. */
function maxWidth(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return Math.min(640, Math.round(vw * 0.6));
}

/** Writes a live width to the CSS var without persisting. */
function applyVar(px: number): void {
  if (layout) layout.style.setProperty('--app-sidebar-width', px + 'px');
}

function persist(px: number): void {
  try {
    localStorage.setItem(S.APP_SIDEBAR_WIDTH_KEY, String(px));
  } catch (e) {
    /* localStorage unavailable (private mode / restricted webview) */
  }
}

/**
 * Commits a new expanded width: clamps it, stores it, applies it, and ensures
 * the sidebar is shown. Used by the keyboard path and the end of a drag.
 */
function setExpandedWidth(px: number): void {
  expandedWidth = Math.max(MIN_WIDTH, Math.min(maxWidth(), Math.round(px)));
  applyVar(expandedWidth);
  persist(expandedWidth);
  setSidebarCollapsed(false);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging) return;
  // Live width follows the pointer 1:1; allow it down to 0 for visual feedback
  // even though a release below COLLAPSE_SNAP will snap to hidden.
  let w = startWidth + (e.clientX - startX);
  w = Math.max(0, Math.min(maxWidth(), w));
  applyVar(w);
  e.preventDefault();
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  if (layout) layout.classList.remove('app-sidebar-resizing');
  try { resizer?.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }

  const w = startWidth + (e.clientX - startX);
  // Dragged (nearly) shut → hide, but keep the prior expanded width for restore.
  if (w < COLLAPSE_SNAP) {
    applyVar(expandedWidth);
    setSidebarCollapsed(true);
    return;
  }
  setExpandedWidth(w);
}

function onPointerDown(e: PointerEvent): void {
  if (!layout || !resizer) return;
  // Only the primary (usually left) button drives a resize.
  if (e.button !== 0) return;
  dragging = true;
  startX = e.clientX;
  // Start from the current effective width: 0 when hidden so the bar grows out
  // from nothing, otherwise the live expanded width.
  startWidth = isSidebarCollapsed() ? 0 : expandedWidth;
  // Pin the var to the start width and drop the collapsed class up front so the
  // sidebar tracks the pointer from frame one instead of snapping open.
  applyVar(startWidth);
  if (isSidebarCollapsed()) setSidebarCollapsed(false);
  layout.classList.add('app-sidebar-resizing');
  try { resizer.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
  e.preventDefault();
}

function onKeyDown(e: KeyboardEvent): void {
  // Keyboard resize for the role="separator" handle (WCAG 2.1.1).
  const collapsed = isSidebarCollapsed();
  switch (e.key) {
    case 'ArrowLeft': {
      const next = (collapsed ? 0 : expandedWidth) - KEY_STEP;
      if (next < COLLAPSE_SNAP) {
        applyVar(expandedWidth);
        setSidebarCollapsed(true);
      } else {
        setExpandedWidth(next);
      }
      e.preventDefault();
      break;
    }
    case 'ArrowRight': {
      setExpandedWidth((collapsed ? 0 : expandedWidth) + KEY_STEP);
      e.preventDefault();
      break;
    }
    case 'Enter':
    case ' ': {
      // Toggle hidden/shown; showing restores the last expanded width.
      if (collapsed) {
        applyVar(expandedWidth);
        setSidebarCollapsed(false);
      } else {
        setSidebarCollapsed(true);
      }
      e.preventDefault();
      break;
    }
    default:
      break;
  }
}

/** Restores the persisted width and wires the drag/keyboard handlers. */
export function initSidebarResize(): void {
  layout = document.getElementById('app-layout');
  resizer = document.getElementById('app-sidebar-resizer');
  if (!layout || !resizer) return;

  // Restore the stored expanded width; fall back to the default if absent or
  // malformed. Clamp so an old/oversized value can't push the sidebar off-screen.
  let stored = NaN;
  try {
    const raw = localStorage.getItem(S.APP_SIDEBAR_WIDTH_KEY);
    if (raw) stored = parseInt(raw, 10);
  } catch (e) {
    /* localStorage unavailable — keep default */
  }
  expandedWidth = Number.isFinite(stored)
    ? Math.max(MIN_WIDTH, Math.min(maxWidth(), stored))
    : DEFAULT_WIDTH;
  applyVar(expandedWidth);

  resizer.addEventListener('pointerdown', onPointerDown);
  // Listen on window so a fast drag that outruns the thin bar still tracks.
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  resizer.addEventListener('keydown', onKeyDown);
}
