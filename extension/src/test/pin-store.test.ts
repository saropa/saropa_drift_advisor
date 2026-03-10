import * as assert from 'assert';
import * as sinon from 'sinon';
import { MockMemento } from './vscode-mock';
import { PinStore } from '../tree/pin-store';

describe('PinStore', () => {
  let state: MockMemento;
  let store: PinStore;

  beforeEach(() => {
    state = new MockMemento();
    store = new PinStore(state);
  });

  afterEach(() => {
    store.dispose();
  });

  it('should start with no pinned tables', () => {
    assert.strictEqual(store.pinnedNames.size, 0);
    assert.strictEqual(store.isPinned('users'), false);
  });

  it('should pin a table', async () => {
    await store.pin('users');
    assert.strictEqual(store.isPinned('users'), true);
    assert.strictEqual(store.pinnedNames.size, 1);
  });

  it('should unpin a table', async () => {
    await store.pin('users');
    await store.unpin('users');
    assert.strictEqual(store.isPinned('users'), false);
    assert.strictEqual(store.pinnedNames.size, 0);
  });

  it('should persist across store re-creation', async () => {
    await store.pin('users');
    await store.pin('orders');

    const store2 = new PinStore(state);
    assert.strictEqual(store2.isPinned('users'), true);
    assert.strictEqual(store2.isPinned('orders'), true);
    assert.strictEqual(store2.pinnedNames.size, 2);
    store2.dispose();
  });

  it('should handle duplicate pin idempotently', async () => {
    await store.pin('users');
    await store.pin('users');
    assert.strictEqual(store.pinnedNames.size, 1);
  });

  it('should handle unpin of non-pinned table as no-op', async () => {
    await store.unpin('nonexistent');
    assert.strictEqual(store.pinnedNames.size, 0);
  });

  it('should fire onDidChange when pinning', async () => {
    const spy = sinon.spy();
    store.onDidChange(spy);
    await store.pin('users');
    assert.strictEqual(spy.callCount, 1);
  });

  it('should fire onDidChange when unpinning', async () => {
    await store.pin('users');
    const spy = sinon.spy();
    store.onDidChange(spy);
    await store.unpin('users');
    assert.strictEqual(spy.callCount, 1);
  });

  it('should pin multiple tables independently', async () => {
    await store.pin('users');
    await store.pin('orders');
    await store.pin('products');
    assert.strictEqual(store.pinnedNames.size, 3);

    await store.unpin('orders');
    assert.strictEqual(store.pinnedNames.size, 2);
    assert.strictEqual(store.isPinned('users'), true);
    assert.strictEqual(store.isPinned('orders'), false);
    assert.strictEqual(store.isPinned('products'), true);
  });
});
