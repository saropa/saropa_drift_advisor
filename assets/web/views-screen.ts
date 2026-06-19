/**
 * Views screen: lists the database's views and, for the selected view, shows its
 * CREATE VIEW definition plus a sample of its output.
 *
 * WHY a dedicated screen: views are not editable tables, and tools like PowerSync
 * expose the user's real data model entirely through views (JSON-backed storage
 * fronted by SELECT views). The definition comes from GET /api/views ({name, sql}
 * straight out of sqlite_master); the output is a capped SELECT run through the
 * normal read-only /api/sql path, so it honors the same validation and timing as
 * the SQL runner. See GitHub issue #32.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { esc, highlightSqlSafe } from './utils.ts';

/** Max rows fetched for a view's output preview — enough to be useful, capped so
 *  a huge view can't flood the panel or stall the connection. */
const VIEW_OUTPUT_LIMIT = 200;

interface ViewDef {
  name: string;
  sql: string;
}

/** Loaded once per page open; re-selecting a view reuses the cached definition. */
let viewsCache: ViewDef[] | null = null;
let selectedView: string | null = null;
/** Guards against a slow output fetch rendering after the user picks another view. */
let outputRequestToken = 0;

/** Quotes a SQLite identifier, doubling embedded double-quotes (mirrors the
 *  server-side quoteIdent) so a view name with quotes or spaces stays valid. */
function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

function listEl(): HTMLElement | null { return document.getElementById('views-list'); }

/** Renders the left-hand list of view names. */
function renderList(views: ViewDef[]): void {
  const el = listEl();
  if (!el) return;
  if (views.length === 0) {
    el.innerHTML = '<p class="meta">' + esc(vt('viewer.views.empty')) + '</p>';
    return;
  }
  const countKey = views.length === 1 ? 'viewer.views.countOne' : 'viewer.views.count';
  let html = '<div class="views-list-count meta">' + esc(vt(countKey, views.length)) + '</div>';
  views.forEach(function (v) {
    const active = v.name === selectedView ? ' active' : '';
    html +=
      '<button type="button" class="views-list-item' + active + '" role="listitem" data-view="' +
      esc(v.name) + '">' + esc(v.name) + '</button>';
  });
  el.innerHTML = html;
  el.querySelectorAll('.views-list-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const name = (btn as HTMLElement).getAttribute('data-view');
      if (name) selectView(name);
    });
  });
}

/** Builds a `.drift-table` from object-rows, reusing the shared grid styling so
 *  the output matches the Tables and SQL-result grids. */
function renderOutputTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return '<p class="meta">' + esc(vt('viewer.views.outputEmpty')) + '</p>';
  }
  const keys = Object.keys(rows[0]);
  let html =
    '<div class="data-table-scroll-wrap"><table class="drift-table"><thead><tr>' +
    keys.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') +
    '</tr></thead><tbody>';
  rows.forEach(function (row) {
    html +=
      '<tr>' +
      keys.map(function (k) {
        // null/undefined render as an empty cell, never the literal "undefined".
        return '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>';
      }).join('') +
      '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

/** Selects a view: shows its definition immediately, then loads its output. */
function selectView(name: string): void {
  selectedView = name;
  const views = viewsCache || [];
  const def = views.find(function (v) { return v.name === name; });

  // Reflect the active item in the list without a full re-render.
  const el = listEl();
  if (el) {
    el.querySelectorAll('.views-list-item').forEach(function (btn) {
      btn.classList.toggle('active', (btn as HTMLElement).getAttribute('data-view') === name);
    });
  }

  const hint = document.getElementById('views-empty-hint');
  const body = document.getElementById('views-detail-body');
  const nameEl = document.getElementById('views-detail-name');
  const sqlEl = document.getElementById('views-detail-sql');
  const outEl = document.getElementById('views-detail-output');
  const outMeta = document.getElementById('views-output-meta');
  if (hint) hint.style.display = 'none';
  if (body) body.style.display = '';
  if (nameEl) nameEl.textContent = name;

  // Definition: highlight the stored DDL, or say there is none.
  if (sqlEl) {
    const sql = def && def.sql ? def.sql : '';
    sqlEl.innerHTML = sql
      ? highlightSqlSafe(sql)
      : '<span class="meta">' + esc(vt('viewer.views.noDefinition')) + '</span>';
  }

  // Output: run a capped SELECT through the read-only SQL endpoint.
  if (outMeta) outMeta.textContent = '';
  if (outEl) outEl.innerHTML = '<p class="meta">' + esc(vt('viewer.views.loading')) + '</p>';
  const token = ++outputRequestToken;
  const sql = 'SELECT * FROM ' + quoteIdent(name) + ' LIMIT ' + VIEW_OUTPUT_LIMIT;
  fetch('/api/sql', S.authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: sql }),
  }))
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
    .then(function (res) {
      // A newer selection superseded this request — drop the stale response.
      if (token !== outputRequestToken) return;
      if (!outEl) return;
      if (!res.ok || (res.data && res.data.error)) {
        outEl.innerHTML =
          '<p class="meta">' + esc(vt('viewer.views.outputError')) + '</p>' +
          (res.data && res.data.error ? '<pre class="meta">' + esc(String(res.data.error)) + '</pre>' : '');
        return;
      }
      const rows = (res.data && res.data.rows) || [];
      if (outMeta && rows.length >= VIEW_OUTPUT_LIMIT) {
        outMeta.textContent = '(' + vt('viewer.views.outputLimited', VIEW_OUTPUT_LIMIT) + ')';
      }
      outEl.innerHTML = renderOutputTable(rows);
    })
    .catch(function () {
      if (token !== outputRequestToken) return;
      if (outEl) outEl.innerHTML = '<p class="meta">' + esc(vt('viewer.views.outputError')) + '</p>';
    });
}

/** Fetches the view list once and renders it. Re-entrant: a second call after a
 *  successful load is a no-op so re-opening the tab doesn't re-fetch. */
export function ensureViewsLoaded(): void {
  if (viewsCache !== null) return;
  const el = listEl();
  if (el) el.innerHTML = '<p class="meta">' + esc(vt('viewer.views.loading')) + '</p>';
  fetch('/api/views', S.authOpts())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const views: ViewDef[] = Array.isArray(data && data.views) ? data.views : [];
      viewsCache = views;
      renderList(views);
    })
    .catch(function () {
      // Leave the cache null so a later tab activation retries.
      const e = listEl();
      if (e) e.innerHTML = '<p class="meta">' + esc(vt('viewer.views.loadError')) + '</p>';
    });
}

/** Resets cached state so the next activation re-fetches (e.g. after the schema
 *  changes). Exposed for symmetry with other screens; safe to call anytime. */
export function resetViewsScreen(): void {
  viewsCache = null;
  selectedView = null;
}

/** Wires the Views screen. The list loads lazily on first tab activation
 *  (see onTabSwitch in app.js), so init only needs to exist for the bundle. */
export function initViewsScreen(): void {
  // No eager DOM wiring required: list items are bound on render, and the tab
  // switch triggers ensureViewsLoaded(). Kept as an explicit init for parity
  // with the other screen modules and a future hook point.
}
