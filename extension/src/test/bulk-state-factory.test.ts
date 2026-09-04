/**
 * Tests for createBulkState — the one-time migration from workspaceState to
 * the disk-backed bulk store (bug 086). Covers: migration moves heavy keys,
 * migration is idempotent (sentinel), fallback when storageUri is missing,
 * and the per-key size warning that catches bloat outside HEAVY_KEYS.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createBulkState } from '../storage/bulk-state-factory';
import { MockMemento, MockOutputChannel, Uri } from './vscode-mock-classes';

/** Create a fresh temp directory for each test. */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-state-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Minimal ExtensionContext stub — only the fields createBulkState reads. */
function makeContext(storageDir: string | undefined, workspaceState: MockMemento) {
  return {
    storageUri: storageDir ? Uri.file(storageDir) : undefined,
    globalStorageUri: undefined,
    workspaceState,
  } as unknown as import('vscode').ExtensionContext;
}

describe('createBulkState (migration)', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('should migrate a heavy key from workspaceState to the disk-backed store', async () => {
    const ws = new MockMemento();
    await ws.update('driftViewer.branches', [{ id: 'b1', rows: [1, 2, 3] }]);
    const log = new MockOutputChannel();
    const context = makeContext(dir, ws);

    const bulkState = createBulkState(context, log);
    // Synchronous seed — data visible immediately, before disk flush finishes.
    assert.deepStrictEqual(bulkState.get('driftViewer.branches'), [{ id: 'b1', rows: [1, 2, 3] }]);

    // Wait a tick for the async flush to complete.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // workspaceState should have the key cleared and the sentinel set.
    assert.strictEqual(ws.get('driftViewer.branches'), undefined);
    assert.strictEqual(ws.get<boolean>('driftViewer.bulkState.migrated'), true);
  });

  it('should not re-migrate once the sentinel is set', () => {
    const ws = new MockMemento();
    void ws.update('driftViewer.bulkState.migrated', true);
    void ws.update('driftViewer.branches', ['should stay']);
    const log = new MockOutputChannel();
    const context = makeContext(dir, ws);

    createBulkState(context, log);

    // Migration skipped — key untouched in workspaceState, not seeded to disk store.
    assert.deepStrictEqual(ws.get('driftViewer.branches'), ['should stay']);
  });

  it('should fall back to workspaceState when storageUri is unavailable', () => {
    const ws = new MockMemento();
    const log = new MockOutputChannel();
    const context = makeContext(undefined, ws);

    const result = createBulkState(context, log);
    assert.strictEqual(result, ws);
  });

  it('should warn about a large key outside HEAVY_KEYS after migration', async () => {
    const ws = new MockMemento();
    // Not a HEAVY_KEYS entry — simulates a new store nobody added to the list.
    await ws.update('someNewFeature.cache', 'x'.repeat(60 * 1024));
    void ws.update('driftViewer.bulkState.migrated', true);
    const log = new MockOutputChannel();
    const context = makeContext(dir, ws);

    createBulkState(context, log);

    assert.ok(
      log.lines.some((l) => l.includes('someNewFeature.cache') && l.includes('WARNING')),
      'expected a per-key size warning for the untracked large key',
    );
  });
});
