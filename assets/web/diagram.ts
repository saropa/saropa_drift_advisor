/**
 * ER diagram rendering and interaction — SVG, FK arrows, keyboard nav.
 */
import * as S from './state.ts';
import { esc, syncFeatureCardExpanded } from './utils.ts';
import { openTableTab } from './tabs.ts';
import { vt } from './l10n.ts';

export function initDiagram(): void {
  const container = document.getElementById('diagram-container');
  if (!container) return;
  const toggle = document.getElementById('diagram-toggle');
  const collapsible = document.getElementById('diagram-collapsible');
  const BOX_W = 200;
  const BOX_H = 160;
  const PAD = 12;
  const COLS = 4;
  let diagramData = null;

  // Field-filter state. highlightOn defaults true so a search immediately
  // emphasizes matches; hideOn is opt-in so the diagram is never silently emptied.
  let filterText = '';
  let filterType = '';
  let highlightOn = true;
  let hideOn = false;

  function filterActive() {
    return filterText.trim() !== '' || filterType !== '';
  }
  // A column matches when the search appears in its name OR type AND (no type
  // filter, or the type equals the selected one). Case-insensitive.
  function colMatches(c) {
    const q = filterText.trim().toLowerCase();
    const type = (c.type || '').toLowerCase();
    const textHit = !q || c.name.toLowerCase().indexOf(q) >= 0 || type.indexOf(q) >= 0;
    const typeHit = !filterType || type === filterType.toLowerCase();
    return textHit && typeHit;
  }
  // Table name only counts as a match when no type filter is active.
  function tableNameMatches(t) {
    const q = filterText.trim().toLowerCase();
    return !filterType && q !== '' && t.name.toLowerCase().indexOf(q) >= 0;
  }
  function tableMatches(t) {
    return tableNameMatches(t) || (t.columns || []).some(colMatches);
  }

  function tablePos(index) {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    return { x: col * (BOX_W + PAD) + PAD, y: row * (BOX_H + PAD) + PAD };
  }

  // Builds the filter toolbar once and the (re-paintable) canvas under it. The
  // toolbar lives OUTSIDE the canvas so re-painting on each keystroke does not
  // steal focus from the search input.
  function renderDiagram(data) {
    const tables = data.tables || [];
    if (tables.length === 0) {
      container.innerHTML = '<p class="meta">' + esc(vt('viewer.settings.diagram.noTables')) + '</p>';
      return;
    }

    // Distinct column types feed the type-filter dropdown, sorted case-insensitively.
    const typeSet = {};
    tables.forEach(function(t) {
      (t.columns || []).forEach(function(c) { if (c.type) typeSet[c.type] = true; });
    });
    const typeOpts = Object.keys(typeSet)
      .sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); })
      .map(function(ty) { return '<option value="' + esc(ty) + '">' + esc(ty) + '</option>'; })
      .join('');

    const toolbar = '<div class="diagram-filter">'
      + '<input type="search" id="diagram-field-search" placeholder="'
        + esc(vt('viewer.settings.diagram.filter.search.placeholder')) + '" aria-label="'
        + esc(vt('viewer.settings.diagram.filter.search.aria')) + '" />'
      + '<select id="diagram-type-filter" aria-label="'
        + esc(vt('viewer.settings.diagram.filter.type.aria')) + '"><option value="">'
        + esc(vt('viewer.settings.diagram.filter.type.all')) + '</option>' + typeOpts + '</select>'
      + '<button type="button" class="btn active" id="diagram-highlight-toggle" aria-pressed="true">'
        + esc(vt('viewer.settings.diagram.filter.highlight')) + '</button>'
      + '<button type="button" class="btn" id="diagram-hide-toggle" aria-pressed="false">'
        + esc(vt('viewer.settings.diagram.filter.hide')) + '</button>'
      + '</div>';
    container.innerHTML = toolbar + '<div id="diagram-canvas"></div>';

    const searchEl = document.getElementById('diagram-field-search');
    const typeEl = document.getElementById('diagram-type-filter');
    const hlBtn = document.getElementById('diagram-highlight-toggle');
    const hideBtn = document.getElementById('diagram-hide-toggle');
    if (searchEl) searchEl.addEventListener('input', function() { filterText = this.value; paintDiagram(data); });
    if (typeEl) typeEl.addEventListener('change', function() { filterType = this.value; paintDiagram(data); });
    if (hlBtn) hlBtn.addEventListener('click', function() {
      highlightOn = !highlightOn;
      this.classList.toggle('active', highlightOn);
      this.setAttribute('aria-pressed', String(highlightOn));
      paintDiagram(data);
    });
    if (hideBtn) hideBtn.addEventListener('click', function() {
      hideOn = !hideOn;
      this.classList.toggle('active', hideOn);
      this.setAttribute('aria-pressed', String(hideOn));
      paintDiagram(data);
    });

    paintDiagram(data);
  }

  // Renders the SVG into #diagram-canvas, applying the current filter state:
  // highlight emphasizes matches and dims the rest; hide drops non-matching
  // tables/columns (and any FK line whose endpoint vanished).
  function paintDiagram(data) {
    const canvas = document.getElementById('diagram-canvas');
    if (!canvas) return;
    const tables = data.tables || [];
    const fks = data.foreignKeys || [];
    // Soft relationships (Feature 77): edges inferred from column naming that no
    // SQLite FK or manifest declares. Drawn dashed so the link is visible even
    // though nothing declares it.
    const softs = data.softRelationships || [];
    const active = filterActive();
    const hiding = hideOn && active;
    const matchedSet = {};
    tables.forEach(function(t) { matchedSet[t.name] = tableMatches(t); });

    const rows = Math.ceil(tables.length / COLS);
    const width = COLS * (BOX_W + PAD) + PAD;
    const height = rows * (BOX_H + PAD) + PAD;
    const nameToIndex = {};
    tables.forEach((t, i) => { nameToIndex[t.name] = i; });
    const getCenter = (index, side) => {
      const p = tablePos(index);
      const cx = p.x + BOX_W / 2;
      const cy = p.y + BOX_H / 2;
      if (side === 'right') return { x: p.x + BOX_W, y: cy };
      if (side === 'left') return { x: p.x, y: cy };
      return { x: cx, y: cy };
    };

    // Use role="group" (not "img") so screen readers announce the summary
    // label but still allow navigation into the focusable table children.
    // Singular/plural are separate keys (a translator can't reorder an inline
    // 's' suffix); the three count clauses are assembled via the summary key.
    const tablesClause = vt(tables.length !== 1 ? 'viewer.settings.diagram.aria.tablesMany' : 'viewer.settings.diagram.aria.tablesOne', tables.length);
    const fksClause = vt(fks.length !== 1 ? 'viewer.settings.diagram.aria.fksMany' : 'viewer.settings.diagram.aria.fksOne', fks.length);
    const softLabel = softs.length ? vt(softs.length !== 1 ? 'viewer.settings.diagram.aria.softMany' : 'viewer.settings.diagram.aria.softOne', softs.length) : '';
    const ariaSummary = vt('viewer.settings.diagram.aria.summary', tablesClause, fksClause, softLabel);
    let svg = '<svg role="group" aria-label="' + esc(ariaSummary) + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<g class="diagram-links">';
    fks.forEach(function(fk) {
      const iFrom = nameToIndex[fk.fromTable];
      const iTo = nameToIndex[fk.toTable];
      if (iFrom == null || iTo == null) return;
      // Drop the line when hide-mode removed either endpoint table.
      if (hiding && (!matchedSet[fk.fromTable] || !matchedSet[fk.toTable])) return;
      const from = getCenter(iFrom, 'right');
      const to = getCenter(iTo, 'left');
      const mid = (from.x + to.x) / 2;
      // Each FK path gets a <title> so screen readers and hover-tooltips
      // describe the relationship (matches chart tooltip pattern).
      svg += '<path class="diagram-link" d="M' + from.x + ',' + from.y + ' C' + mid + ',' + from.y + ' ' + mid + ',' + to.y + ' ' + to.x + ',' + to.y + '">'
        + '<title>' + esc(fk.fromTable) + '.' + esc(fk.fromColumn) + ' \u2192 ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '</title></path>';
    });
    // Soft edges: same curve, drawn dashed via .diagram-link-soft. The <title>
    // names the convention that inferred it and that nothing declares it, so the
    // dashed line reads as "inferred, not declared" on hover / to a screen reader.
    softs.forEach(function(s) {
      const iFrom = nameToIndex[s.fromTable];
      const iTo = nameToIndex[s.toTable];
      if (iFrom == null || iTo == null) return;
      if (hiding && (!matchedSet[s.fromTable] || !matchedSet[s.toTable])) return;
      const from = getCenter(iFrom, 'right');
      const to = getCenter(iTo, 'left');
      const mid = (from.x + to.x) / 2;
      // The "how" phrase (which naming convention inferred the edge) is a keyed
      // variant; the "(inferred from {0}, not declared)" suffix wraps it so a
      // translator controls the phrasing around the edge endpoints.
      const how = vt(s.rule === 'noun_id' ? 'viewer.settings.diagram.rule.nounId' : 'viewer.settings.diagram.rule.sharedUuid');
      svg += '<path class="diagram-link diagram-link-soft" d="M' + from.x + ',' + from.y + ' C' + mid + ',' + from.y + ' ' + mid + ',' + to.y + ' ' + to.x + ',' + to.y + '">'
        + '<title>' + esc(s.fromTable) + '.' + esc(s.fromColumn) + ' \u2192 ' + esc(s.toTable) + '.' + esc(s.toColumn) + ' ' + esc(vt('viewer.settings.diagram.alt.softInferred', how)) + '</title></path>';
    });
    svg += '</g><g class="diagram-tables">';
    tables.forEach(function(t, i) {
      const matched = matchedSet[t.name];
      // Hide-mode drops tables with no match entirely (their grid slot is left
      // empty rather than re-packed, so other tables keep their positions).
      if (hiding && !matched) return;
      const p = tablePos(i);
      const allCols = t.columns || [];
      // When hiding and the table has matching columns, show only those; a table
      // kept by its name alone keeps all columns. Still capped at 6 for space.
      const matchingCols = allCols.filter(colMatches);
      const baseCols = (hiding && matchingCols.length > 0) ? matchingCols : allCols;
      const cols = baseCols.slice(0, 6);
      const name = esc(t.name);
      // Build an ARIA label summarising the table for screen readers:
      // e.g. "users table, 5 columns, primary key: id". Column count has
      // separate singular/plural keys; the PK clause is appended only when a
      // primary key exists, with the column names as a {0} token.
      const pkCols = allCols.filter(function(c) { return c.pk; }).map(function(c) { return c.name; });
      const pkClause = pkCols.length ? vt('viewer.settings.diagram.aria.pkClause', pkCols.join(', ')) : '';
      const ariaLabel = vt(allCols.length !== 1 ? 'viewer.settings.diagram.aria.tableMany' : 'viewer.settings.diagram.aria.tableOne', t.name, allCols.length, pkClause);
      let body = cols.map(function(c) {
        const pk = c.pk ? ' <tspan class="diagram-pk">' + esc(vt('viewer.settings.diagram.pk')) + '</tspan>' : '';
        // Highlight mode marks matching columns (chevron + accent) and dims the rest.
        let colCls = 'diagram-col';
        let chevron = '';
        if (highlightOn && active) {
          if (colMatches(c)) { colCls += ' match'; chevron = '› '; }
          else { colCls += ' dim'; }
        }
        // Use local x coordinate (relative to the parent <g> transform),
        // not absolute – the group's translate already positions the box.
        return '<tspan class="' + colCls + '" x="8" dy="16">' + esc(chevron) + esc(c.name) + (c.type ? ' ' + esc(c.type) : '') + pk + '</tspan>';
      }).join('');
      if (baseCols.length > cols.length) body += '<tspan class="diagram-col" x="8" dy="16">…</tspan>';
      // tabindex="0" makes the box keyboard-focusable; role="button" tells
      // screen readers it is activatable (clicking loads the table view).
      let gCls = 'diagram-table';
      if (highlightOn && active) gCls += matched ? ' match' : ' dim';
      svg += '<g class="' + gCls + '" data-table="' + name + '" tabindex="0" role="button" aria-label="' + esc(ariaLabel) + '" transform="translate(' + p.x + ',' + p.y + ')">';
      svg += '<rect width="' + BOX_W + '" height="' + BOX_H + '" rx="4"/>';
      svg += '<text class="diagram-name" x="8" y="22" style="fill: var(--link);">' + name + '</text>';
      svg += '<text x="8" y="38">' + body + '</text>';
      svg += '</g>';
    });
    svg += '</g></svg>';
    canvas.innerHTML = svg;

    // Attach click + keyboard handlers to each table box.
    // Enter/Space activates (same as click); arrow keys navigate the grid.
    const tableEls = canvas.querySelectorAll('.diagram-table');
    tableEls.forEach(function(g, i) {
      g.addEventListener('click', function() {
        const name = this.getAttribute('data-table');
        if (name) openTableTab(name);
      });
      g.addEventListener('keydown', function(e) {
        // Enter or Space activates the table (loads its data view).
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const name = this.getAttribute('data-table');
          if (name) openTableTab(name);
          return;
        }
        // Arrow keys navigate between table boxes in grid layout.
        var target = -1;
        if (e.key === 'ArrowRight') target = i + 1;
        else if (e.key === 'ArrowLeft') target = i - 1;
        else if (e.key === 'ArrowDown') target = i + COLS;
        else if (e.key === 'ArrowUp') target = i - COLS;
        if (target >= 0 && target < tableEls.length) {
          e.preventDefault();
          tableEls[target].focus();
        }
      });
    });

    // Build a text-based alternative for screen readers (sr-only div).
    // Lists every table with its columns plus FK relationships.
    var altEl = document.getElementById('diagram-text-alt');
    if (altEl) {
      var altHtml = '<h4>' + esc(vt('viewer.settings.diagram.alt.tableList')) + '</h4><ul>';
      tables.forEach(function(t) {
        var cols = t.columns || [];
        // The table name is pre-wrapped in <strong> as static markup, then
        // passed as the {0} token; column count uses singular/plural keys.
        var nameMarkup = '<strong>' + esc(t.name) + '</strong>';
        var colList = cols.map(function(c) { return esc(c.name) + (c.pk ? vt('viewer.settings.diagram.alt.pkMark') : ''); }).join(', ');
        altHtml += '<li>' + vt(cols.length !== 1 ? 'viewer.settings.diagram.alt.tableMany' : 'viewer.settings.diagram.alt.tableOne', nameMarkup, cols.length, colList) + '</li>';
      });
      altHtml += '</ul>';
      if (fks.length > 0) {
        altHtml += '<h4>' + esc(vt('viewer.settings.diagram.alt.fkHeading')) + '</h4><ul>';
        fks.forEach(function(fk) {
          altHtml += '<li>' + esc(fk.fromTable) + '.' + esc(fk.fromColumn) + ' \u2192 ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '</li>';
        });
        altHtml += '</ul>';
      }
      if (softs.length > 0) {
        altHtml += '<h4>' + esc(vt('viewer.settings.diagram.alt.softHeading')) + '</h4><ul>';
        softs.forEach(function(s) {
          const how = vt(s.rule === 'noun_id' ? 'viewer.settings.diagram.rule.nounId' : 'viewer.settings.diagram.rule.sharedUuid');
          altHtml += '<li>' + esc(s.fromTable) + '.' + esc(s.fromColumn) + ' \u2192 ' + esc(s.toTable) + '.' + esc(s.toColumn) + ' ' + esc(vt('viewer.settings.diagram.alt.softInferred', how)) + '</li>';
        });
        altHtml += '</ul>';
      }
      altEl.innerHTML = altHtml;
    }
  }

  function loadAndRenderDiagram() {
    if (diagramData === null) {
      container.innerHTML = '<p class="meta">' + esc(vt('viewer.settings.diagram.loading')) + '</p>';
      fetch('/api/schema/diagram', S.authOpts())
        .then(r => r.json())
        .then(function(data) {
          diagramData = data;
          renderDiagram(data);
        })
        .catch(function(e) {
          container.innerHTML = '<p class="meta">' + esc(vt('viewer.settings.diagram.loadFailed', String(e))) + '</p>';
        });
    } else {
      renderDiagram(diagramData);
    }
  }

  window.ensureDiagramInited = loadAndRenderDiagram;

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
      if (isCollapsed) loadAndRenderDiagram();
    });
  }
}
