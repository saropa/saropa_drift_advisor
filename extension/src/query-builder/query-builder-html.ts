import { getQueryBuilderCss } from './query-builder-css';
import { getQueryBuilderClientJs } from './query-builder-client-js';

/**
 * HTML shell for the visual query builder panel.
 *
 * This v1 UI favors deterministic controls over full drag physics so we can
 * support self-joins, live SQL preview, and safe execution first. CSS lives in
 * query-builder-css.ts and the webview client script in query-builder-client-js.ts.
 */
export function getQueryBuilderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>${getQueryBuilderCss()}</style>
</head>
<body>
<div class="root">
  <div class="left">
    <h3>Add Table</h3>
    <select id="addTableSelect"></select>
    <button id="btnAddTable">Add Table Instance</button>
    <div class="muted">Add the same base table multiple times for self-joins.</div>

    <h3 style="margin-top:12px;">Joins</h3>
    <div class="row">
      <select id="joinLeftTable"></select>
      <select id="joinLeftColumn"></select>
      <select id="joinType">
        <option value="INNER">INNER</option>
        <option value="LEFT">LEFT</option>
        <option value="RIGHT">RIGHT</option>
      </select>
      <span></span>
    </div>
    <div class="row">
      <select id="joinRightTable"></select>
      <select id="joinRightColumn"></select>
      <button id="btnAddJoin">+ Join</button>
      <span></span>
    </div>
    <div id="joinList"></div>

    <h3 style="margin-top:12px;">Filter</h3>
    <div class="row">
      <select id="filterTable"></select>
      <select id="filterColumn"></select>
      <select id="filterOperator">
        <option value="=">=</option>
        <option value="!=">!=</option>
        <option value="<"><</option>
        <option value=">">></option>
        <option value="<="><=</option>
        <option value=">=">>=</option>
        <option value="LIKE">LIKE</option>
        <option value="IN">IN</option>
        <option value="IS NULL">IS NULL</option>
        <option value="IS NOT NULL">IS NOT NULL</option>
      </select>
      <input id="filterValue" placeholder="value or a,b,c for IN" />
    </div>
    <button id="btnAddFilter">+ Filter</button>
    <div id="filterList"></div>

    <h3 style="margin-top:12px;">GROUP BY</h3>
    <div class="row">
      <select id="gbTable"></select>
      <select id="gbColumn"></select>
      <button id="btnAddGb">+ GROUP BY</button>
      <span></span>
    </div>
    <div id="gbList" class="muted"></div>

    <h3 style="margin-top:12px;">ORDER BY</h3>
    <div class="row">
      <select id="obTable"></select>
      <select id="obColumn"></select>
      <select id="obDir">
        <option value="ASC">ASC</option>
        <option value="DESC">DESC</option>
      </select>
      <button id="btnAddOb">+ ORDER BY</button>
    </div>
    <div id="obList" class="muted"></div>
  </div>

  <div class="right">
    <h3>Table Instances / Selected Columns</h3>
    <div id="tableCards"></div>

    <h3>SQL Preview</h3>
    <div class="row" style="grid-template-columns: 180px 180px auto auto auto;">
      <input id="limitInput" type="number" min="1" value="100" />
      <span class="muted">Limit</span>
      <button id="btnRun">Run Query</button>
      <button class="secondary" id="btnCopy">Copy SQL</button>
      <button class="secondary" id="btnNotebook">Open in Notebook</button>
    </div>
    <div class="row" style="grid-template-columns: 1fr auto auto auto; margin-top:0;">
      <span></span>
      <button class="secondary" id="btnSaveSnippet">Save as Snippet</button>
      <button class="secondary" id="btnCost">Analyze Cost</button>
      <button class="secondary" id="btnDashboard">Add to Dashboard</button>
    </div>
    <div id="sqlPreview" class="sql"></div>
    <div id="validation" class="error"></div>
    <div id="queryError" class="error"></div>
    <div id="results" class="results"></div>
  </div>
</div>

<script>${getQueryBuilderClientJs()}</script>
</body>
</html>`;
}
