/**
 * Tests for the Saropa suite offline diagnostics mirror (plan 67 R2).
 *
 * The mirror is best-effort: it must persist a valid envelope verbatim but
 * never write a garbage payload (an error body, a proxy login page) and never
 * touch disk when there is no workspace folder — a sibling tool reads this file
 * as Advisor's truth when the debug server is down.
 */
import * as assert from 'assert';
import { resetMocks, Uri, workspace, writtenFiles } from './vscode-mock';
import { toCanonicalEnvelope, writeAdvisorDiagnosticsMirror } from '../suite/diagnostics-mirror';

/** Minimal client stub exposing only the issues() method the mirror calls. */
function clientReturning(value: unknown | (() => never)): { issues: () => Promise<unknown> } {
  return {
    issues: async () => {
      if (typeof value === 'function') (value as () => never)();
      return value;
    },
  };
}

describe('Suite diagnostics mirror', () => {
  beforeEach(() => {
    resetMocks();
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///workspace'), name: 'workspace', index: 0 },
    ];
  });

  it('writes the canonical envelope to .saropa/diagnostics/advisor.json', async () => {
    // Live `/api/issues` shape: legacy `issues` carrier, detector-level `source`.
    const envelope = {
      schemaVersion: 1,
      producer: { name: 'saropa_drift_advisor', version: '9.9.9' },
      generatedAt: '2026-06-13T00:00:00.000Z',
      issues: [{ id: 'x', source: 'anomaly', category: 'data', severity: 'info', title: 'Bad row' }],
    };
    const ok = await writeAdvisorDiagnosticsMirror(clientReturning(envelope) as any);
    assert.strictEqual(ok, true);
    assert.strictEqual(writtenFiles.length, 1);
    const { uri, content } = writtenFiles[0];
    assert.ok(String(uri.fsPath ?? uri.path).replace(/\\/g, '/').endsWith('.saropa/diagnostics/advisor.json'));
    // Translated to canonical: `diagnostics` carrier, `source: "advisor"`,
    // detector preserved as `ruleId`. The strict consumer parser needs this.
    const parsed = JSON.parse(new TextDecoder().decode(content));
    assert.strictEqual(parsed.issues, undefined, 'legacy issues key must be dropped');
    assert.ok(Array.isArray(parsed.diagnostics));
    assert.deepStrictEqual(parsed.diagnostics, [
      { id: 'x', source: 'advisor', category: 'data', severity: 'info', title: 'Bad row', ruleId: 'anomaly' },
    ]);
    // Top-level envelope metadata is preserved unchanged.
    assert.strictEqual(parsed.schemaVersion, 1);
    assert.deepStrictEqual(parsed.producer, { name: 'saropa_drift_advisor', version: '9.9.9' });
  });

  it('toCanonicalEnvelope keeps an explicit ruleId and passes other fields through', async () => {
    const out = toCanonicalEnvelope({
      schemaVersion: 1,
      issues: [
        { id: 'a', source: 'index-suggestion', ruleId: 'require_database_index', table: 't', sql: 'SELECT 1' },
        'not-an-object',
      ],
    });
    assert.deepStrictEqual(out.diagnostics, [
      { id: 'a', source: 'advisor', ruleId: 'require_database_index', table: 't', sql: 'SELECT 1' },
      'not-an-object',
    ]);
    assert.strictEqual((out as any).issues, undefined);
  });

  it('toCanonicalEnvelope yields an empty diagnostics array when issues is absent', () => {
    const out = toCanonicalEnvelope({ schemaVersion: 1, producer: { name: 'x', version: '1' } });
    assert.deepStrictEqual(out.diagnostics, []);
  });

  it('returns false and writes nothing when there is no workspace folder', async () => {
    (workspace as any).workspaceFolders = undefined;
    const ok = await writeAdvisorDiagnosticsMirror(clientReturning({ issues: [] }) as any);
    assert.strictEqual(ok, false);
    assert.strictEqual(writtenFiles.length, 0);
  });

  it('refuses a non-envelope payload (no issues array)', async () => {
    // An HTML login page or an error body must never be written as the mirror.
    const ok = await writeAdvisorDiagnosticsMirror(clientReturning('<html>login</html>') as any);
    assert.strictEqual(ok, false);
    assert.strictEqual(writtenFiles.length, 0);
  });

  it('returns false (leaving any existing mirror) when the fetch fails', async () => {
    const throwing = clientReturning(() => {
      throw new Error('server unreachable');
    });
    const ok = await writeAdvisorDiagnosticsMirror(throwing as any);
    assert.strictEqual(ok, false);
    assert.strictEqual(writtenFiles.length, 0);
  });
});
