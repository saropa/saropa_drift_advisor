// Builds the self-contained portable HTML report served by [ReportHandler].
//
// The whole report is one HTML file with CSS, JS, and the database snapshot
// all inlined — it opens in any browser with no server, no network, and no
// dependencies, so it can be attached to a bug report or archived as-is.
//
// Safety: every value the database supplied (cell values, table/column names,
// schema DDL, anomaly text) is embedded ONLY inside a single JSON island and
// rendered into the DOM with `textContent` (never `innerHTML`). That makes the
// report XSS-safe by construction — a cell containing `<script>` or `</script>`
// becomes literal text, never markup — without per-value HTML escaping. The
// lone escape applied to the JSON string is the standard `</` → `<\/` guard so
// a value containing the substring `</script>` cannot terminate the script tag
// that carries the payload.

import 'dart:convert';

/// One table's slice in a portable report: its columns, a capped page of rows,
/// and the true total so the UI can show how much was truncated.
class ReportTableData {
  /// Creates a report slice for [name] with [columns] and [rows].
  ReportTableData({
    required this.name,
    required this.columns,
    required this.rows,
    required this.totalRowCount,
    required this.truncated,
  });

  /// Table name as it appears in the database.
  final String name;

  /// Ordered column names (from `PRAGMA table_info`).
  final List<String> columns;

  /// The embedded rows — at most the handler's `maxRows`.
  final List<Map<String, dynamic>> rows;

  /// Total rows in the table, even when more than [rows] were embedded.
  final int totalRowCount;

  /// True when [totalRowCount] exceeds the embedded [rows] length.
  final bool truncated;

  /// JSON shape consumed by the report's client-side renderer.
  Map<String, dynamic> toJson() => <String, dynamic>{
    'name': name,
    'columns': columns,
    'rows': rows,
    'totalRowCount': totalRowCount,
    'truncated': truncated,
  };
}

/// Assembles the portable report HTML from collected snapshot data.
class ReportHtmlBuilder {
  /// Builds the complete HTML document string.
  ///
  /// [anomalies] is the raw `anomalies` list from the analytics scan (each an
  /// object with `table`/`column`/`severity`/`message`); null/empty omits the
  /// section. [schemaSql] is the DDL dump; null omits the schema section.
  static String build({
    required String generatedAt,
    required String serverHost,
    required List<ReportTableData> tables,
    String? schemaSql,
    List<Map<String, dynamic>>? anomalies,
  }) {
    final Map<String, dynamic> payload = <String, dynamic>{
      'generatedAt': generatedAt,
      'serverHost': serverHost,
      'tables': tables.map((ReportTableData t) => t.toJson()).toList(),
      'schema': schemaSql,
      'anomalies': anomalies ?? <Map<String, dynamic>>[],
    };

    // `</` → `<\/` so a cell or DDL containing `</script>` cannot close the tag.
    final String dataJson = jsonEncode(payload).replaceAll('</', r'<\/');

    return '<!DOCTYPE html>\n'
        '<html lang="en">\n'
        '<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>Saropa Drift Advisor Report</title>\n'
        '<style>$_css</style>\n'
        '</head>\n'
        '<body>\n'
        '<header>\n'
        '<h1>Saropa Drift Advisor Report</h1>\n'
        '<p id="meta"></p>\n'
        '<button type="button" id="theme-btn">Toggle theme</button>\n'
        '</header>\n'
        '<nav id="table-list" aria-label="Tables"></nav>\n'
        '<main id="table-view"></main>\n'
        '<section id="schema" hidden><h2>Schema</h2><pre id="schema-pre"></pre></section>\n'
        '<section id="anomalies" hidden><h2>Anomalies</h2><div id="anomaly-list"></div></section>\n'
        '<footer id="footer"></footer>\n'
        '<script id="report-data" type="application/json">$dataJson</script>\n'
        '<script>$_js</script>\n'
        '</body>\n'
        '</html>\n';
  }

  /// Inlined stylesheet with light/dark theme via a `data-theme` attribute.
  static const String _css = '''
:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--border:#ddd;--accent:#0066cc;--row:#f7f7f7;}
[data-theme="dark"]{--bg:#1e1e1e;--fg:#d4d4d4;--muted:#999;--border:#444;--accent:#4da6ff;--row:#262626;}
*{box-sizing:border-box;}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:16px;line-height:1.4;}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:12px;}
h1{font-size:18px;margin:0;}
h2{font-size:15px;border-bottom:1px solid var(--border);padding-bottom:4px;}
#meta{color:var(--muted);font-size:13px;margin:0;flex:1;}
button{font:inherit;cursor:pointer;background:var(--accent);color:#fff;border:0;border-radius:6px;padding:6px 12px;}
#table-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
.table-btn{background:var(--row);color:var(--fg);border:1px solid var(--border);}
.table-btn.active{background:var(--accent);color:#fff;border-color:var(--accent);}
.badge{display:inline-block;background:var(--accent);color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px;}
.table-btn.active .badge{background:#fff;color:var(--accent);}
.trunc{color:#e08a00;font-size:11px;margin-left:4px;}
.search{margin-bottom:8px;padding:6px 8px;width:100%;max-width:320px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);}
table{border-collapse:collapse;width:100%;font-size:13px;}
th,td{border:1px solid var(--border);padding:5px 9px;text-align:left;vertical-align:top;white-space:pre-wrap;}
th{background:var(--accent);color:#fff;position:sticky;top:0;}
tbody tr:nth-child(even){background:var(--row);}
.pager{display:flex;align-items:center;gap:10px;margin-top:8px;font-size:13px;}
.empty{color:var(--muted);font-style:italic;padding:8px 0;}
pre{background:var(--row);border:1px solid var(--border);border-radius:6px;padding:10px;overflow:auto;font-size:12px;}
.anom{border:1px solid var(--border);border-left-width:4px;border-radius:4px;padding:6px 10px;margin-bottom:6px;font-size:13px;}
.anom.error{border-left-color:#d33;}
.anom.warning{border-left-color:#e08a00;}
.anom.info{border-left-color:var(--accent);}
.anom .loc{color:var(--muted);font-size:11px;}
footer{color:var(--muted);font-size:12px;border-top:1px solid var(--border);margin-top:16px;padding-top:8px;}
''';

  /// Inlined client script: theme toggle, table switching, paged rendering,
  /// and a per-table text filter. All DOM text is set via `textContent`.
  static const String _js = r'''
(function(){
var DATA=JSON.parse(document.getElementById('report-data').textContent);
var PAGE=50,page=0,active=null,filter='';
function val(v){return v===null||v===undefined?'':String(v);}
document.getElementById('meta').textContent='Generated '+val(DATA.generatedAt)+' from '+val(DATA.serverHost);
document.getElementById('footer').textContent='Generated by Saropa Drift Advisor — '+val(DATA.generatedAt);
document.getElementById('theme-btn').addEventListener('click',function(){
  var d=document.documentElement;
  if(d.getAttribute('data-theme')==='dark')d.removeAttribute('data-theme');else d.setAttribute('data-theme','dark');
});
var nav=document.getElementById('table-list');
DATA.tables.forEach(function(t){
  var b=document.createElement('button');
  b.className='table-btn';b.type='button';
  b.appendChild(document.createTextNode(t.name+' '));
  var badge=document.createElement('span');badge.className='badge';badge.textContent=String(t.totalRowCount);
  b.appendChild(badge);
  if(t.truncated){var s=document.createElement('span');s.className='trunc';s.textContent='(truncated)';b.appendChild(s);}
  b.addEventListener('click',function(){show(t.name);});
  b.dataset.table=t.name;nav.appendChild(b);
});
function filtered(t){
  if(!filter)return t.rows;
  var f=filter.toLowerCase();
  return t.rows.filter(function(r){return t.columns.some(function(c){return val(r[c]).toLowerCase().indexOf(f)>=0;});});
}
function show(name){
  active=name;page=0;filter='';
  Array.prototype.forEach.call(nav.children,function(b){b.classList.toggle('active',b.dataset.table===name);});
  render();
}
function render(){
  var t=DATA.tables.find(function(x){return x.name===active;});
  var main=document.getElementById('table-view');main.textContent='';
  if(!t)return;
  var search=document.createElement('input');
  search.className='search';search.type='text';search.placeholder='Filter '+t.name+'…';search.value=filter;
  search.addEventListener('input',function(){filter=search.value;page=0;renderBody(t,main,search);});
  main.appendChild(search);
  renderBody(t,main,search);
}
function renderBody(t,main,search){
  Array.prototype.slice.call(main.querySelectorAll('table,.pager,.empty')).forEach(function(n){n.remove();});
  var rows=filtered(t);
  if(rows.length===0){var e=document.createElement('div');e.className='empty';e.textContent='No rows.';main.appendChild(e);return;}
  var start=page*PAGE,pageRows=rows.slice(start,start+PAGE);
  var tbl=document.createElement('table'),thead=document.createElement('thead'),htr=document.createElement('tr');
  t.columns.forEach(function(c){var th=document.createElement('th');th.textContent=c;htr.appendChild(th);});
  thead.appendChild(htr);tbl.appendChild(thead);
  var tb=document.createElement('tbody');
  pageRows.forEach(function(r){
    var tr=document.createElement('tr');
    t.columns.forEach(function(c){var td=document.createElement('td');td.textContent=val(r[c]);tr.appendChild(td);});
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);main.appendChild(tbl);
  var pages=Math.ceil(rows.length/PAGE);
  if(pages>1){
    var p=document.createElement('div');p.className='pager';
    var prev=document.createElement('button');prev.type='button';prev.textContent='Prev';prev.disabled=page===0;
    prev.addEventListener('click',function(){if(page>0){page--;renderBody(t,main,search);}});
    var next=document.createElement('button');next.type='button';next.textContent='Next';next.disabled=page>=pages-1;
    next.addEventListener('click',function(){if(page<pages-1){page++;renderBody(t,main,search);}});
    var lbl=document.createElement('span');lbl.textContent='Page '+(page+1)+' of '+pages+' ('+rows.length+' rows)';
    p.appendChild(prev);p.appendChild(lbl);p.appendChild(next);main.appendChild(p);
  }
}
if(typeof DATA.schema==='string'&&DATA.schema.length>0){
  document.getElementById('schema').hidden=false;
  document.getElementById('schema-pre').textContent=DATA.schema;
}
if(DATA.anomalies&&DATA.anomalies.length>0){
  document.getElementById('anomalies').hidden=false;
  var list=document.getElementById('anomaly-list');
  DATA.anomalies.forEach(function(a){
    var sev=val(a.severity||'info').toLowerCase();
    var d=document.createElement('div');d.className='anom '+(sev==='error'||sev==='warning'?sev:'info');
    var msg=document.createElement('div');msg.textContent=val(a.message);d.appendChild(msg);
    var loc=document.createElement('div');loc.className='loc';
    loc.textContent=sev.toUpperCase()+' · '+val(a.table)+(a.column?('.'+val(a.column)):'');
    d.appendChild(loc);list.appendChild(d);
  });
}
if(DATA.tables.length>0)show(DATA.tables[0].name);
})();
''';
}
