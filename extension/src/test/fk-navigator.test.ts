import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks, workspace } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { FkNavigator } from '../navigation/fk-navigator';

describe('FkNavigator', () => {
  let fetchStub: sinon.SinonStub;
  let navigator: FkNavigator;
  let posted: unknown[];
  const tick = () => new Promise((r) => setTimeout(r, 10));

  function stubSql(columns: string[], rows: unknown[][]): void {
    fetchStub.resolves(new Response(
      JSON.stringify({ columns, rows }), { status: 200 },
    ));
  }

  function stubFkMeta(fks: unknown[]): void {
    fetchStub.resolves(new Response(
      JSON.stringify(fks), { status: 200 },
    ));
  }

  function byCmd(cmd: string): Record<string, unknown>[] {
    return posted.filter(
      (m) => (m as Record<string, unknown>).command === cmd,
    ) as Record<string, unknown>[];
  }

  function nav(toTable: string, toColumn: string, value: unknown): void {
    navigator.handleMessage({
      command: 'fkNavigate', toTable, toColumn, value,
    });
  }

  beforeEach(() => {
    resetMocks();
    fetchStub = sinon.stub(globalThis, 'fetch');
    const client = new DriftApiClient('127.0.0.1', 8642);
    navigator = new FkNavigator(client);
    posted = [];
    navigator.attach({
      postMessage: (msg: unknown) => { posted.push(msg); },
    } as never);
  });

  afterEach(() => {
    navigator.dispose();
    fetchStub.restore();
  });

  // --- Navigation ---

  it('should navigate and push to history', async () => {
    stubSql(['id', 'name'], [[42, 'Alice']]);
    nav('users', 'id', 42);
    await tick();

    const msgs = byCmd('fkNavigated');
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].table, 'users');
    assert.deepStrictEqual(msgs[0].filter, { column: 'id', value: 42 });
    assert.deepStrictEqual(msgs[0].columns, ['id', 'name']);
    assert.deepStrictEqual(msgs[0].rows, [[42, 'Alice']]);
  });

  it('should send breadcrumbs after navigate', async () => {
    stubSql(['id'], [[1]]);
    nav('users', 'id', 1);
    await tick();

    const bc = byCmd('fkBreadcrumbs');
    assert.strictEqual(bc.length, 1);
    assert.strictEqual(bc[0].canBack, false);
    assert.strictEqual(bc[0].canForward, false);
    assert.strictEqual((bc[0].entries as unknown[]).length, 1);
  });

  it('should go back after two navigations', async () => {
    stubSql(['id'], [[1]]);
    nav('users', 'id', 1);
    await tick();

    stubSql(['id'], [[10]]);
    nav('orders', 'user_id', 1);
    await tick();

    stubSql(['id'], [[1]]);
    navigator.handleMessage({ command: 'fkBack' });
    await tick();

    const bc = byCmd('fkBreadcrumbs').pop()!;
    assert.strictEqual(bc.canBack, false);
    assert.strictEqual(bc.canForward, true);
  });

  it('should go forward after back', async () => {
    stubSql(['id'], [[1]]);
    nav('users', 'id', 1);
    await tick();

    stubSql(['id'], [[10]]);
    nav('orders', 'id', 10);
    await tick();

    stubSql(['id'], [[1]]);
    navigator.handleMessage({ command: 'fkBack' });
    await tick();

    stubSql(['id'], [[10]]);
    navigator.handleMessage({ command: 'fkForward' });
    await tick();

    const bc = byCmd('fkBreadcrumbs').pop()!;
    assert.strictEqual(bc.canBack, true);
    assert.strictEqual(bc.canForward, false);
  });

  it('should truncate forward history on new navigate', async () => {
    stubSql(['id'], [[1]]);
    nav('a', 'id', 1);
    await tick();

    stubSql(['id'], [[2]]);
    nav('b', 'id', 2);
    await tick();

    stubSql(['id'], [[1]]);
    navigator.handleMessage({ command: 'fkBack' });
    await tick();

    stubSql(['id'], [[3]]);
    nav('c', 'id', 3);
    await tick();

    const bc = byCmd('fkBreadcrumbs').pop()!;
    const entries = bc.entries as Array<{ table: string }>;
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].table, 'a');
    assert.strictEqual(entries[1].table, 'c');
    assert.strictEqual(bc.canForward, false);
  });

  it('should not go back when at start', async () => {
    navigator.handleMessage({ command: 'fkBack' });
    await tick();
    assert.strictEqual(byCmd('fkNavigated').length, 0);
    assert.strictEqual(byCmd('fkBreadcrumbs').length, 0);
  });

  it('should not go forward when at end', async () => {
    stubSql(['id'], [[1]]);
    nav('x', 'id', 1);
    await tick();

    navigator.handleMessage({ command: 'fkForward' });
    await tick();
    assert.strictEqual(byCmd('fkNavigated').length, 1);
  });

  // --- FK column metadata ---

  it('should fetch and send FK columns', async () => {
    stubFkMeta([
      { fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ]);
    navigator.handleMessage({ command: 'fkGetColumns', table: 'orders' });
    await tick();

    const msgs = byCmd('fkColumns');
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].table, 'orders');
    const fks = msgs[0].fkColumns as Array<Record<string, string>>;
    assert.strictEqual(fks.length, 1);
    assert.strictEqual(fks[0].fromColumn, 'user_id');
    assert.strictEqual(fks[0].fromTable, 'orders');
    assert.strictEqual(fks[0].toTable, 'users');
    assert.strictEqual(fks[0].toColumn, 'id');
  });

  it('should cache FK metadata', async () => {
    stubFkMeta([]);
    navigator.handleMessage({ command: 'fkGetColumns', table: 't' });
    await tick();
    navigator.handleMessage({ command: 'fkGetColumns', table: 't' });
    await tick();

    assert.strictEqual(fetchStub.callCount, 1);
    assert.strictEqual(byCmd('fkColumns').length, 2);
  });

  it('should return empty array for tables with no FKs', async () => {
    stubFkMeta([]);
    navigator.handleMessage({ command: 'fkGetColumns', table: 'meta' });
    await tick();

    const fks = byCmd('fkColumns')[0].fkColumns as unknown[];
    assert.strictEqual(fks.length, 0);
  });

  it('should return empty when config disabled', async () => {
    const origGet = workspace.getConfiguration;
    workspace.getConfiguration = () => ({
      get: <T>(_key: string, _default?: T) => false as T,
    });
    stubFkMeta([{ fromColumn: 'x', toTable: 'y', toColumn: 'z' }]);

    navigator.handleMessage({ command: 'fkGetColumns', table: 'orders' });
    await tick();

    const fks = byCmd('fkColumns')[0].fkColumns as unknown[];
    assert.strictEqual(fks.length, 0);
    assert.strictEqual(fetchStub.callCount, 0);
    workspace.getConfiguration = origGet;
  });

  // --- Message handling ---

  it('should return false for unrecognized messages', () => {
    assert.ok(!navigator.handleMessage({ command: 'cellEdit' }));
    assert.ok(!navigator.handleMessage({ command: 'unknown' }));
    assert.ok(!navigator.handleMessage(null));
    assert.ok(!navigator.handleMessage('not an object'));
    assert.ok(!navigator.handleMessage(42));
  });

  it('should return true for recognized FK messages', () => {
    stubSql(['id'], [[1]]);
    assert.ok(navigator.handleMessage({
      command: 'fkNavigate', toTable: 'x', toColumn: 'id', value: 1,
    }));
    assert.ok(navigator.handleMessage({ command: 'fkBack' }));
    assert.ok(navigator.handleMessage({ command: 'fkForward' }));
    assert.ok(navigator.handleMessage({
      command: 'fkGetColumns', table: 'x',
    }));
  });

  // --- Webview attachment ---

  it('should not throw when no webview attached', () => {
    navigator.detach();
    stubSql(['id'], [[1]]);
    nav('users', 'id', 1);
  });

  it('should stop posting after detach', async () => {
    navigator.detach();
    stubFkMeta([]);
    navigator.handleMessage({ command: 'fkGetColumns', table: 'x' });
    await tick();
    assert.strictEqual(posted.length, 0);
  });

  // --- Injected script ---

  it('should provide injected script as non-empty string', () => {
    const script = FkNavigator.injectedScript();
    assert.ok(typeof script === 'string');
    assert.ok(script.length > 100);
    assert.ok(script.includes('_vscodeApi'));
    assert.ok(script.includes('fkNavigate'));
    assert.ok(script.includes('fkGetColumns'));
    assert.ok(script.includes('fk-link'));
  });
});
