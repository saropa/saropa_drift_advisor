/**
 * Tests for workspace-setup add-package: pubspec dependency insertion.
 */

import * as assert from 'assert';
import {
  addPackageToPubspec,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  extractPackageVersion,
  parseMinVersion,
  isVersionOlder,
} from '../workspace-setup/add-package';

describe('addPackageToPubspec', () => {
  it('should return unmodified when package already in dependencies', () => {
    const content = `name: my_app
dependencies:
  saropa_drift_advisor: ^1.3.0
  flutter:
    sdk: flutter
`;
    const result = addPackageToPubspec(content);
    assert.strictEqual(result.modified, false);
    assert.strictEqual(result.content, content);
  });

  it('should return unmodified when package in dev_dependencies', () => {
    const content = `name: my_app
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  saropa_drift_advisor: ^0.3.0
`;
    const result = addPackageToPubspec(content);
    assert.strictEqual(result.modified, false);
    assert.strictEqual(result.content, content);
  });

  it('should insert package after dependencies header', () => {
    const content = `name: my_app
dependencies:
  flutter:
    sdk: flutter
`;
    const result = addPackageToPubspec(content);
    assert.strictEqual(result.modified, true);
    assert.ok(result.content.includes(`${PACKAGE_NAME}: ${PACKAGE_VERSION}`));
    assert.ok(result.content.includes('flutter:'));
    const lineAfterDeps = result.content.split('\n').findIndex((l) => l.trim().startsWith('saropa_drift_advisor'));
    const flutterLine = result.content.split('\n').findIndex((l) => l.trim().startsWith('flutter:'));
    assert.ok(lineAfterDeps >= 0 && flutterLine >= 0 && lineAfterDeps < flutterLine, 'saropa_drift_advisor should appear before flutter');
  });

  it('should throw when no dependencies section', () => {
    const content = `name: my_app
environment:
  sdk: ">=3.0.0"
`;
    assert.throws(
      () => addPackageToPubspec(content),
      /no dependencies section/,
    );
  });
});

// ── extractPackageVersion ──────────────────────────────────────────────

describe('extractPackageVersion', () => {
  it('should extract caret constraint', () => {
    const content = 'dependencies:\n  saropa_drift_advisor: ^1.6.1\n';
    assert.strictEqual(extractPackageVersion(content), '^1.6.1');
  });

  it('should extract plain version', () => {
    const content = 'dependencies:\n  saropa_drift_advisor: 1.6.1\n';
    assert.strictEqual(extractPackageVersion(content), '1.6.1');
  });

  it('should extract range constraint in quotes', () => {
    const content = 'dependencies:\n  saropa_drift_advisor: ">=1.5.0 <2.0.0"\n';
    assert.strictEqual(extractPackageVersion(content), '>=1.5.0 <2.0.0');
  });

  it('should return null for path dependency', () => {
    const content = 'dependencies:\n  saropa_drift_advisor:\n    path: ../local\n';
    assert.strictEqual(extractPackageVersion(content), null);
  });

  it('should return null for git dependency', () => {
    const content = 'dependencies:\n  saropa_drift_advisor:\n    git:\n      url: https://example.com\n';
    assert.strictEqual(extractPackageVersion(content), null);
  });

  it('should return null when package absent', () => {
    const content = 'dependencies:\n  flutter:\n    sdk: flutter\n';
    assert.strictEqual(extractPackageVersion(content), null);
  });
});

// ── parseMinVersion ────────────────────────────────────────────────────

describe('parseMinVersion', () => {
  it('should parse caret constraint', () => {
    assert.strictEqual(parseMinVersion('^1.6.1'), '1.6.1');
  });

  it('should parse range constraint', () => {
    assert.strictEqual(parseMinVersion('>=1.5.0 <2.0.0'), '1.5.0');
  });

  it('should parse plain version', () => {
    assert.strictEqual(parseMinVersion('1.6.1'), '1.6.1');
  });

  it('should return null for garbage input', () => {
    assert.strictEqual(parseMinVersion('any'), null);
  });
});

// ── isVersionOlder ─────────────────────────────────────────────────────

describe('isVersionOlder', () => {
  it('should detect older major', () => {
    assert.strictEqual(isVersionOlder('0.9.0', '1.0.0'), true);
  });

  it('should detect older minor', () => {
    assert.strictEqual(isVersionOlder('1.5.0', '1.6.0'), true);
  });

  it('should detect older patch', () => {
    assert.strictEqual(isVersionOlder('1.6.0', '1.6.1'), true);
  });

  it('should return false for equal versions', () => {
    assert.strictEqual(isVersionOlder('1.6.1', '1.6.1'), false);
  });

  it('should return false for newer version', () => {
    assert.strictEqual(isVersionOlder('1.6.2', '1.6.1'), false);
  });

  it('should return false for invalid input', () => {
    assert.strictEqual(isVersionOlder('bad', '1.0.0'), false);
  });
});
