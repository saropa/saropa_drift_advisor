/**
 * Tests for DiskBackedMemento — vscode.Memento backed by JSON files on disk.
 * Covers read/write, default values, key removal, persistence across instances,
 * corrupt file handling, and the keys() accessor.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DiskBackedMemento } from '../storage/disk-backed-memento';

/** Create a fresh temp directory for each test. */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dbm-test-'));
}

/** Remove a directory and its contents. */
function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('DiskBackedMemento', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('should return defaultValue for missing keys', () => {
    const m = new DiskBackedMemento(dir);
    // Explicit default supplied.
    assert.strictEqual(m.get('missing', 42), 42);
    // No default — returns undefined.
    assert.strictEqual(m.get('missing'), undefined);
  });

  it('should store and retrieve a value', async () => {
    const m = new DiskBackedMemento(dir);
    await m.update('key1', { hello: 'world' });
    // In-memory read should return the value immediately.
    assert.deepStrictEqual(m.get('key1'), { hello: 'world' });
  });

  it('should persist to disk and survive a new instance', async () => {
    const m1 = new DiskBackedMemento(dir);
    await m1.update('persist', [1, 2, 3]);

    // New instance warms cache from disk.
    const m2 = new DiskBackedMemento(dir);
    assert.deepStrictEqual(m2.get('persist'), [1, 2, 3]);
  });

  it('should remove a key when set to undefined', async () => {
    const m = new DiskBackedMemento(dir);
    await m.update('temp', 'present');
    assert.strictEqual(m.get('temp'), 'present');

    // Setting undefined removes the key.
    await m.update('temp', undefined);
    assert.strictEqual(m.get('temp'), undefined);
    assert.ok(!m.keys().includes('temp'));

    // File should also be removed from disk.
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.strictEqual(files.length, 0);
  });

  it('should list all stored keys', async () => {
    const m = new DiskBackedMemento(dir);
    await m.update('a', 1);
    await m.update('b', 2);
    await m.update('c', 3);
    const keys = m.keys();
    assert.deepStrictEqual([...keys].sort(), ['a', 'b', 'c']);
  });

  it('should handle corrupt files gracefully', async () => {
    // Write a valid file first.
    const m1 = new DiskBackedMemento(dir);
    await m1.update('good', 'data');

    // Manually write a corrupt JSON file.
    fs.writeFileSync(path.join(dir, 'corrupt.json'), 'not-json{{{', 'utf-8');

    // New instance should load the good file and skip the corrupt one.
    const m2 = new DiskBackedMemento(dir);
    assert.strictEqual(m2.get('good'), 'data');
    // Corrupt file should not appear in keys.
    assert.ok(!m2.keys().includes('corrupt'));
  });

  it('should handle keys with special characters', async () => {
    const m = new DiskBackedMemento(dir);
    const key = 'driftViewer.analysisHistory.indexSuggestions';
    await m.update(key, { items: [1, 2] });

    // Survives round-trip through a new instance.
    const m2 = new DiskBackedMemento(dir);
    assert.deepStrictEqual(m2.get(key), { items: [1, 2] });
  });

  it('should create storage directory if it does not exist', () => {
    const nested = path.join(dir, 'deep', 'nested', 'dir');
    // Constructor should create the directory.
    const m = new DiskBackedMemento(nested);
    assert.ok(fs.existsSync(nested));
    assert.deepStrictEqual(m.keys(), []);
  });

  it('should overwrite existing values', async () => {
    const m = new DiskBackedMemento(dir);
    await m.update('k', 'v1');
    await m.update('k', 'v2');
    assert.strictEqual(m.get('k'), 'v2');

    // Disk should also reflect the latest value.
    const m2 = new DiskBackedMemento(dir);
    assert.strictEqual(m2.get('k'), 'v2');
  });
});
