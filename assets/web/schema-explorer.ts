/**
 * Structured Schema explorer (Schema tab).
 *
 * Replaces the raw-DDL-only Schema view with a searchable, metadata-rich view:
 * one card per table showing columns (type / PK / FK / NOT NULL badges), row +
 * column + index counts, declared and incoming relationships, and detector
 * badges (orphan table, data-quality anomalies, foreign-key columns missing an
 * index, live write activity). The raw formatted DDL is still available in a
 * collapsible at the bottom (rendered by loadSchemaIntoPre).
 *
 * Data sources, all already exposed by the debug server — this module adds NO
 * server endpoints:
 *   /api/schema/metadata?includeForeignKeys=1  columns, types, PK/NOT NULL,
 *                                              per-table rowCount, FK edges
 *   /api/analytics/size                         per-table columnCount + indexes
 *   /api/analytics/anomalies                    data-quality findings
 *   /api/analytics/orphan-tables                tables absent from Drift code
 *   /api/index-suggestions                      FK columns lacking an index
 *   /api/mutations (long-poll)                  live per-table write tally
 *
 * Every detector fetch is best-effort (some require writeQuery / declaredSchema
 * on the host); a failing one degrades to "no badge", never blanks the view.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { esc } from './utils.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import { loadSchemaIntoPre } from './schema.ts';
import { formatSqlSafe } from './sql-format.ts';
import { highlightText } from './search.ts';
import { showCopyToast, formatTableDefBytes } from './table-view.ts';
import { tableFks, collectTypes, buildIncomingFkMap, tableMatches, buildSchemaMarkdown } from './schema-explorer-logic.ts';

// Severity → color, matching the palette already used by the analytics tools
// (tools-analytics.ts) so anomaly badges read the same everywhere.
const SEVERITY_COLORS: Record<string, string> = {
  error: '#e57373',
  warning: '#ffb74d',
  info: '#7cb342',
};

// --- Module state ---------------------------------------------------------
// Detector results, keyed by table name, merged into the metadata at render
// time. Reset on each (re)load so a stale detector result can't outlive its
// schema.
let inited = false;
let sizeByTable: Record<string, { columnCount: number; indexes: string[] }> = {};
let anomaliesByTable: Record<string, any[]> = {};
let orphanSet: Set<string> = new Set();
let missingIndexByTable: Record<string, string[]> = {};
let totalSizeBytes: number | null = null;

// Live write activity, accumulated from the /api/mutations long-poll for as
// long as the Schema tab stays open. The endpoint only exists when the host
// configured writeQuery, so a 501/offline simply stops the poll.
const mutationCountByTable: Record<string, number> = {};
let mutationCursor = 0;
let mutationPolling = false;
let pendingMutationRender = false;

/** Reads the search box, trimmed. Empty when the box is absent. */
function getFilterTerm(): string {
  const el = document.getElementById('schema-explorer-search') as HTMLInputElement | null;
  return el ? String(el.value || '').trim() : '';
}

/** Reads the selected column-type filter (uppercase base type), or '' for all. */
function getTypeFilter(): string {
  const el = document.getElementById('schema-explorer-type') as HTMLSelectElement | null;
  return el ? String(el.value || '') : '';
}

// --- Rendering ------------------------------------------------------------

/** One inline stat chip: "12 rows", "3 indexes", etc. */
function statChip(text: string): string {
  return '<span class="schema-chip">' + esc(text) + '</span>';
}

/** Builds the detector badges shown in a table card header. */
function detectorBadges(name: string): string {
  let html = '';
  if (orphanSet.has(name)) {
    html += '<span class="schema-badge schema-badge-orphan" title="' +
      esc(vt('viewer.schema.explorer.badge.orphanTitle')) + '">' +
      esc(vt('viewer.schema.explorer.badge.orphan')) + '</span>';
  }
  const anomalies = anomaliesByTable[name] || [];
  if (anomalies.length) {
    // Worst severity drives the badge color so a single error stands out.
    const worst = anomalies.some(function (a) { return a.severity === 'error'; })
      ? 'error'
      : anomalies.some(function (a) { return a.severity === 'warning'; }) ? 'warning' : 'info';
    html += '<span class="schema-badge" style="color:' + SEVERITY_COLORS[worst] + ';border-color:' + SEVERITY_COLORS[worst] + ';" title="' +
      esc(vt('viewer.schema.explorer.badge.anomalyTitle')) + '">' +
      esc(vt('viewer.schema.explorer.badge.anomaly', anomalies.length)) + '</span>';
  }
  const missing = missingIndexByTable[name] || [];
  if (missing.length) {
    html += '<span class="schema-badge schema-badge-warn" title="' +
      esc(vt('viewer.schema.explorer.badge.missingIndexTitle')) + '">' +
      esc(vt('viewer.schema.explorer.badge.missingIndex', missing.length)) + '</span>';
  }
  if ((mutationCountByTable[name] || 0) > 0) {
    html += '<span class="schema-badge schema-badge-active" title="' +
      esc(vt('viewer.schema.explorer.badge.activeTitle')) + '">' +
      esc(vt('viewer.schema.explorer.badge.active')) + '</span>';
  }
  return html;
}

/** Builds the column rows for a table card, highlighting search matches. */
function columnRows(table: any, term: string): string {
  const fkByCol: Record<string, { toTable: string; toColumn: string }> = {};
  tableFks(table).forEach(function (fk) { fkByCol[fk.fromColumn] = { toTable: fk.toTable, toColumn: fk.toColumn }; });
  const missingSet: Record<string, true> = {};
  (missingIndexByTable[table.name] || []).forEach(function (c) { missingSet[c] = true; });

  return (table.columns || []).map(function (c: any) {
    const rawType = c.type != null ? String(c.type).trim() : '';
    let badges = '';
    if (c.pk) {
      badges += '<span class="table-def-badge table-def-badge-pk" title="' +
        esc(vt('viewer.schema.explorer.badgePkTitle')) + '">🔑</span>';
    }
    if (fkByCol[c.name]) {
      badges += '<span class="table-def-badge table-def-badge-fk" title="' +
        esc(vt('viewer.schema.explorer.badgeFkTitle', fkByCol[c.name].toTable, fkByCol[c.name].toColumn)) +
        '">🔗</span>';
    }
    if (missingSet[c.name]) {
      badges += '<span class="table-def-badge schema-badge-warn-icon" title="' +
        esc(vt('viewer.schema.explorer.badge.missingIndexTitle')) + '">⚠</span>';
    }
    const flags = c.notnull ? vt('viewer.schema.explorer.flag.notNull') : vt('viewer.schema.explorer.flag.none');
    const typeCell = rawType
      ? esc(rawType)
      : '<span class="table-def-type-empty">' + esc(vt('viewer.schema.explorer.flag.none')) + '</span>';
    // Highlight column-name matches; highlightText HTML-escapes its input.
    const nameCell = term ? highlightText(String(c.name), term) : esc(c.name);
    return '<tr>' +
      '<td class="table-def-icons">' + badges + '</td>' +
      '<td class="table-def-name">' + nameCell + '</td>' +
      '<td class="table-def-type">' + typeCell + '</td>' +
      '<td class="table-def-flags">' + esc(flags) + '</td>' +
      '</tr>';
  }).join('');
}

/** Builds the relationships block (outgoing + incoming FK lines). */
function relationshipsBlock(table: any, incoming: Array<{ fromTable: string; fromColumn: string }>): string {
  const out = tableFks(table);
  if (!out.length && !incoming.length) return '';
  let lines = '';
  out.forEach(function (fk) {
    lines += '<li class="schema-rel-out"><code>' + esc(fk.fromColumn) + '</code> ' +
      esc(vt('viewer.schema.explorer.fkRefersTo', fk.toTable, fk.toColumn)) + '</li>';
  });
  incoming.forEach(function (e) {
    lines += '<li class="schema-rel-in">' +
      esc(vt('viewer.schema.explorer.fkReferencedBy', e.fromTable, e.fromColumn)) + '</li>';
  });
  return '<div class="schema-rel"><div class="schema-subhead">' +
    esc(vt('viewer.schema.explorer.relationships')) + '</div><ul class="schema-rel-list">' + lines + '</ul></div>';
}

/** Builds the anomaly detail block for a table when findings exist. */
function anomalyBlock(name: string): string {
  const list = anomaliesByTable[name] || [];
  if (!list.length) return '';
  const items = list.map(function (a) {
    const sev = a.severity || 'info';
    const dot = '<span class="schema-anom-dot" style="background:' + (SEVERITY_COLORS[sev] || SEVERITY_COLORS.info) + ';"></span>';
    const col = a.column ? '<code>' + esc(a.column) + '</code> ' : '';
    return '<li>' + dot + col + esc(a.message || '') + '</li>';
  }).join('');
  return '<div class="schema-anom"><div class="schema-subhead">' +
    esc(vt('viewer.schema.explorer.anomalyHeading')) + '</div><ul class="schema-anom-list">' + items + '</ul></div>';
}

/** Builds one table card. */
function tableCard(table: any, term: string, incoming: Array<{ fromTable: string; fromColumn: string }>): string {
  const name = table.name;
  const size = sizeByTable[name];
  const indexes = (size && size.indexes) || [];
  const colCount = (size && size.columnCount) || (table.columns ? table.columns.length : 0);
  const rowCount = typeof table.rowCount === 'number' ? table.rowCount : 0;
  const fkOut = tableFks(table).length;

  let chips = statChip(vt('viewer.schema.explorer.stat.rows', rowCount.toLocaleString('en-US')));
  chips += statChip(vt('viewer.schema.explorer.stat.cols', colCount));
  chips += statChip(vt('viewer.schema.explorer.stat.indexes', indexes.length));
  if (fkOut) chips += statChip(vt('viewer.schema.explorer.stat.fkOut', fkOut));
  if (incoming.length) chips += statChip(vt('viewer.schema.explorer.stat.fkIn', incoming.length));
  if ((mutationCountByTable[name] || 0) > 0) {
    chips += statChip(vt('viewer.schema.explorer.stat.writes', mutationCountByTable[name]));
  }

  const nameHtml = term ? highlightText(String(name), term) : esc(name);

  const indexBlock = indexes.length
    ? '<div class="schema-idx"><div class="schema-subhead">' + esc(vt('viewer.schema.explorer.indexes')) +
      '</div><div class="schema-idx-names">' + indexes.map(function (i) { return '<code>' + esc(i) + '</code>'; }).join(' ') + '</div></div>'
    : '';

  return '<section class="schema-card" data-table="' + esc(name) + '">' +
    '<header class="schema-card-head">' +
    '<span class="schema-card-name">' + nameHtml + '</span>' +
    '<span class="schema-card-badges">' + detectorBadges(name) + '</span>' +
    '</header>' +
    '<div class="schema-card-chips">' + chips + '</div>' +
    '<div class="schema-card-cols"><table class="table-definition"><thead><tr>' +
    '<th class="table-def-icons" scope="col"></th>' +
    '<th scope="col">' + esc(vt('viewer.schema.explorer.col.column')) + '</th>' +
    '<th scope="col">' + esc(vt('viewer.schema.explorer.col.type')) + '</th>' +
    '<th scope="col">' + esc(vt('viewer.schema.explorer.col.constraints')) + '</th>' +
    '</tr></thead><tbody>' + columnRows(table, term) + '</tbody></table></div>' +
    relationshipsBlock(table, incoming) +
    indexBlock +
    anomalyBlock(name) +
    '</section>';
}

/** Populates the type-filter dropdown, preserving the current selection. */
function populateTypeFilter(meta: any): void {
  const sel = document.getElementById('schema-explorer-type') as HTMLSelectElement | null;
  if (!sel) return;
  const current = sel.value;
  const types = collectTypes(meta);
  let html = '<option value="">' + esc(vt('viewer.schema.explorer.typeAll')) + '</option>';
  types.forEach(function (t) { html += '<option value="' + esc(t) + '">' + esc(t) + '</option>'; });
  sel.innerHTML = html;
  // Restore the previous choice if it still exists in the new schema.
  if (current && types.indexOf(current) >= 0) sel.value = current;
}

/** Renders the summary line + all matching table cards into the body. */
function render(): void {
  const body = document.getElementById('schema-explorer-body');
  const summaryEl = document.getElementById('schema-explorer-summary');
  if (!body) return;
  const meta = S.schemaMeta;
  const tables = (meta && meta.tables) || [];
  if (!tables.length) {
    body.innerHTML = '<p class="meta">' + esc(vt('viewer.schema.explorer.empty')) + '</p>';
    if (summaryEl) summaryEl.textContent = '';
    return;
  }

  const term = getFilterTerm();
  const type = getTypeFilter();
  const incomingMap = buildIncomingFkMap(meta);
  const shown = tables.filter(function (t: any) { return tableMatches(t, term, type); });

  // Summary header: how many tables are visible, total rows across the whole
  // schema (not just the filtered subset), and DB size when known.
  let totalRows = 0;
  tables.forEach(function (t: any) { if (typeof t.rowCount === 'number') totalRows += t.rowCount; });
  if (summaryEl) {
    const rowsStr = totalRows.toLocaleString('en-US');
    summaryEl.textContent = totalSizeBytes != null
      ? vt('viewer.schema.explorer.summary', shown.length, tables.length, rowsStr, formatTableDefBytes(totalSizeBytes))
      : vt('viewer.schema.explorer.summaryNoSize', shown.length, tables.length, rowsStr);
  }

  if (!shown.length) {
    body.innerHTML = '<p class="meta">' + esc(vt('viewer.schema.explorer.noMatches')) + '</p>';
    return;
  }
  body.innerHTML = shown.map(function (t: any) {
    return tableCard(t, term, incomingMap[t.name] || []);
  }).join('');
}

// --- Schema-level copy/export --------------------------------------------

/** Copies text via the clipboard API, with a confirming or failing toast. */
function copyText(text: string): void {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function () { showCopyToast(vt('viewer.schema.explorer.copied')); })
      .catch(function () { showCopyToast(vt('viewer.schema.explorer.copyFailed')); });
  }
}

/** Wires the three schema-level copy buttons in the toolbar. */
function handleCopyClick(action: string): void {
  if (action === 'sql') {
    // The full formatted DDL — the same single code path the raw view uses.
    copyText(formatSqlSafe(S.cachedSchema || ''));
  } else if (action === 'markdown') {
    copyText(buildSchemaMarkdown(S.schemaMeta));
  } else if (action === 'json') {
    copyText(JSON.stringify((S.schemaMeta && S.schemaMeta.tables) || [], null, 2));
  }
}

// --- Live write activity (mutation long-poll) -----------------------------

/**
 * Re-renders at most once per second so a burst of writes doesn't thrash the
 * DOM (and doesn't fight the user scrolling). The toolbar (search/type inputs)
 * is never re-rendered, so input focus is preserved.
 */
function scheduleMutationRender(): void {
  if (pendingMutationRender) return;
  pendingMutationRender = true;
  setTimeout(function () {
    pendingMutationRender = false;
    if (mutationPolling) render();
  }, 1000);
}

/**
 * One iteration of the mutation long-poll. The server holds the request open
 * until an event arrives or it times out, so this is a tight loop only while
 * writes are flowing. Stops silently when the endpoint is absent (501, no
 * writeQuery) or the connection drops.
 */
function pollMutationsOnce(): void {
  if (!mutationPolling) return;
  fetch('/api/mutations?since=' + mutationCursor, S.authOpts())
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('mutations unavailable')); })
    .then(function (data) {
      if (!mutationPolling) return;
      const events = (data && data.events) || [];
      let changed = false;
      events.forEach(function (e: any) {
        if (e && e.table) {
          mutationCountByTable[e.table] = (mutationCountByTable[e.table] || 0) + 1;
          changed = true;
        }
      });
      if (typeof data.cursor === 'number') mutationCursor = data.cursor;
      if (changed) scheduleMutationRender();
      pollMutationsOnce();
    })
    .catch(function () { mutationPolling = false; });
}

/** Starts the write-activity poll if not already running. */
function startMutationPoll(): void {
  if (mutationPolling) return;
  mutationPolling = true;
  pollMutationsOnce();
}

/** Stops the write-activity poll (called when the Schema tab loses focus). */
export function stopSchemaMutationPoll(): void {
  mutationPolling = false;
}

// --- Loading --------------------------------------------------------------

/**
 * Fetches a best-effort JSON detector result. Returns null (never throws) when
 * the endpoint is missing or errored, so one unavailable detector can't blank
 * the schema view.
 */
function fetchOptional(path: string): Promise<any> {
  return fetch(path, S.authOpts())
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
}

/** Loads the schema metadata + all detector results, then renders. */
export function loadSchemaExplorer(): void {
  const body = document.getElementById('schema-explorer-body');
  if (body) body.innerHTML = '<p class="meta">' + esc(vt('viewer.schema.explorer.loading')) + '</p>';

  // Reset per-load detector state so a previous schema's findings don't bleed
  // into this render before the fresh fetches resolve.
  sizeByTable = {};
  anomaliesByTable = {};
  orphanSet = new Set();
  missingIndexByTable = {};
  totalSizeBytes = null;

  Promise.all([
    loadSchemaMeta().catch(function () { return null; }),
    fetchOptional('/api/analytics/size'),
    fetchOptional('/api/analytics/anomalies'),
    fetchOptional('/api/analytics/orphan-tables'),
    fetchOptional('/api/index-suggestions'),
  ]).then(function (results) {
    const meta = results[0];
    const size = results[1];
    const anomalies = results[2];
    const orphans = results[3];
    const indexSugg = results[4];

    if (size && Array.isArray(size.tables)) {
      size.tables.forEach(function (t: any) {
        sizeByTable[t.table] = { columnCount: t.columnCount || 0, indexes: t.indexes || [] };
      });
      if (typeof size.totalSizeBytes === 'number') totalSizeBytes = size.totalSizeBytes;
    }
    if (anomalies && Array.isArray(anomalies.anomalies)) {
      anomalies.anomalies.forEach(function (a: any) {
        if (a && a.table) (anomaliesByTable[a.table] = anomaliesByTable[a.table] || []).push(a);
      });
    }
    if (orphans && Array.isArray(orphans.orphans)) {
      orphans.orphans.forEach(function (o: any) { if (o && o.table) orphanSet.add(o.table); });
    }
    if (indexSugg && Array.isArray(indexSugg.suggestions)) {
      indexSugg.suggestions.forEach(function (s: any) {
        if (s && s.table && s.column) (missingIndexByTable[s.table] = missingIndexByTable[s.table] || []).push(s.column);
      });
    }

    if (!meta) {
      if (body) body.innerHTML = '<p class="meta">' + esc(vt('viewer.schema.explorer.error')) + '</p>';
      return;
    }
    populateTypeFilter(meta);
    render();
  });

  // Fill the raw-DDL collapsible (independent of the structured view).
  loadSchemaIntoPre();
  // Begin tallying live writes while the tab is open.
  startMutationPoll();
}

/**
 * Wires the search box, type filter, and copy buttons once, then loads. Safe to
 * call on every Schema-tab activation — the listeners attach a single time and
 * subsequent calls just reload.
 */
export function ensureSchemaExplorer(): void {
  if (!inited) {
    inited = true;
    // Localize the static-shell labels now that the bundle (and its translation
    // overlay) is live; the HTML carried only English fallbacks.
    const search = document.getElementById('schema-explorer-search') as HTMLInputElement | null;
    if (search) {
      search.placeholder = vt('viewer.schema.explorer.searchPlaceholder');
      search.setAttribute('aria-label', vt('viewer.schema.explorer.searchLabel'));
      search.addEventListener('input', render);
    }
    const type = document.getElementById('schema-explorer-type');
    if (type) {
      type.setAttribute('aria-label', vt('viewer.schema.explorer.typeLabel'));
      type.addEventListener('change', render);
    }
    const rawSummary = document.getElementById('schema-raw-summary');
    if (rawSummary) rawSummary.textContent = vt('viewer.schema.explorer.rawHeading');
    // Copy-button tooltips (the icon is the visible affordance).
    const copyTitles: Record<string, string> = {
      sql: vt('viewer.schema.explorer.copySql'),
      markdown: vt('viewer.schema.explorer.copyMarkdown'),
      json: vt('viewer.schema.explorer.copyJson'),
    };
    Object.keys(copyTitles).forEach(function (k) {
      const btn = document.querySelector('[data-schema-copy="' + k + '"]');
      if (btn) { btn.setAttribute('title', copyTitles[k]); btn.setAttribute('aria-label', copyTitles[k]); }
    });
    const toolbar = document.getElementById('schema-explorer-toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', function (ev) {
        const target = (ev.target as HTMLElement).closest('[data-schema-copy]') as HTMLElement | null;
        if (target) handleCopyClick(target.getAttribute('data-schema-copy') || '');
      });
    }
  }
  startMutationPoll();
  loadSchemaExplorer();
}
