import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DriftApiClient, TableMetadata } from '../api-client';
import { TableNameMapper } from '../codelens/table-name-mapper';
import {
  DriftHoverProvider,
  HoverCache,
  buildHoverMarkdown,
} from '../hover/drift-hover-provider';

const vscodeMock = vscode as any;

// --- Helpers ---

function fakePosition(line = 0, character = 0): any {
  return { line, character };
}

function fakeDocument(word: string): any {
  return {
    languageId: 'dart',
    getWordRangeAtPosition: (pos: any) => {
      if (!word) return undefined;
      return new vscodeMock.Range(
        pos.line, 0,
        pos.line, word.length,
      );
    },
    getText: (range?: any) => {
      if (range) return word;
      return `class ${word} extends Table {}`;
    },
  };
}

const SAMPLE_METADATA: TableMetadata[] = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT', pk: false },
      { name: 'email', type: 'TEXT', pk: false },
    ],
    rowCount: 42,
  },
];

const SAMPLE_SQL_RESULT = {
  columns: ['id', 'name', 'email'],
  rows: [
    [42, 'Alice', 'alice@example.com'],
    [41, 'Bob', 'bob@example.com'],
    [40, 'Carol', null],
  ],
};

// --- HoverCache ---

describe('HoverCache', () => {
  let clock: sinon.SinonFakeTimers;
  let cache: HoverCache;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    cache = new HoverCache();
  });

  afterEach(() => {
    clock.restore();
  });

  it('should return null for unknown key', () => {
    assert.strictEqual(cache.get('missing'), null);
  });

  it('should return cached hover within TTL', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 10_000);
    assert.strictEqual(cache.get('users'), hover);
  });

  it('should return null after TTL expires', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 10_000);
    clock.tick(10_001);
    assert.strictEqual(cache.get('users'), null);
  });

  it('should remove expired entries on read', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 5000);
    clock.tick(5001);
    cache.get('users'); // triggers cleanup
    // Set a new value — should not conflict with old entry
    const hover2 = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test2'),
    );
    cache.set('users', hover2, 5000);
    assert.strictEqual(cache.get('users'), hover2);
  });

  it('should clear all entries', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 10_000);
    cache.set('orders', hover, 10_000);
    cache.clear();
    assert.strictEqual(cache.get('users'), null);
    assert.strictEqual(cache.get('orders'), null);
  });
});

// --- buildHoverMarkdown ---

describe('buildHoverMarkdown', () => {
  const table = SAMPLE_METADATA[0];

  it('should include table name and row count in header', () => {
    const hover = buildHoverMarkdown(table, [], []);
    const md = hover.contents as any;
    assert.ok(md.value.includes('**users**'));
    assert.ok(md.value.includes('42 rows'));
  });

  it('should include schema with column types and PK marker', () => {
    const hover = buildHoverMarkdown(table, [], []);
    const md = hover.contents as any;
    assert.ok(md.value.includes('`id` INTEGER PK'));
    assert.ok(md.value.includes('`name` TEXT'));
    assert.ok(md.value.includes('`email` TEXT'));
  });

  it('should render recent rows as markdown table', () => {
    const { columns, rows } = SAMPLE_SQL_RESULT;
    const hover = buildHoverMarkdown(table, columns, rows);
    const md = hover.contents as any;
    assert.ok(md.value.includes('| id | name | email |'));
    assert.ok(md.value.includes('| --- | --- | --- |'));
    assert.ok(md.value.includes('| 42 | Alice | alice@example.com |'));
    assert.ok(md.value.includes('| 41 | Bob | bob@example.com |'));
  });

  it('should omit rows section when rows are empty', () => {
    const hover = buildHoverMarkdown(table, [], []);
    const md = hover.contents as any;
    assert.ok(!md.value.includes('Recent rows'));
  });

  it('should display null values as "null"', () => {
    const { columns, rows } = SAMPLE_SQL_RESULT;
    const hover = buildHoverMarkdown(table, columns, rows);
    const md = hover.contents as any;
    assert.ok(md.value.includes('| 40 | Carol | null |'));
  });

  it('should truncate long cell values', () => {
    const longRows = [[1, 'A very long name that exceeds', 'x']];
    const hover = buildHoverMarkdown(
      table,
      ['id', 'name', 'email'],
      longRows,
    );
    const md = hover.contents as any;
    // 20 chars max: 19 chars + ellipsis
    assert.ok(md.value.includes('A very long name th\u2026'));
    assert.ok(!md.value.includes('that exceeds'));
  });

  it('should include action links with encoded table name', () => {
    const hover = buildHoverMarkdown(table, [], []);
    const md = hover.contents as any;
    const encoded = encodeURIComponent(JSON.stringify('users'));
    assert.ok(
      md.value.includes(
        `[View All](command:driftViewer.viewTableInPanel?${encoded})`,
      ),
    );
    assert.ok(
      md.value.includes(
        `[Run Query](command:driftViewer.runTableQuery?${encoded})`,
      ),
    );
  });

  it('should set isTrusted on the MarkdownString', () => {
    const hover = buildHoverMarkdown(table, [], []);
    const md = hover.contents as any;
    assert.strictEqual(md.isTrusted, true);
  });

  it('should escape pipe characters in cell values', () => {
    const pipeRows = [[1, 'a|b', 'c|d|e']];
    const hover = buildHoverMarkdown(
      table,
      ['id', 'name', 'email'],
      pipeRows,
    );
    const md = hover.contents as any;
    assert.ok(md.value.includes('a\\|b'));
    assert.ok(md.value.includes('c\\|d\\|e'));
  });

  it('should pluralise "1 row" correctly', () => {
    const singleRow = { ...table, rowCount: 1 };
    const hover = buildHoverMarkdown(singleRow, [], []);
    const md = hover.contents as any;
    assert.ok(md.value.includes('1 row'));
    assert.ok(!md.value.includes('1 rows'));
  });
});

// --- DriftHoverProvider ---

describe('DriftHoverProvider', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let mapper: TableNameMapper;
  let cache: HoverCache;
  let provider: DriftHoverProvider;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
    mapper = new TableNameMapper();
    mapper.updateTableList(['users', 'orders']);
    cache = new HoverCache();
    provider = new DriftHoverProvider(client, mapper, cache);

    // Simulate active debug session
    vscodeMock.debug.activeDebugSession = { type: 'dart' };
  });

  afterEach(() => {
    fetchStub.restore();
    vscodeMock.debug.activeDebugSession = undefined;
    cache.clear();
  });

  it('should return null when no debug session is active', async () => {
    vscodeMock.debug.activeDebugSession = undefined;
    const result = await provider.provideHover(
      fakeDocument('Users'),
      fakePosition(),
      {} as any,
    );
    assert.strictEqual(result, null);
    assert.ok(fetchStub.notCalled);
  });

  it('should return null for non-table words', async () => {
    const result = await provider.provideHover(
      fakeDocument('SomeHelper'),
      fakePosition(),
      {} as any,
    );
    assert.strictEqual(result, null);
    assert.ok(fetchStub.notCalled);
  });

  it('should return null when word range is undefined', async () => {
    const doc = {
      getWordRangeAtPosition: () => undefined,
      getText: () => '',
    };
    const result = await provider.provideHover(
      doc as any,
      fakePosition(),
      {} as any,
    );
    assert.strictEqual(result, null);
  });

  it('should return hover with correct content for a table', async () => {
    // First call returns metadata, second returns sql result
    fetchStub.onFirstCall().resolves(
      new Response(JSON.stringify(SAMPLE_METADATA), { status: 200 }),
    );
    fetchStub.onSecondCall().resolves(
      new Response(JSON.stringify(SAMPLE_SQL_RESULT), { status: 200 }),
    );

    const result = await provider.provideHover(
      fakeDocument('Users'),
      fakePosition(),
      {} as any,
    );

    assert.ok(result !== null);
    const md = (result as any).contents as any;
    assert.ok(md.value.includes('**users**'));
    assert.ok(md.value.includes('42 rows'));
    assert.ok(md.value.includes('Alice'));
  });

  it('should return cached result on second call', async () => {
    fetchStub.onFirstCall().resolves(
      new Response(JSON.stringify(SAMPLE_METADATA), { status: 200 }),
    );
    fetchStub.onSecondCall().resolves(
      new Response(JSON.stringify(SAMPLE_SQL_RESULT), { status: 200 }),
    );

    const first = await provider.provideHover(
      fakeDocument('Users'),
      fakePosition(),
      {} as any,
    );
    const second = await provider.provideHover(
      fakeDocument('Users'),
      fakePosition(),
      {} as any,
    );

    assert.ok(first !== null);
    assert.strictEqual(first, second);
    // Only 2 fetches (metadata + sql), not 4
    assert.strictEqual(fetchStub.callCount, 2);
  });

  it('should return null when server is unreachable', async () => {
    fetchStub.rejects(new Error('connection refused'));

    const result = await provider.provideHover(
      fakeDocument('Users'),
      fakePosition(),
      {} as any,
    );

    assert.strictEqual(result, null);
  });

  it('should return null when table not found in metadata', async () => {
    // Metadata has no matching table
    fetchStub.onFirstCall().resolves(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    fetchStub.onSecondCall().resolves(
      new Response(JSON.stringify(SAMPLE_SQL_RESULT), { status: 200 }),
    );

    const result = await provider.provideHover(
      fakeDocument('Users'),
      fakePosition(),
      {} as any,
    );

    assert.strictEqual(result, null);
  });
});
