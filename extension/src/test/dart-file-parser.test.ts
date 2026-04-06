/**
 * Tests for isDriftProject — determines whether a pubspec.yaml declares
 * a Drift dependency.
 *
 * Extracted from dart-parser-tables.test.ts because isDriftProject lives
 * in the diagnostics layer (dart-file-parser), not the schema-diff layer.
 */
import * as assert from 'assert';
import { isDriftProject } from '../diagnostics/dart-file-parser';

describe('isDriftProject', () => {
  it('should detect drift dependency', () => {
    const pubspec = 'dependencies:\n  drift: ^2.14.0\n';
    assert.strictEqual(isDriftProject(pubspec), true);
  });

  it('should detect saropa_drift_advisor dependency', () => {
    const pubspec = 'dev_dependencies:\n  saropa_drift_advisor: ^2.17.0\n';
    assert.strictEqual(isDriftProject(pubspec), true);
  });

  it('should return false for non-Drift projects', () => {
    const pubspec = 'dependencies:\n  flutter:\n    sdk: flutter\n  provider: ^6.0.0\n';
    assert.strictEqual(isDriftProject(pubspec), false);
  });

  it('should not match drift_dev or drift_sqflite alone', () => {
    // /\bdrift\s*:/ requires `drift` followed by optional whitespace then `:`.
    // In `drift_dev:`, after `drift` comes `_` — not whitespace or `:` — so
    // having only drift_dev does not make this a Drift project.
    const pubspec = 'dev_dependencies:\n  drift_dev: ^2.14.0\n';
    assert.strictEqual(isDriftProject(pubspec), false);
  });

  it('should return false for empty pubspec', () => {
    assert.strictEqual(isDriftProject(''), false);
  });
});
