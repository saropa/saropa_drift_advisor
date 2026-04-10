/**
 * Tests for isDriftProject — determines whether a pubspec.yaml declares
 * a Drift dependency.
 *
 * Extracted from dart-parser-tables.test.ts because isDriftProject lives
 * in the diagnostics layer (dart-file-parser), not the schema-diff layer.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Uri, workspace } from './vscode-mock';
import { isDriftProject, workspaceUsesDrift } from '../diagnostics/dart-file-parser';

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

describe('workspaceUsesDrift', () => {
  let fsReadStub: sinon.SinonStub;

  beforeEach(() => {
    fsReadStub = sinon.stub(workspace.fs, 'readFile');
  });

  afterEach(() => {
    fsReadStub.restore();
    (workspace as any).workspaceFolders = undefined;
  });

  it('should return true when pubspec declares drift dependency', async () => {
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///project'), name: 'project', index: 0 },
    ];
    fsReadStub.resolves(
      new TextEncoder().encode('dependencies:\n  drift: ^2.14.0\n'),
    );

    assert.strictEqual(await workspaceUsesDrift(), true);
  });

  it('should return false when pubspec has no drift dependency', async () => {
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///project'), name: 'project', index: 0 },
    ];
    fsReadStub.resolves(
      new TextEncoder().encode('dependencies:\n  provider: ^6.0.0\n'),
    );

    assert.strictEqual(await workspaceUsesDrift(), false);
  });

  it('should return false when pubspec.yaml is missing', async () => {
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///project'), name: 'project', index: 0 },
    ];
    fsReadStub.rejects(new Error('file not found'));

    assert.strictEqual(await workspaceUsesDrift(), false);
  });

  it('should return false when no workspace folders exist', async () => {
    (workspace as any).workspaceFolders = undefined;

    // fs.readFile should never be called — no workspace to read from
    assert.strictEqual(await workspaceUsesDrift(), false);
    assert.strictEqual(fsReadStub.callCount, 0);
  });
});
