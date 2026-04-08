/**
 * ER diagram rendering and interaction — SVG, FK arrows, keyboard nav.
 */
import * as S from './state.ts';
import { esc, syncFeatureCardExpanded } from './utils.ts';
import { openTableTab } from './tabs.ts';

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

  function tablePos(index) {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    return { x: col * (BOX_W + PAD) + PAD, y: row * (BOX_H + PAD) + PAD };
  }

  function renderDiagram(data) {
    const tables = data.tables || [];
    const fks = data.foreignKeys || [];
    if (tables.length === 0) {
      container.innerHTML = '<p class="meta">No tables.</p>';
   
   return;
    }
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
    let svg = '<svg role="group" aria-label="Schema diagram showing ' + tables.length + ' table' + (tables.length !== 1 ? 's' : '') + ' and ' + fks.length + ' foreign key relationship' + (fks.length !== 1 ? 's' : '') + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<g class="diagram-links">';
    fks.forEach(function(fk) {
      const iFrom = nameToIndex[fk.fromTable];
      const iTo = nameToIndex[fk.toTable];
      if (iFrom == null || iTo == null) return;
      const from = getCenter(iFrom, 'right');
      const to = getCenter(iTo, 'left');
      const mid = (from.x + to.x) / 2;
      // Each FK path gets a <title> so screen readers and hover-tooltips
      // describe the relationship (matches chart tooltip pattern).
      svg += '<path class="diagram-link" d="M' + from.x + ',' + from.y + ' C' + mid + ',' + from.y + ' ' + mid + ',' + to.y + ' ' + to.x + ',' + to.y + '">'
        + '<title>' + esc(fk.fromTable) + '.' + esc(fk.fromColumn) + ' \u2192 ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '</title></path>';
    });
    svg += '</g><g class="diagram-tables">';
    tables.forEach(function(t, i) {
      const p = tablePos(i);
      const allCols = t.columns || [];
      const cols = allCols.slice(0, 6);
      const name = esc(t.name);
      // Build an ARIA label summarising the table for screen readers:
      // e.g. "users table, 5 columns, primary key: id"
      const pkCols = allCols.filter(function(c) { return c.pk; }).map(function(c) { return c.name; });
      const ariaLabel = t.name + ' table, ' + allCols.length + ' column' + (allCols.length !== 1 ? 's' : '')
        + (pkCols.length ? ', primary key: ' + pkCols.join(', ') : '');
      let body = cols.map(function(c) {
        const pk = c.pk ? ' <tspan class="diagram-pk">PK</tspan>' : '';
        // Use local x coordinate (relative to the parent <g> transform),
        // not absolute – the group's translate already positions the box.
        return '<tspan class="diagram-col" x="8" dy="16">' + esc(c.name) + (c.type ? ' ' + esc(c.type) : '') + pk + '</tspan>';
      }).join('');
      if (allCols.length > 6) body += '<tspan class="diagram-col" x="8" dy="16">…</tspan>';
      // tabindex="0" makes the box keyboard-focusable; role="button" tells
      // screen readers it is activatable (clicking loads the table view).
      svg += '<g class="diagram-table" data-table="' + name + '" tabindex="0" role="button" aria-label="' + esc(ariaLabel) + '" transform="translate(' + p.x + ',' + p.y + ')">';
      svg += '<rect width="' + BOX_W + '" height="' + BOX_H + '" rx="4"/>';
      svg += '<text class="diagram-name" x="8" y="22" style="fill: var(--link);">' + name + '</text>';
      svg += '<text x="8" y="38">' + body + '</text>';
      svg += '</g>';
    });
    svg += '</g></svg>';
    container.innerHTML = svg;

    // Attach click + keyboard handlers to each table box.
    // Enter/Space activates (same as click); arrow keys navigate the grid.
    const tableEls = container.querySelectorAll('.diagram-table');
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
      var altHtml = '<h4>Schema table list</h4><ul>';
      tables.forEach(function(t) {
        var cols = t.columns || [];
        altHtml += '<li><strong>' + esc(t.name) + '</strong> (' + cols.length + ' column' + (cols.length !== 1 ? 's' : '') + '): ';
        altHtml += cols.map(function(c) { return esc(c.name) + (c.pk ? ' (PK)' : ''); }).join(', ');
        altHtml += '</li>';
      });
      altHtml += '</ul>';
      if (fks.length > 0) {
        altHtml += '<h4>Foreign key relationships</h4><ul>';
        fks.forEach(function(fk) {
          altHtml += '<li>' + esc(fk.fromTable) + '.' + esc(fk.fromColumn) + ' \u2192 ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '</li>';
        });
        altHtml += '</ul>';
      }
      altEl.innerHTML = altHtml;
    }
  }

  function loadAndRenderDiagram() {
    if (diagramData === null) {
      container.innerHTML = '<p class="meta">Loading…</p>';
      fetch('/api/schema/diagram', S.authOpts())
        .then(r => r.json())
        .then(function(data) {
          diagramData = data;
          renderDiagram(data);
        })
        .catch(function(e) {
          container.innerHTML = '<p class="meta">Failed to load diagram: ' + esc(String(e)) + '</p>';
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
