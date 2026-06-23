/**
 * Tests for scopeCss — the transform that lets the Drift Tools Hub embed two
 * panels' stylesheets in one document without their bare selectors colliding.
 * The contract that matters: no-scope is identity (standalone panels unchanged),
 * and every rule is confined to the scope when one is given.
 */

import * as assert from 'assert';
import { scopeCss } from '../webview-scope-css';

describe('scopeCss', () => {
  it('returns the input unchanged when no scope is given (standalone path)', () => {
    const css = 'body { margin: 0; } .btn { padding: 4px; }';
    assert.strictEqual(scopeCss(css), css);
    assert.strictEqual(scopeCss(css, ''), css);
  });

  it('maps root selectors (body/html/:root) to the scope element itself', () => {
    const out = scopeCss('body { margin: 0; }', '.pane');
    assert.ok(out.includes('.pane{'), `expected .pane root rule, got: ${out}`);
    assert.ok(!/\bbody\b/.test(out), `body should be rewritten away, got: ${out}`);
  });

  it('prefixes class selectors as descendants of the scope', () => {
    const out = scopeCss('.btn { padding: 4px; }', '.pane');
    assert.ok(out.includes('.pane .btn{'), out);
  });

  it('scopes every selector in a comma list independently', () => {
    const out = scopeCss('.a, .b { color: red; }', '.pane');
    assert.ok(out.includes('.pane .a, .pane .b{'), out);
  });

  it('preserves attribute and pseudo selectors', () => {
    const out = scopeCss('.card[data-command]:hover { border: 1px; }', '.pane');
    assert.ok(out.includes('.pane .card[data-command]:hover{'), out);
  });

  it('recurses into @media but leaves @keyframes names intact', () => {
    const media = scopeCss('@media (max-width: 800px) { .x { width: 10px; } }', '.pane');
    assert.ok(media.includes('@media (max-width: 800px){'), media);
    assert.ok(media.includes('.pane .x{'), media);

    const keyframes = scopeCss('@keyframes spin { to { transform: rotate(360deg); } }', '.pane');
    assert.ok(keyframes.includes('@keyframes spin{'), keyframes);
    assert.ok(!keyframes.includes('.pane to'), `keyframe steps must not be scoped: ${keyframes}`);
  });

  it('keeps two panels from colliding on a shared selector', () => {
    const health = scopeCss('.btn { padding: 4px; }', '.pane-health');
    const dashboard = scopeCss('.btn { padding: 6px; }', '.pane-dashboard');
    // Same bare selector, now disjoint — neither can override the other.
    assert.ok(health.includes('.pane-health .btn{'));
    assert.ok(dashboard.includes('.pane-dashboard .btn{'));
    assert.ok(!health.includes('.pane-dashboard'));
  });
});
