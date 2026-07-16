/**
 * Heartbeat "statement tap" flyout (Feature 80): a per-card popover listing
 * the last captured host statements for one table, turning the heartbeat
 * screen into a live query inspector. Data comes from
 * GET /api/activity/statements?table=X — a bounded, truncated per-table ring
 * the server fills only while capture is armed.
 *
 * One singleton flyout element serves every card (built lazily on first
 * open): only one table can be inspected at a time, so per-card DOM would be
 * waste. Fetches fresh on every open — the ring is tiny and the user's tap
 * IS the refresh gesture; no polling while open.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { esc } from './utils.ts';

let flyout: HTMLElement | null = null;
let openFor: string | null = null;

/** Human relative age for a statement timestamp. Coarse on purpose — the
 *  ring only holds moments-old entries; second precision is enough. */
function relativeAge(iso: string): string {
  const ms = Date.parse(iso);
  if (isNaN(ms)) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 2) return vt('viewer.heartbeat.statements.justNow');
  if (s < 60) return vt('viewer.heartbeat.statements.secondsAgo', s);
  return vt('viewer.heartbeat.statements.minutesAgo', Math.round(s / 60));
}

function buildFlyout(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'hb-stmt-flyout';
  el.className = 'hb-stmt-flyout';
  el.setAttribute('role', 'dialog');
  el.hidden = true;
  el.innerHTML =
    '<div class="hb-stmt-head">' +
    '<span class="hb-stmt-title" id="hb-stmt-title"></span>' +
    '<button type="button" class="hb-stmt-close" id="hb-stmt-close" aria-label="' +
    esc(vt('viewer.heartbeat.statements.close')) + '">' +
    '<span class="material-symbols-outlined" aria-hidden="true">close</span></button>' +
    '</div>' +
    '<div class="hb-stmt-body" id="hb-stmt-body"></div>';
  document.body.appendChild(el);
  const close = el.querySelector('#hb-stmt-close');
  if (close) close.addEventListener('click', closeStatementFlyout);
  // Outside click / ESC / tab switch all dismiss — a stale flyout floating
  // over a different screen would be worse than no flyout.
  document.addEventListener('click', function (e) {
    if (!openFor || !flyout) return;
    const t = e.target as Node;
    if (!flyout.contains(t)) closeStatementFlyout();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeStatementFlyout();
  });
  document.addEventListener('sda-tab-switch', closeStatementFlyout);
  return el;
}

export function closeStatementFlyout(): void {
  openFor = null;
  if (flyout) flyout.hidden = true;
}

/** Positions the flyout under the anchor card, clamped inside the viewport
 *  (fixed positioning so grid scroll/resort while open cannot strand it). */
function place(anchor: HTMLElement): void {
  if (!flyout) return;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(420, window.innerWidth - 16);
  flyout.style.width = w + 'px';
  flyout.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  // Below the card when it fits, above otherwise.
  const h = Math.min(320, window.innerHeight * 0.6);
  flyout.style.maxHeight = h + 'px';
  const below = r.bottom + 6;
  flyout.style.top = (below + h <= window.innerHeight ? below : Math.max(8, r.top - h - 6)) + 'px';
}

function renderList(statements: Array<{ sql: string; kind: string; at: string }>, armed: boolean): void {
  const body = flyout && flyout.querySelector('#hb-stmt-body');
  if (!body) return;
  if (!statements.length) {
    // Honesty: an empty ring means either nothing ran, capture is off, or
    // the host never wired reportActivity — the hint names the actionable one.
    body.innerHTML =
      '<p class="meta hb-stmt-empty">' +
      esc(vt(armed ? 'viewer.heartbeat.statements.empty' : 'viewer.heartbeat.statements.disarmed')) +
      '</p>';
    return;
  }
  body.innerHTML = statements.map(function (s) {
    const kindClass = s.kind === 'write' ? 'hb-dot--write' : 'hb-dot--read';
    return (
      '<div class="hb-stmt-row">' +
      '<span class="hb-dot ' + kindClass + '" aria-hidden="true"></span>' +
      '<code class="hb-stmt-sql">' + esc(s.sql) + '</code>' +
      '<span class="hb-stmt-age meta">' + esc(relativeAge(s.at)) + '</span>' +
      '</div>'
    );
  }).join('');
}

/** Opens (or re-anchors) the flyout for one table and fetches its ring. */
export function openStatementFlyout(table: string, anchor: HTMLElement): void {
  if (!flyout) flyout = buildFlyout();
  // Toggle behavior: tapping the same card's button again closes.
  if (openFor === table && !flyout.hidden) { closeStatementFlyout(); return; }
  openFor = table;
  const title = flyout.querySelector('#hb-stmt-title');
  if (title) title.textContent = vt('viewer.heartbeat.statements.title', table);
  const body = flyout.querySelector('#hb-stmt-body');
  if (body) body.innerHTML = '<p class="meta hb-stmt-empty">' + esc(vt('viewer.heartbeat.statements.fetching')) + '</p>';
  flyout.hidden = false;
  place(anchor);
  fetch('/api/activity/statements?table=' + encodeURIComponent(table), S.authOpts())
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      // The user may have closed or switched tables while the fetch ran.
      if (openFor !== table) return;
      if (!res.ok) throw new Error('statements HTTP error');
      const list = Array.isArray(res.data && res.data.statements) ? res.data.statements : [];
      renderList(list, !!(res.data && res.data.captureArmed));
    })
    .catch(function () {
      if (openFor !== table) return;
      const b = flyout && flyout.querySelector('#hb-stmt-body');
      if (b) b.innerHTML = '<p class="meta hb-stmt-empty">' + esc(vt('viewer.heartbeat.statements.error')) + '</p>';
    });
}
