/**
 * Tests for the Drift Tools Hub composition contract. The hub assembles two
 * read-only panes plus a launcher grid into ONE document; the invariants that
 * keep it from breaking are: both panes present, pane styles scoped, exactly one
 * script (so acquireVsCodeApi is called once), every tile wired, and a failed
 * pane isolated to a placeholder without blanking the other.
 */

import * as assert from 'assert';
import { buildHubDocument, buildHubLoadingShell, HUB_TILES, type PaneRender } from '../hub/hub-html';

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

  it('wires every launcher tile with its command id', () => {
    const html = buildHubDocument(okPane('dashboard'), okPane('health'));
    for (const tile of HUB_TILES) {
      assert.ok(html.includes(`data-cmd-id="${tile.id}"`), `tile missing: ${tile.id}`);
    }
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
  it('renders the launcher grid immediately (usable before scans finish)', () => {
    const shell = buildHubLoadingShell();
    assert.ok(shell.includes('launcher-grid'));
    assert.ok(shell.includes(`data-cmd-id="${HUB_TILES[0].id}"`));
  });
});
