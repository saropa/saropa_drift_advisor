/**
 * Inline JS for rendering EXPLAIN QUERY PLAN results as a colour-coded
 * tree inside the SQL Notebook webview.
 *
 * Injected into the HTML scaffold by {@link getNotebookHtml}.
 */
export function getExplainJs(): string {
  return `
  // --- Explain Tree Rendering ---

  function handleExplainResult(msg) {
    setQueryBusy(false);
    var tab = tabs.find(function (t) { return t.id === msg.tabId; });
    if (!tab) return;
    tab.explain = msg;
    tab.error = null;
    tab.results = null;
    tab.columns = null;
    if (tab.id === activeTabId) {
      renderExplain(msg.rows, msg.sql);
      setStatus('Explain complete');
      enableExportButtons(false);
    }
  }

  function classifyScan(detail) {
    var upper = detail.toUpperCase();
    if (upper.includes('SEARCH')) return 'search';
    if (upper.includes('SCAN TABLE') || upper.includes('SCAN SUBQUERY')) return 'scan';
    if (upper.includes('TEMP B-TREE') || upper.includes('USE TEMP')) return 'temp';
    return 'other';
  }

  function buildExplainTree(rows) {
    var nodes = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = Number(row.id != null ? row.id : row.selectid != null ? row.selectid : i);
      var parent = Number(row.parent != null ? row.parent : 0);
      var detail = String(row.detail || '');
      nodes.push({ id: id, parent: parent, detail: detail, children: [], scanType: classifyScan(detail) });
    }
    var roots = [];
    var lookup = {};
    for (var j = 0; j < nodes.length; j++) {
      lookup[nodes[j].id] = nodes[j];
    }
    for (var k = 0; k < nodes.length; k++) {
      var node = nodes[k];
      var parentNode = lookup[node.parent];
      if (parentNode && parentNode !== node) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  function renderExplain(rows, sql) {
    var tree = buildExplainTree(rows);
    var area = resultArea();
    var html = '<div class="explain-container">';
    html += '<div class="explain-sql"><code>' + esc(sql) + '</code></div>';
    html += '<div class="explain-tree">';
    for (var i = 0; i < tree.length; i++) {
      html += renderExplainNode(tree[i]);
    }
    html += '</div></div>';
    area.innerHTML = html;
  }

  function renderExplainNode(node) {
    var colorMap = { search: 'explain-search', scan: 'explain-scan', temp: 'explain-temp', other: 'explain-other' };
    var badgeMap = { search: 'INDEX', scan: 'FULL SCAN', temp: 'TEMP', other: '' };
    var cls = colorMap[node.scanType] || 'explain-other';
    var badge = badgeMap[node.scanType] || '';
    var badgeHtml = badge ? ' <span class="explain-badge ' + cls + '">' + badge + '</span>' : '';
    var html = '<div class="explain-node ' + cls + '">';
    html += '<span class="explain-detail">' + esc(node.detail) + badgeHtml + '</span>';
    for (var i = 0; i < node.children.length; i++) {
      html += renderExplainNode(node.children[i]);
    }
    html += '</div>';
    return html;
  }
`;
}
