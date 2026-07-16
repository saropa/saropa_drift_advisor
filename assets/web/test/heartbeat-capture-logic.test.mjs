/**
 * Unit tests for the capture toggle's pure render/decision logic
 * (heartbeat-capture-logic.ts, Feature 80 phase 2).
 *
 * Same harness as heartbeat-heat.test.mjs: esbuild compiles the real DOM-free
 * TS module to an in-memory ESM module so the tests exercise the actual
 * exports, not a re-implementation.
 *
 * Run: `node --test assets/web/test/heartbeat-capture-logic.test.mjs`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const out = await build({
  entryPoints: [join(here, '..', 'heartbeat-capture-logic.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const mod = await import(
  'data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text)
);
const { captureUi, shouldSendLifecycleDisarm } = mod;

describe('captureUi', () => {
  it('hides the control entirely on an unsupported (older) server', () => {
    const ui = captureUi('unsupported', false, false, false);
    assert.equal(ui.visible, false);
    assert.equal(ui.live, false);
  });

  it('renders off + disabled before the first poll and under the kill switch', () => {
    for (const availability of ['unknown', 'forbidden']) {
      const ui = captureUi(availability, true, false, true);
      assert.equal(ui.visible, true, availability);
      assert.equal(ui.checked, false, availability);
      assert.equal(ui.disabled, true, availability);
      assert.equal(ui.live, false, availability);
    }
  });

  it('follows the server state when no POST is in flight', () => {
    // Server says armed while the stale local value says off: the poll wins —
    // this is the lease-expiry / other-viewer-disarmed resync path inverted.
    const on = captureUi('available', true, false, false);
    assert.deepEqual(on, { visible: true, checked: true, disabled: false, live: true });
    const off = captureUi('available', false, false, true);
    assert.equal(off.checked, false);
    assert.equal(off.live, false);
  });

  it('shows the optimistic local choice, disabled, while a POST is pending', () => {
    // In-flight disarm: toggle shows off and the live badge stops IMMEDIATELY
    // even though the server still reports armed — a pulsing "capturing"
    // badge for a hook the user just turned off would be a lie.
    const ui = captureUi('available', true, true, false);
    assert.deepEqual(ui, { visible: true, checked: false, disabled: true, live: false });
  });
});

describe('shouldSendLifecycleDisarm', () => {
  it('fires only when capture is armed on a supporting server', () => {
    assert.equal(shouldSendLifecycleDisarm('available', true), true);
    // Disarmed: a casual tab switch must not spam pointless POSTs.
    assert.equal(shouldSendLifecycleDisarm('available', false), false);
    // Unsupported/forbidden/unknown: nothing to disarm (or a 404 to avoid).
    assert.equal(shouldSendLifecycleDisarm('unsupported', true), false);
    assert.equal(shouldSendLifecycleDisarm('forbidden', true), false);
    assert.equal(shouldSendLifecycleDisarm('unknown', true), false);
  });
});
