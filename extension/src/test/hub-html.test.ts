/**
 * Tests for the Drift Tools Hub composition contract. The hub assembles two
 * read-only panes plus a launcher grid into ONE document; the invariants that
 * keep it from breaking are: both panes present, pane styles scoped, exactly one
 * script (so acquireVsCodeApi is called once), every tile wired, and a failed
 * pane isolated to a placeholder without blanking the other.
 */

import * as assert from 'assert';
import { buildHubDocument, buildHubLoadingShell, type PaneRender } from '../hub/hub-html';
import { HUB_GROUPS, allHubTiles } from '../hub/hub-tiles';

const okPane = (marker: string): PaneRender => ({
  ok: true,
  body: `<div class="pane-marker">${marker}</div>`,
  style: `.pane-${marker} .btn{padding:4px;}`,
});

describe('buildHubDocument', () => {
  it('includes both pane bodies and both scoped styles', () => {
    const html = buildHubDocument(okPane('dashboard'), okPane('health'));
    assert.ok(html.includes('pane-dashboard'), 'dashboard scope class present');
    assert.ok(html.includes('pane-health'), 'health scope class present');
    assert.ok(html.includes('.pane-dashboard .btn{'), 'dashboard style scoped');
    assert.ok(html.includes('.pane-health .btn{'), 'health style scoped');
  });

  it('emits exactly one script tag so acquireVsCodeApi is called once', () => {
    const html = buildHubDocument(okPane('dashboard'), okPane('health'));
    const scripts = html.match(/<script/g) ?? [];
    assert.strictEqual(scripts.length, 1, `expected 1 script, got ${scripts.length}`);
    assert.ok(html.includes('acquireVsCodeApi()'));
  });

  it('wires every launcher tile across all groups with its command id', () => {
    const html = buildHubDocument(okPane('dashboard'), okPane('health'));
    for (const tile of allHubTiles()) {
      assert.ok(html.includes(`data-cmd-id="${tile.id}"`), `tile missing: ${tile.id}`);
    }
  });

  it('puts a primary "Open Database Browser" action in the hero wired to openInBrowser', () => {
    // Discoverability fix: the live web viewer was only reachable from a
    // buried menu entry. The hero must carry a primary CTA that routes through
    // the validated runCommand path to driftViewer.openInBrowser.
    const html = buildHubDocument(okPane('dashboard'), okPane('health'));
    assert.ok(
      html.includes('class="hub-btn primary" data-hub-cmd="runCommand" data-cmd-id="driftViewer.openInBrowser"'),
      'hero missing the primary Open Database Browser button',
    );
  });

  it('renders one collapsible <details> section per category group', () => {
    const html = buildHubDocument(okPane('dashboard'), okPane('health'));
    const details = html.match(/<details class="hub-group"/g) ?? [];
    assert.strictEqual(details.length, HUB_GROUPS.length);
  });

  it('only the Clear All Tables tile carries the danger accent', () => {
    const html = buildHubDocument(okPane('dashboard'), okPane('health'));
    const danger = html.match(/launcher-tile danger/g) ?? [];
    assert.strictEqual(danger.length, 1);
    assert.ok(html.includes('data-cmd-id="driftViewer.clearAllTables"'));
  });

  it('isolates a failed pane to a placeholder without blanking the other', () => {
    const html = buildHubDocument({ ok: false }, okPane('health'));
    assert.ok(html.includes('pane-failed'), 'failed placeholder present');
    assert.ok(html.includes('pane-health'), 'the other pane still renders');
    // A failed pane contributes no stylesheet.
    assert.ok(!html.includes('.pane-dashboard .btn{'), 'no style from failed pane');
  });
});

describe('buildHubLoadingShell', () => {
  it('renders the full grouped launcher immediately (usable before scans finish)', () => {
    const shell = buildHubLoadingShell();
    assert.ok(shell.includes('launcher-grid'));
    assert.ok(shell.includes(`data-cmd-id="${allHubTiles()[0].id}"`));
    const details = shell.match(/<details class="hub-group"/g) ?? [];
    assert.strictEqual(details.length, HUB_GROUPS.length);
  });
});
