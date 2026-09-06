import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import { TableNameMapper } from '../codelens/table-name-mapper';
import {
  DriftFileDecorationProvider,
  buildTableFileMap,
  formatBadge,
} from '../decorations/file-decoration-provider';
import { encodeUtf8 as encode } from './source-reader-test-helpers';

function apiResponse(tables: Array<{ name: string; rowCount: number }>): Response {
  const body = tables.map((t) => ({
    name: t.name,
    columns: [],
    rowCount: t.rowCount,
  }));
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('formatBadge', () => {
  it('returns the exact count below 100', () => {
    assert.strictEqual(formatBadge(0), '0');
    assert.strictEqual(formatBadge(42), '42');
    assert.strictEqual(formatBadge(99), '99');
  });

  it('shows leading digit + H for hundreds', () => {
    assert.strictEqual(formatBadge(100), '1H');
    assert.strictEqual(formatBadge(350), '3H');
    assert.strictEqual(formatBadge(999), '9H');
  });

  it('shows leading digit + K for single-digit thousands', () => {
    assert.strictEqual(formatBadge(1000), '1K');
    assert.strictEqual(formatBadge(1999), '1K'); // floors, never rounds up
    assert.strictEqual(formatBadge(5000), '5K');
    assert.strictEqual(formatBadge(9499), '9K');
    assert.strictEqual(formatBadge(9500), '9K'); // would have overflowed to "10K"
    assert.strictEqual(formatBadge(9999), '9K');
  });

  it('falls back to the bare unit letter for two-digit-or-more units', () => {
    assert.strictEqual(formatBadge(10_000), 'K');
    assert.strictEqual(formatBadge(45_000), 'K');
    assert.strictEqual(formatBadge(999_499), 'K');
    assert.strictEqual(formatBadge(999_999), 'K');
    assert.strictEqual(formatBadge(10_000_000), 'M');
    assert.strictEqual(formatBadge(10_000_000_000), 'B');
  });

  it('shows leading digit + M/B for single-digit millions/billions', () => {
    assert.strictEqual(formatBadge(1_000_000), '1M');
    assert.strictEqual(formatBadge(2_500_000), '2M'); // floors
    assert.strictEqual(formatBadge(9_999_999), '9M');
    assert.strictEqual(formatBadge(1_000_000_000), '1B');
  });

  it('handles invalid and non-positive inputs as "0"', () => {
    assert.strictEqual(formatBadge(-5), '0');
    assert.strictEqual(formatBadge(NaN), '0');
    assert.strictEqual(formatBadge(Infinity), '0'); // non-finite guarded out
  });

  // The defect this bug fixes: VS Code drops a decoration and logs an
  // "INVALID decoration" warning when the badge exceeds two characters.
  it('never produces a badge longer than two characters', () => {
    const samples = [
      0, 1, 9, 10, 99, 100, 101, 350, 999, 1000, 1499, 1500, 9499, 9500,
      9999, 10_000, 12_345, 45_000, 99_999, 100_000, 999_499, 999_999,
      1_000_000, 2_500_000, 9_999_999, 10_000_000, 999_999_999,
      1_000_000_000, 9_999_999_999, 1_000_000_000_000,
    ];
    for (const n of samples) {
      const badge = formatBadge(n);
      assert.ok(
        badge.length <= 2,
        `formatBadge(${n}) = ${JSON.stringify(badge)} exceeds 2 chars`,
      );
    }
  });
});

describe('DriftFileDecorationProvider', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let provider: DriftFileDecorationProvider;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.rejects(new Error('connection refused'));
    client = new DriftApiClient('127.0.0.1', 8642);
    provider = new DriftFileDecorationProvider();
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('provideFileDecoration()', () => {
    it('returns undefined for unknown files', () => {
      const uri = vscode.Uri.file('/some/file.dart');
      assert.strictEqual(provider.provideFileDecoration(uri as any), undefined);
    });

    it('returns decoration after refresh', async () => {
      fetchStub.resolves(apiResponse([{ name: 'users', rowCount: 1200 }]));
      const map = new Map([['users', '/lib/tables/users.dart']]);

      await provider.refresh(client, map);

      const uri = vscode.Uri.file('/lib/tables/users.dart');
      const deco = provider.provideFileDecoration(uri as any);
      assert.ok(deco);
      assert.strictEqual(deco.badge, '1K');
      assert.ok(deco.tooltip?.includes('users'));
    });
  });

  describe('refresh()', () => {
    it('aggregates row counts for multi-table files', async () => {
      fetchStub.resolves(apiResponse([
        { name: 'users', rowCount: 500 },
        { name: 'posts', rowCount: 300 },
      ]));
      const map = new Map([
        ['users', '/lib/tables.dart'],
        ['posts', '/lib/tables.dart'],
      ]);

      await provider.refresh(client, map);

      const uri = vscode.Uri.file('/lib/tables.dart');
      const deco = provider.provideFileDecoration(uri as any);
      assert.ok(deco);
      assert.strictEqual(deco.badge, '8H'); // 500 + 300 = 800 -> hundreds tier
    });

    it('keeps separate badges for different files', async () => {
      fetchStub.resolves(apiResponse([
        { name: 'users', rowCount: 100 },
        { name: 'posts', rowCount: 5000 },
      ]));
      const map = new Map([
        ['users', '/lib/users.dart'],
        ['posts', '/lib/posts.dart'],
      ]);

      await provider.refresh(client, map);

      const usersDeco = provider.provideFileDecoration(
        vscode.Uri.file('/lib/users.dart') as any,
      );
      const postsDeco = provider.provideFileDecoration(
        vscode.Uri.file('/lib/posts.dart') as any,
      );
      assert.strictEqual(usersDeco?.badge, '1H'); // 100 rows -> hundreds tier
      assert.strictEqual(postsDeco?.badge, '5K');
    });

    it('fires onDidChangeFileDecorations', async () => {
      fetchStub.resolves(apiResponse([{ name: 'users', rowCount: 10 }]));
      let fired = false;
      provider.onDidChangeFileDecorations(() => { fired = true; });

      await provider.refresh(client, new Map([['users', '/lib/u.dart']]));
      assert.ok(fired);
    });

    it('does not fire when no tables match', async () => {
      fetchStub.resolves(apiResponse([{ name: 'users', rowCount: 10 }]));
      let fired = false;
      provider.onDidChangeFileDecorations(() => { fired = true; });

      await provider.refresh(client, new Map()); // no mapping
      assert.strictEqual(fired, false);
    });

    it('clears stale decorations on subsequent refresh', async () => {
      // First refresh: users file gets a badge
      fetchStub.resolves(apiResponse([{ name: 'users', rowCount: 100 }]));
      await provider.refresh(client, new Map([['users', '/lib/users.dart']]));
      assert.ok(provider.provideFileDecoration(
        vscode.Uri.file('/lib/users.dart') as any,
      ));

      // Second refresh: no tables → badge removed
      fetchStub.resolves(apiResponse([]));
      await provider.refresh(client, new Map());
      assert.strictEqual(
        provider.provideFileDecoration(vscode.Uri.file('/lib/users.dart') as any),
        undefined,
      );
    });

    it('skips tables not in the file map', async () => {
      fetchStub.resolves(apiResponse([
        { name: 'users', rowCount: 100 },
        { name: 'unknown_table', rowCount: 999 },
      ]));
      const map = new Map([['users', '/lib/users.dart']]);

      await provider.refresh(client, map);

      const uri = vscode.Uri.file('/lib/users.dart');
      const deco = provider.provideFileDecoration(uri as any);
      assert.strictEqual(deco?.badge, '1H'); // 100 rows -> hundreds tier
    });

    it('tooltip lists all tables with formatted counts', async () => {
      fetchStub.resolves(apiResponse([
        { name: 'users', rowCount: 1234 },
        { name: 'roles', rowCount: 5 },
      ]));
      const map = new Map([
        ['users', '/lib/auth.dart'],
        ['roles', '/lib/auth.dart'],
      ]);

      await provider.refresh(client, map);

      const deco = provider.provideFileDecoration(
        vscode.Uri.file('/lib/auth.dart') as any,
      );
      assert.ok(deco?.tooltip?.includes('users'));
      assert.ok(deco?.tooltip?.includes('roles'));
      assert.ok(deco?.tooltip?.includes('rows'));
    });

    it('propagates API errors', async () => {
      fetchStub.rejects(new Error('connection refused'));
      await assert.rejects(
        () => provider.refresh(client, new Map([['x', '/x.dart']])),
        /connection refused/,
      );
    });
  });
});

const vscodeMock = vscode as any;

describe('buildTableFileMap()', () => {
  let findFilesStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;
  let mapper: TableNameMapper;

  beforeEach(() => {
    findFilesStub = sinon.stub(vscodeMock.workspace, 'findFiles');
    fsReadFileStub = sinon.stub(vscodeMock.workspace.fs, 'readFile');
    mapper = new TableNameMapper();
    // Register known server tables so resolve() returns non-null.
    (mapper as any)._serverTables = ['users', 'chat_messages'];
  });

  afterEach(() => {
    findFilesStub.restore();
    fsReadFileStub.restore();
  });

  it('should not call openTextDocument during bulk scanning', async () => {
    // Core assertion: bulk scans must never create TextDocuments.
    const openDocStub = sinon.stub(vscodeMock.workspace, 'openTextDocument');
    try {
      const content = 'class Users extends Table {\n}\n';
      const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
      findFilesStub.resolves([fileUri]);
      fsReadFileStub.resolves(encode(content));

      await buildTableFileMap(mapper);
      assert.strictEqual(
        openDocStub.callCount,
        0,
        'openTextDocument must not be called during bulk scanning',
      );
    } finally {
      openDocStub.restore();
    }
  });

  it('should use an exclude glob that skips generated Dart files and dot-dirs', async () => {
    findFilesStub.resolves([]);
    await buildTableFileMap(mapper);

    const [, excludeGlob] = findFilesStub.firstCall.args;
    assert.ok(
      excludeGlob.includes('*.g.dart'),
      `Exclude glob should skip .g.dart, got: ${excludeGlob}`,
    );
    assert.ok(
      excludeGlob.includes('*.freezed.dart'),
      `Exclude glob should skip .freezed.dart, got: ${excludeGlob}`,
    );
    assert.ok(
      excludeGlob.includes('build'),
      `Exclude glob should skip build/, got: ${excludeGlob}`,
    );
    // Blanket dot-dir exclusion: .fvm, .git, .dart_tool, .symlinks, etc.
    assert.ok(
      excludeGlob.includes('**/.*'),
      `Exclude glob should skip dot-prefixed dirs, got: ${excludeGlob}`,
    );
  });

  it('should map class names to SQL table names via the mapper', async () => {
    const content = 'class Users extends Table {\n}\n';
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(content));

    const result = await buildTableFileMap(mapper);
    assert.strictEqual(result.get('users'), '/lib/tables.dart');
  });

  it('should find multiple table classes in a single file', async () => {
    const content = [
      'class Users extends Table {',
      '  IntColumn get id => integer()();',
      '}',
      'class ChatMessages extends Table {',
      '  TextColumn get body => text()();',
      '}',
    ].join('\n');
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(content));

    const result = await buildTableFileMap(mapper);
    assert.strictEqual(result.get('users'), '/lib/tables.dart');
    assert.strictEqual(result.get('chat_messages'), '/lib/tables.dart');
  });
});
