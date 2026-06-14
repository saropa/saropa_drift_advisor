import { getQueryBuilderCss } from './query-builder-css';
import { getQueryBuilderClientJs } from './query-builder-client-js';
import { t } from '../l10n';

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
    <h3>${t('panel.query.builder.addTable.title')}</h3>
    <select id="addTableSelect"></select>
    <button id="btnAddTable">${t('panel.query.builder.addTable.btn')}</button>
    <div class="muted">${t('panel.query.builder.addTable.hint')}</div>

    <h3 style="margin-top:12px;">${t('panel.query.builder.joins.title')}</h3>
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
      <button id="btnAddJoin">${t('panel.query.builder.joins.add')}</button>
      <span></span>
    </div>
    <div id="joinList"></div>

    <h3 style="margin-top:12px;">${t('panel.query.builder.filter.title')}</h3>
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
      <input id="filterValue" placeholder="${t('panel.query.builder.filter.valuePlaceholder')}" />
    </div>
    <button id="btnAddFilter">${t('panel.query.builder.filter.add')}</button>
    <div id="filterList"></div>

    <h3 style="margin-top:12px;">${t('panel.query.builder.groupBy.title')}</h3>
    <div class="row">
      <select id="gbTable"></select>
      <select id="gbColumn"></select>
      <button id="btnAddGb">${t('panel.query.builder.groupBy.add')}</button>
      <span></span>
    </div>
    <div id="gbList" class="muted"></div>

    <h3 style="margin-top:12px;">${t('panel.query.builder.orderBy.title')}</h3>
    <div class="row">
      <select id="obTable"></select>
      <select id="obColumn"></select>
      <select id="obDir">
        <option value="ASC">ASC</option>
        <option value="DESC">DESC</option>
      </select>
      <button id="btnAddOb">${t('panel.query.builder.orderBy.add')}</button>
    </div>
    <div id="obList" class="muted"></div>
  </div>

  <div class="right">
    <h3>${t('panel.query.builder.instances.title')}</h3>
    <div id="tableCards"></div>

    <h3>${t('panel.query.builder.sqlPreview.title')}</h3>
    <div class="row" style="grid-template-columns: 180px 180px auto auto auto;">
      <input id="limitInput" type="number" min="1" value="100" />
      <span class="muted">${t('panel.query.builder.limit.label')}</span>
      <button id="btnRun">${t('panel.query.builder.btn.run')}</button>
      <button class="secondary" id="btnCopy">${t('panel.query.builder.btn.copySql')}</button>
      <button class="secondary" id="btnNotebook">${t('panel.query.builder.btn.openNotebook')}</button>
    </div>
    <div class="row" style="grid-template-columns: 1fr auto auto auto; margin-top:0;">
      <span></span>
      <button class="secondary" id="btnSaveSnippet">${t('panel.query.builder.btn.saveSnippet')}</button>
      <button class="secondary" id="btnCost">${t('panel.query.builder.btn.analyzeCost')}</button>
      <button class="secondary" id="btnDashboard">${t('panel.query.builder.btn.addDashboard')}</button>
    </div>
    <div id="sqlPreview" class="sql"></div>
    <div id="validation" class="error"></div>
    <div id="queryError" class="error"></div>
    <div id="results" class="results"></div>
  </div>
</div>

<script nonce="__CSP_NONCE__">${getQueryBuilderClientJs()}</script>
</body>
</html>`;
}
