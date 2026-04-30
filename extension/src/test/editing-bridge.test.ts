import * as assert from 'assert';
import type { TableMetadata } from '../api-types';
import { ChangeTracker } from '../editing/change-tracker';
import { EditingBridge } from '../editing/editing-bridge';
import { messageMock, MockOutputChannel, resetMocks } from './vscode-mock';

/** Minimal schema so cell edits are validated like in production. */
function mockSchema(): Promise<TableMetadata[]> {
  return Promise.resolve([
    {
      name: 'users',
      rowCount: 0,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'name', type: 'TEXT', pk: false, notnull: false },
        { name: 'age', type: 'INTEGER', pk: false, notnull: false },
      ],
    },
    {
      name: 'posts',
      rowCount: 0,
      columns: [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'title', type: 'TEXT', pk: false, notnull: false },
      ],
    },
  ]);
}

/** Schema with a composite PK table to verify v1 guard behavior. */
function compositePkSchema(): Promise<TableMetadata[]> {
  return Promise.resolve([
    {
      name: 'memberships',
      rowCount: 0,
      columns: [
        { name: 'org_id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'user_id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'role', type: 'TEXT', pk: false, notnull: false },
      ],
    },
  ]);
}

describe('EditingBridge', () => {
  let tracker: ChangeTracker;
  let bridge: EditingBridge;

  beforeEach(() => {
    resetMocks();
    tracker = new ChangeTracker(new MockOutputChannel() as never);
    bridge = new EditingBridge(tracker, mockSchema);
  });

  afterEach(() => {
    bridge.dispose();
    tracker.dispose();
  });

  it('should handle cellEdit messages', async () => {
    const handled = bridge.handleMessage({
      command: 'cellEdit',
      table: 'users',
      pkColumn: 'id',
      pkValue: 42,
      column: 'name',
      oldValue: 'Alice',
      newValue: 'Bob',
    });
    assert.ok(handled);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(tracker.changeCount, 1);
    assert.strictEqual(tracker.changes[0].kind, 'cell');
  });

  it('should reject cellEdit when pkColumn is blank', async () => {
    const handled = bridge.handleMessage({
      command: 'cellEdit',
      table: 'users',
      pkColumn: '   ',
      pkValue: 42,
      column: 'name',
      oldValue: 'Alice',
      newValue: 'Bob',
    });
    assert.ok(handled);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(tracker.changeCount, 0);
    assert.strictEqual(messageMock.warnings.length, 1);
    assert.ok(messageMock.warnings[0].includes('row identity'));
  });

  it('should not record invalid cell values when schema is available', async () => {
    const handled = bridge.handleMessage({
      command: 'cellEdit',
      table: 'users',
      pkColumn: 'id',
      pkValue: 1,
      column: 'age',
      oldValue: 20,
      newValue: 'not-a-number',
    });
    assert.ok(handled);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(tracker.changeCount, 0);
  });

  it('should reject cellEdit for composite primary key tables', async () => {
    const compositeBridge = new EditingBridge(tracker, compositePkSchema);
    const handled = compositeBridge.handleMessage({
      command: 'cellEdit',
      table: 'memberships',
      pkColumn: 'org_id',
      pkValue: 1,
      column: 'role',
      oldValue: 'viewer',
      newValue: 'admin',
    });
    assert.ok(handled);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(tracker.changeCount, 0);
    assert.strictEqual(messageMock.warnings.length, 1);
    assert.ok(messageMock.warnings[0].includes('composite primary key'));
    compositeBridge.dispose();
  });

  it('should handle rowDelete messages', async () => {
    const handled = bridge.handleMessage({
      command: 'rowDelete',
      table: 'users',
      pkColumn: 'id',
      pkValue: 99,
    });
    assert.ok(handled);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(tracker.changeCount, 1);
    assert.strictEqual(tracker.changes[0].kind, 'delete');
  });

  it('should reject rowDelete when pkColumn is blank', () => {
    const handled = bridge.handleMessage({
      command: 'rowDelete',
      table: 'users',
      pkColumn: '',
      pkValue: 99,
    });
    assert.ok(handled);
    assert.strictEqual(tracker.changeCount, 0);
    assert.strictEqual(messageMock.warnings.length, 1);
    assert.ok(messageMock.warnings[0].includes('row identity'));
  });

  it('should reject rowDelete for composite primary key tables', async () => {
    const compositeBridge = new EditingBridge(tracker, compositePkSchema);
    const handled = compositeBridge.handleMessage({
      command: 'rowDelete',
      table: 'memberships',
      pkColumn: 'org_id',
      pkValue: 1,
    });
    assert.ok(handled);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(tracker.changeCount, 0);
    assert.strictEqual(messageMock.warnings.length, 1);
    assert.ok(messageMock.warnings[0].includes('composite primary key'));
    compositeBridge.dispose();
  });

  it('should handle rowInsert messages', async () => {
    const handled = bridge.handleMessage({
      command: 'rowInsert',
      table: 'posts',
      values: { title: 'Hello' },
    });
    assert.ok(handled);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(tracker.changeCount, 1);
    assert.strictEqual(tracker.changes[0].kind, 'insert');
  });

  it('should handle undo messages', () => {
    tracker.addRowDelete('users', 'id', 1);
    bridge.handleMessage({ command: 'undo' });
    assert.strictEqual(tracker.changeCount, 0);
  });

  it('should handle redo messages', () => {
    tracker.addRowDelete('users', 'id', 1);
    tracker.undo();
    bridge.handleMessage({ command: 'redo' });
    assert.strictEqual(tracker.changeCount, 1);
  });

  it('should handle discardAll messages', () => {
    tracker.addRowDelete('users', 'id', 1);
    bridge.handleMessage({ command: 'discardAll' });
    assert.strictEqual(tracker.changeCount, 0);
  });

  it('should return false for unknown messages', () => {
    assert.ok(!bridge.handleMessage({ command: 'retry' }));
    assert.ok(!bridge.handleMessage({ command: 'unknown' }));
    assert.ok(!bridge.handleMessage(null));
    assert.ok(!bridge.handleMessage('not an object'));
    assert.ok(!bridge.handleMessage(42));
  });

  it('should sync state to attached webview', () => {
    const posted: unknown[] = [];
    const fakeWebview = {
      postMessage: (msg: unknown) => { posted.push(msg); },
    };
    bridge.attach(fakeWebview as never);

    tracker.addRowDelete('users', 'id', 1);

    assert.strictEqual(posted.length, 1);
    const msg = posted[0] as { command: string; changes: unknown[] };
    assert.strictEqual(msg.command, 'pendingChanges');
    assert.strictEqual(msg.changes.length, 1);
  });

  it('should not sync when no webview attached', () => {
    // Should not throw
    tracker.addRowDelete('users', 'id', 1);
    assert.strictEqual(tracker.changeCount, 1);
  });

  it('should stop syncing after detach', () => {
    const posted: unknown[] = [];
    const fakeWebview = {
      postMessage: (msg: unknown) => { posted.push(msg); },
    };
    bridge.attach(fakeWebview as never);
    bridge.detach();

    tracker.addRowDelete('users', 'id', 1);
    assert.strictEqual(posted.length, 0);
  });

  it('should provide injected script as non-empty string', () => {
    const script = EditingBridge.injectedScript();
    assert.ok(typeof script === 'string');
    assert.ok(script.length > 100);
    assert.ok(script.includes('acquireVsCodeApi'));
    assert.ok(script.includes('cellEdit'));
  });

  // --- Notification message content ---

  it('rejected cell edit warning should not include extension name prefix', async () => {
    // Trigger a validation failure: 'age' column expects a number
    bridge.handleMessage({
      command: 'cellEdit',
      table: 'users',
      pkColumn: 'id',
      pkValue: 1,
      column: 'age',
      oldValue: 20,
      newValue: 'not-a-number',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    // A warning should have been shown, without the product name prefix
    assert.strictEqual(messageMock.warnings.length, 1);
    assert.ok(
      !messageMock.warnings[0].startsWith('Saropa'),
      `Warning should not start with product name, got: "${messageMock.warnings[0]}"`,
    );
  });

  it('rejected row insert warning should not include extension name prefix', async () => {
    // Build a schema with a NOT NULL INTEGER column to trigger validation
    // failure (TEXT NOT NULL accepts empty string, so INTEGER is needed)
    const strictSchema: TableMetadata[] = [
      {
        name: 'items',
        rowCount: 0,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'quantity', type: 'INTEGER', pk: false, notnull: true },
        ],
      },
    ];
    const strictBridge = new EditingBridge(
      tracker,
      () => Promise.resolve(strictSchema),
    );

    // Insert a row missing the required 'quantity' column (null → fails NOT NULL)
    strictBridge.handleMessage({
      command: 'rowInsert',
      table: 'items',
      values: {},
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(messageMock.warnings.length, 1);
    assert.ok(
      !messageMock.warnings[0].startsWith('Saropa'),
      `Warning should not start with product name, got: "${messageMock.warnings[0]}"`,
    );
    strictBridge.dispose();
  });

  it('schema-load error should produce error message without extension name prefix', async () => {
    // Bridge with a schema loader that always throws
    const failBridge = new EditingBridge(
      tracker,
      () => Promise.reject(new Error('db locked')),
    );

    failBridge.handleMessage({
      command: 'cellEdit',
      table: 'users',
      pkColumn: 'id',
      pkValue: 1,
      column: 'name',
      oldValue: 'A',
      newValue: 'B',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(messageMock.errors.length, 1);
    assert.ok(
      !messageMock.errors[0].startsWith('Saropa'),
      `Error should not start with product name, got: "${messageMock.errors[0]}"`,
    );
    // Verify the underlying error detail is still present
    assert.ok(
      messageMock.errors[0].includes('db locked'),
      'Error message should contain the original error detail',
    );
    failBridge.dispose();
  });

  it('row insert schema-load error should not include extension name prefix', async () => {
    const failBridge = new EditingBridge(
      tracker,
      () => Promise.reject(new Error('connection reset')),
    );

    failBridge.handleMessage({
      command: 'rowInsert',
      table: 'users',
      values: { name: 'Test' },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(messageMock.errors.length, 1);
    assert.ok(
      !messageMock.errors[0].startsWith('Saropa'),
      `Error should not start with product name, got: "${messageMock.errors[0]}"`,
    );
    assert.ok(
      messageMock.errors[0].includes('connection reset'),
      'Error message should contain the original error detail',
    );
    failBridge.dispose();
  });
});
