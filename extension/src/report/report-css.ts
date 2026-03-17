/** Returns self-contained CSS for the portable report HTML. */
export function getReportCss(): string {
  return `
:root {
  --bg: #ffffff; --fg: #1a1a1a; --border: #e0e0e0;
  --accent: #0066cc; --accent-fg: #ffffff;
  --hover-bg: #f5f5f5; --sidebar-bg: #f8f8f8;
  --search-bg: #ffffff; --search-border: #ccc;
  --badge-bg: #0066cc; --badge-fg: #ffffff;
  --truncated: #e67e22; --null-fg: #999;
  --schema-bg: #f4f4f4; --code-fg: #1a1a1a;
  --anomaly-error: #e74c3c; --anomaly-warning: #f39c12; --anomaly-info: #3498db;
  --tab-bg: transparent; --tab-active-bg: var(--accent); --tab-active-fg: #ffffff;
  --pagination-bg: #f0f0f0;
}
[data-theme="dark"] {
  --bg: #1e1e1e; --fg: #d4d4d4; --border: #444;
  --accent: #4da6ff; --accent-fg: #1e1e1e;
  --hover-bg: #2a2a2a; --sidebar-bg: #252525;
  --search-bg: #2a2a2a; --search-border: #555;
  --badge-bg: #4da6ff; --badge-fg: #1e1e1e;
  --truncated: #f39c12; --null-fg: #666;
  --schema-bg: #252525; --code-fg: #d4d4d4;
  --anomaly-error: #e74c3c; --anomaly-warning: #f39c12; --anomaly-info: #4da6ff;
  --tab-active-bg: #4da6ff; --tab-active-fg: #1e1e1e;
  --pagination-bg: #2a2a2a;
}
* { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg); color: var(--fg);
  margin: 0; padding: 0; line-height: 1.5;
}
#app { display: flex; flex-direction: column; min-height: 100vh; }
header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; border-bottom: 1px solid var(--border);
}
header h1 { margin: 0; font-size: 18px; font-weight: 600; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.generated { font-size: 12px; opacity: 0.6; }
.theme-btn {
  padding: 4px 12px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg); color: var(--fg);
}
.theme-btn:hover { background: var(--hover-bg); }
.layout {
  display: flex; flex: 1; overflow: hidden;
}
.sidebar {
  width: 220px; min-width: 180px; max-width: 280px;
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg); overflow-y: auto;
  padding: 8px;
}
.table-btn {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 8px 10px; border: none;
  background: transparent; color: var(--fg);
  font-size: 13px; cursor: pointer; text-align: left;
  border-radius: 4px;
}
.table-btn:hover { background: var(--hover-bg); }
.table-btn.active {
  background: var(--accent); color: var(--accent-fg);
}
.table-btn.active .badge {
  background: var(--accent-fg); color: var(--accent);
}
.badge {
  background: var(--badge-bg); color: var(--badge-fg);
  border-radius: 10px; padding: 1px 7px; font-size: 11px;
  margin-left: auto; flex-shrink: 0;
}
.truncated { color: var(--truncated); font-size: 11px; flex-shrink: 0; }
main { flex: 1; overflow-y: auto; padding: 16px 20px; }
.nav-tabs {
  display: flex; gap: 4px; margin-bottom: 16px;
  border-bottom: 1px solid var(--border); padding-bottom: 8px;
}
.nav-tab {
  padding: 6px 16px; border: 1px solid var(--border);
  border-radius: 4px 4px 0 0; background: var(--tab-bg);
  color: var(--fg); cursor: pointer; font-size: 13px;
}
.nav-tab:hover { background: var(--hover-bg); }
.nav-tab.active {
  background: var(--tab-active-bg); color: var(--tab-active-fg);
  border-color: var(--tab-active-bg);
}
.table-header {
  display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px;
}
.table-header h2 { margin: 0; font-size: 16px; }
.row-info { font-size: 12px; opacity: 0.6; }
.search-bar { margin-bottom: 12px; }
.search-bar input {
  width: 100%; max-width: 400px; padding: 6px 10px;
  border: 1px solid var(--search-border); border-radius: 4px;
  background: var(--search-bg); color: var(--fg);
  font-size: 13px;
}
.search-bar input:focus { outline: 2px solid var(--accent); border-color: transparent; }
.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td {
  border: 1px solid var(--border); padding: 6px 10px;
  text-align: left; white-space: nowrap;
}
th {
  background: var(--accent); color: var(--accent-fg);
  position: sticky; top: 0; font-weight: 600; font-size: 12px;
}
td { max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
.null { color: var(--null-fg); font-style: italic; }
.pagination {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; font-size: 13px;
}
.pagination button {
  padding: 4px 12px; border: 1px solid var(--border);
  border-radius: 4px; background: var(--pagination-bg);
  color: var(--fg); cursor: pointer; font-size: 12px;
}
.pagination button:hover:not(:disabled) { background: var(--hover-bg); }
.pagination button:disabled { opacity: 0.4; cursor: default; }
.schema-item { margin-bottom: 20px; }
.schema-item h3 { font-size: 14px; margin: 0 0 6px 0; }
.schema-item pre {
  background: var(--schema-bg); color: var(--code-fg);
  padding: 12px; border-radius: 4px; overflow-x: auto;
  font-size: 12px; line-height: 1.6; margin: 0;
  border: 1px solid var(--border);
}
.schema-item pre .sql-kw { color: #569cd6; font-weight: 600; }
.schema-item pre .sql-str { color: #ce9178; }
.schema-item pre .sql-num { color: #b5cea8; }
.schema-item pre .sql-cmt { color: #6a9955; font-style: italic; }
.schema-item pre .sql-id { color: #9cdcfe; }
.schema-item pre .sql-plain { color: inherit; }
.anomaly {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 12px; border-radius: 4px; margin-bottom: 6px;
  font-size: 13px; border: 1px solid var(--border);
}
.anomaly-icon { flex-shrink: 0; width: 18px; text-align: center; }
.anomaly-error .anomaly-icon { color: var(--anomaly-error); }
.anomaly-warning .anomaly-icon { color: var(--anomaly-warning); }
.anomaly-info .anomaly-icon { color: var(--anomaly-info); }
.empty { padding: 24px; text-align: center; opacity: 0.6; }
footer {
  padding: 12px 20px; border-top: 1px solid var(--border);
  font-size: 11px; opacity: 0.5; text-align: center;
}
`;
}
