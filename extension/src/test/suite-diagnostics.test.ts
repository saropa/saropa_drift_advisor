/**
 * Tests for reading + matching sibling-tool diagnostics (plan 67 R3) and their
 * rendering in the Explain panel's "Related Saropa Suite Findings" section.
 */
import * as assert from 'assert';
import {
  envelopeMeta,
  parseEnvelope,
  readSuiteMirrorRefs,
  relatedDiagnostics,
} from '../suite/suite-diagnostics';
import { buildExplainHtml } from '../explain/explain-html';

describe('parseEnvelope', () => {
  it('reads the `issues` carrier and backfills source from the file', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      issues: [{ title: 'a', table: 'users' }, { title: 'b', source: 'log-capture' }],
    });
    const out = parseEnvelope(text, 'lints');
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].source, 'lints'); // backfilled
    assert.strictEqual(out[1].source, 'log-capture'); // kept
  });

  it('reads the canonical `diagnostics` carrier key', () => {
    const out = parseEnvelope(JSON.stringify({ diagnostics: [{ title: 'x' }] }), 'lints');
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].title, 'x');
  });

  it('returns [] for malformed JSON, non-object root, or missing carrier', () => {
    assert.deepStrictEqual(parseEnvelope('{ not json', 'lints'), []);
    assert.deepStrictEqual(parseEnvelope('42', 'lints'), []);
    assert.deepStrictEqual(parseEnvelope('null', 'lints'), []);
    assert.deepStrictEqual(parseEnvelope(JSON.stringify({ nope: [] }), 'lints'), []);
  });

  it('drops non-object entries rather than throwing', () => {
    const out = parseEnvelope(JSON.stringify({ issues: [1, 'x', null, { title: 'ok' }] }), 'lints');
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].title, 'ok');
  });

  it('inherits the envelope commitSha when an entry omits its own (plan 67 R6)', () => {
    const text = JSON.stringify({
      commitSha: 'envSha',
      issues: [{ title: 'a' }, { title: 'b', commitSha: 'ownSha' }],
    });
    const out = parseEnvelope(text, 'lints');
    assert.strictEqual(out[0].commitSha, 'envSha'); // inherited
    assert.strictEqual(out[1].commitSha, 'ownSha'); // per-diagnostic wins
  });
});

describe('relatedDiagnostics', () => {
  const diags = [
    { title: 'idx', table: 'Orders', source: 'lints' },
    { title: 'slow', sql: 'SELECT * FROM orders', source: 'log-capture' },
    { title: 'unrelated', table: 'audit_log', source: 'lints' },
  ];

  it('matches by table case-insensitively', () => {
    const r = relatedDiagnostics(diags, { tables: ['orders'] });
    assert.deepStrictEqual(r.map((d) => d.title), ['idx']);
  });

  it('matches by trimmed exact sql', () => {
    const r = relatedDiagnostics(diags, { sql: '  SELECT * FROM orders  ' });
    assert.deepStrictEqual(r.map((d) => d.title), ['slow']);
  });

  it('excludes diagnostics with neither a matching table nor sql', () => {
    const r = relatedDiagnostics(diags, { tables: ['orders'], sql: 'SELECT * FROM orders' });
    assert.ok(!r.some((d) => d.title === 'unrelated'));
  });
});

describe('buildExplainHtml suite section', () => {
  const nodes = [
    { id: 0, parent: 0, detail: 'SCAN TABLE orders', children: [], scanType: 'scan' as const },
  ];

  it('omits the section when there are no suite notes', () => {
    const html = buildExplainHtml('SELECT * FROM orders', nodes, []);
    assert.ok(!html.includes('Related Saropa Suite Findings'));
  });

  it('renders the source label, title, and rule id for a suite note', () => {
    const html = buildExplainHtml('SELECT * FROM orders', nodes, [], [
      { source: 'lints', title: 'Add an index on orders.user_id', ruleId: 'require_database_index' },
    ]);
    assert.ok(html.includes('Related Saropa Suite Findings'));
    assert.ok(html.includes('Saropa Lints'));
    assert.ok(html.includes('Add an index on orders.user_id'));
    assert.ok(html.includes('require_database_index'));
  });

  it('escapes sibling-provided text', () => {
    const html = buildExplainHtml('SELECT 1', nodes, [], [
      { source: 'log-capture', title: '<img src=x onerror=alert(1)>' },
    ]);
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img'));
  });
});

describe('envelopeMeta', () => {
  it('reads commitSha and counts the canonical `diagnostics` carrier', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      commitSha: 'deadbeef',
      diagnostics: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    });
    assert.deepStrictEqual(envelopeMeta(text), { commitSha: 'deadbeef', count: 3 });
  });

  it('falls back to the legacy `issues` carrier and a missing commit', () => {
    const text = JSON.stringify({ issues: [{ title: 'a' }] });
    assert.deepStrictEqual(envelopeMeta(text), { commitSha: undefined, count: 1 });
  });

  it('returns zero for malformed or non-object input', () => {
    assert.deepStrictEqual(envelopeMeta('not json'), { count: 0 });
    assert.deepStrictEqual(envelopeMeta('42'), { count: 0 });
    assert.deepStrictEqual(envelopeMeta('{}'), { commitSha: undefined, count: 0 });
  });
});

describe('readSuiteMirrorRefs', () => {
  // The shared vscode mock's workspace state is set by other suites, so this is
  // robust to both states: either no workspace (→ []) or a workspace whose empty
  // mirror files parse to zero-count refs. Either way the contract holds: an
  // array of well-shaped refs over the known tool sources, never a throw.
  it('returns well-shaped refs over the known tool sources', async () => {
    const refs = await readSuiteMirrorRefs();
    assert.ok(Array.isArray(refs));
    const sources = new Set(['advisor', 'lints', 'log-capture']);
    for (const ref of refs) {
      assert.ok(sources.has(ref.source));
      assert.strictEqual(typeof ref.present, 'boolean');
      assert.strictEqual(typeof ref.count, 'number');
      assert.ok(ref.file.startsWith('.saropa/diagnostics/'));
    }
  });
});
