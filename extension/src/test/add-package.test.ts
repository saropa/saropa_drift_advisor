/**
 * Tests for workspace-setup add-package: pubspec dependency insertion.
 */

import * as assert from 'assert';
import { addPackageToPubspec } from '../workspace-setup/add-package';

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
    assert.ok(result.content.includes('saropa_drift_advisor: ^0.3.0'));
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
