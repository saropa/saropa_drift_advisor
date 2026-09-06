/**
 * Tests for DriftSourceLocatorCache — watcher-backed locator cache.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DriftSourceLocatorCache } from '../definition/drift-source-locator-cache';
import { encodeUtf8 as encode } from './source-reader-test-helpers';
import { fireWatcherChange, fireWatcherCreate, fireWatcherDelete } from './vscode-mock';

const vscodeMock = vscode as any;

describe('DriftSourceLocatorCache', () => {
  let findFilesStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;
  let cache: DriftSourceLocatorCache;

  const tableContent = 'class Users extends Table {\n}\n';

  beforeEach(() => {
    findFilesStub = sinon.stub(vscodeMock.workspace, 'findFiles');
    fsReadFileStub = sinon.stub(vscodeMock.workspace.fs, 'readFile');
    cache = new DriftSourceLocatorCache();
  });

  afterEach(() => {
    cache.dispose();
    findFilesStub.restore();
    fsReadFileStub.restore();
  });

  it('should cache table class lookups', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(tableContent));

    // First call — should trigger the full workspace walk.
    const result1 = await cache.findTableClassLocation('users');
    assert.ok(result1.location);
    assert.strictEqual(findFilesStub.callCount, 1);

    // Second call — should return cached result without another walk.
    const result2 = await cache.findTableClassLocation('users');
    assert.ok(result2.location);
    assert.strictEqual(findFilesStub.callCount, 1, 'Should use cache');
  });

  it('should cache column getter lookups', async () => {
    const content = [
      'class Users extends Table {',
      '  TextColumn get email => text()();',
      '}',
    ].join('\n');
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(content));

    const result1 = await cache.findColumnGetterLocation('email', 'users');
    assert.ok(result1.location);
    assert.strictEqual(findFilesStub.callCount, 1);

    const result2 = await cache.findColumnGetterLocation('email', 'users');
    assert.ok(result2.location);
    assert.strictEqual(findFilesStub.callCount, 1, 'Should use cache');
  });

  it('should invalidate cache on clearCache()', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(tableContent));

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 1);

    // Manual invalidation.
    cache.clearCache();

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 2, 'Should re-walk after invalidation');
  });

  it('should cache different table names independently', async () => {
    const content = [
      'class Users extends Table {}',
      'class Orders extends Table {}',
    ].join('\n');
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(content));

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 1);

    // Different table name — cache miss, new walk.
    await cache.findTableClassLocation('orders');
    assert.strictEqual(findFilesStub.callCount, 2);

    // Both should now be cached.
    await cache.findTableClassLocation('users');
    await cache.findTableClassLocation('orders');
    assert.strictEqual(findFilesStub.callCount, 2, 'Both should be cached');
  });

  it('should invalidate cache when a .dart file is created', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(tableContent));

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 1);

    // Simulate a new .dart file being created in the workspace.
    fireWatcherCreate(vscodeMock.Uri.file('/lib/new_table.dart'));

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 2, 'Should re-walk after watcher create event');
  });

  it('should invalidate cache when a .dart file is changed', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(tableContent));

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 1);

    // Simulate an existing .dart file being modified.
    fireWatcherChange(fileUri);

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 2, 'Should re-walk after watcher change event');
  });

  it('should invalidate cache when a .dart file is deleted', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(tableContent));

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 1);

    // Simulate a .dart file being removed from the workspace.
    fireWatcherDelete(fileUri);

    await cache.findTableClassLocation('users');
    assert.strictEqual(findFilesStub.callCount, 2, 'Should re-walk after watcher delete event');
  });
});
