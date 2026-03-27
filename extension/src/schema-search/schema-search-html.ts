/** Builds the HTML/CSS/JS for the schema search sidebar webview. */
import { SCHEMA_SEARCH_SCRIPT, SCHEMA_SEARCH_STYLE } from './schema-search-html-content';

export function getSchemaSearchHtml(nonce: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
${SCHEMA_SEARCH_STYLE}
</style>
</head>
<body>
<div id="connStatus" class="conn-status" style="display: none;" aria-live="polite"></div>
<div id="discLive" class="disc-live" style="display: none;" aria-live="polite">
  <div class="disc-live-title">Server discovery</div>
  <div id="discActivity" class="disc-live-line"></div>
  <div id="discOutcome" class="disc-live-outcome"></div>
  <div id="discSchedule" class="disc-live-meta"></div>
  <div class="disc-live-actions">
    <button type="button" class="linkish" id="btnPauseDisc">Pause scanning</button>
    <button type="button" class="linkish" id="btnResumeDisc">Resume scanning</button>
    <button type="button" class="linkish" id="btnScanNow">Scan now</button>
  </div>
  <div id="discFaq" class="disc-faq"></div>
</div>
<div id="disconnected" class="disconnected show" aria-live="polite">
  <div id="discTitle" class="disc-title">Not connected</div>
  <div id="discHint" class="disc-hint"></div>
  <div class="disc-actions">
    <button type="button" class="linkish" id="btnOpenLog" title="Open Saropa Drift Advisor output">Output log</button>
    <button type="button" class="linkish" id="btnRetry" title="Re-scan for Drift debug servers">Retry discovery</button>
    <button type="button" class="linkish" id="btnDiagnose" title="Run health check and log details">Diagnose</button>
    <button type="button" class="linkish" id="btnRefreshUi" title="Re-sync sidebar connection state">Refresh UI</button>
    <button type="button" class="linkish" id="btnConnHelp" title="Open connection troubleshooting in your browser">Connection help (web)</button>
  </div>
</div>
<div class="search-box">
  <input id="query" type="text" placeholder="Search schema..." disabled />
</div>
<div id="filters" class="filters disabled">
  <button class="scope-btn active" data-scope="all">All</button>
  <button class="scope-btn" data-scope="tables">Tables</button>
  <button class="scope-btn" data-scope="columns">Columns</button>
  <div class="sep"></div>
  <button class="type-btn active" data-type="">Any</button>
  <button class="type-btn" data-type="TEXT">TEXT</button>
  <button class="type-btn" data-type="INTEGER">INT</button>
  <button class="type-btn" data-type="REAL">REAL</button>
  <button class="type-btn" data-type="BLOB">BLOB</button>
</div>
<div id="browseWrap" class="browse-link disabled"><a id="browseAll" href="#">Browse all tables</a></div>
<div id="status" class="status"></div>
<div id="error" class="error" style="display: none;"></div>
<ul id="results" class="results"></ul>
<script nonce="${nonce}">
${SCHEMA_SEARCH_SCRIPT}
</script>
</body>
</html>`;
}
