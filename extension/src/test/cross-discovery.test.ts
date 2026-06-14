/**
 * Tests for the suite cross-discovery nudge (plan 67 Phase 6).
 *
 * The selection logic is pure (pubspec parse + installed/gated predicates); the
 * IO entry point is smoke-tested for no-throw against the shared vscode mock.
 */
import * as assert from 'assert';
import {
  maybeRecommendSuiteTools,
  pubspecDeclaresPackage,
  recommendableSiblings,
} from '../suite/cross-discovery';

const PUBSPEC = `name: my_app
dependencies:
  drift: ^2.0.0
  saropa_lints: ^1.2.0
dev_dependencies:
  saropa_log_capture: ^0.5.0
`;

describe('pubspecDeclaresPackage', () => {
  it('matches a dependency entry', () => {
    assert.strictEqual(pubspecDeclaresPackage(PUBSPEC, 'saropa_lints'), true);
    assert.strictEqual(pubspecDeclaresPackage(PUBSPEC, 'saropa_log_capture'), true);
  });

  it('does not match an absent package', () => {
    assert.strictEqual(pubspecDeclaresPackage(PUBSPEC, 'saropa_kykto'), false);
  });

  it('does not false-positive on a longer package name with the same prefix', () => {
    assert.strictEqual(
      pubspecDeclaresPackage('  saropa_lints_extra: ^1.0.0\n', 'saropa_lints'),
      false,
    );
  });

  it('does not match a bare mention in a comment (no colon)', () => {
    assert.strictEqual(
      pubspecDeclaresPackage('  # consider saropa_lints later\n', 'saropa_lints'),
      false,
    );
  });
});

describe('recommendableSiblings', () => {
  const none = (): boolean => false;

  it('recommends a declared package whose extension is absent and ungated', () => {
    const out = recommendableSiblings(PUBSPEC, none, none);
    assert.deepStrictEqual(
      out.map((s) => s.extensionId).sort(),
      ['saropa.saropa-lints', 'saropa.saropa-log-capture'],
    );
  });

  it('skips a tool whose extension is already installed', () => {
    const out = recommendableSiblings(
      PUBSPEC,
      (id) => id === 'saropa.saropa-lints', // Lints installed
      none,
    );
    assert.deepStrictEqual(out.map((s) => s.extensionId), ['saropa.saropa-log-capture']);
  });

  it('skips a tool already offered (gated)', () => {
    const out = recommendableSiblings(
      PUBSPEC,
      none,
      (key) => key === 'suite.crossRecommend.saropa-log-capture', // already offered
    );
    assert.deepStrictEqual(out.map((s) => s.extensionId), ['saropa.saropa-lints']);
  });

  it('recommends nothing when the packages are not used', () => {
    assert.deepStrictEqual(recommendableSiblings('name: bare\n', none, none), []);
  });
});

describe('maybeRecommendSuiteTools', () => {
  it('does not throw against the test host', async () => {
    const ctx = {
      globalState: {
        get: () => undefined,
        update: async () => { /* no-op */ },
      },
    } as unknown as import('vscode').ExtensionContext;
    await assert.doesNotReject(maybeRecommendSuiteTools(ctx));
  });
});
