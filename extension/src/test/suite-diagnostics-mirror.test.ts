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
import { writeAdvisorDiagnosticsMirror } from '../suite/diagnostics-mirror';

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

  it('writes a valid envelope verbatim to .saropa/diagnostics/advisor.json', async () => {
    const envelope = {
      schemaVersion: 1,
      producer: { name: 'saropa_drift_advisor', version: '9.9.9' },
      generatedAt: '2026-06-13T00:00:00.000Z',
      issues: [{ id: 'x', source: 'anomaly', category: 'data', severity: 'info' }],
    };
    const ok = await writeAdvisorDiagnosticsMirror(clientReturning(envelope) as any);
    assert.strictEqual(ok, true);
    assert.strictEqual(writtenFiles.length, 1);
    const { uri, content } = writtenFiles[0];
    assert.ok(String(uri.fsPath ?? uri.path).replace(/\\/g, '/').endsWith('.saropa/diagnostics/advisor.json'));
    // Persisted verbatim — the server owns the shape, the mirror only copies it.
    assert.deepStrictEqual(JSON.parse(new TextDecoder().decode(content)), envelope);
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
