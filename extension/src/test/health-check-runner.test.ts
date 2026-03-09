import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks, workspace } from './vscode-mock';
import { HealthCheckTerminal } from '../tasks/health-check-runner';

/** Collect all writes and the close code from a HealthCheckTerminal. */
function runTerminal(check: 'healthCheck' | 'anomalyScan' | 'indexCoverage'): {
  terminal: HealthCheckTerminal;
  lines: string[];
  closeCode: Promise<number>;
} {
  const terminal = new HealthCheckTerminal(check);
  const lines: string[] = [];

  // Access the emitters through the onDidWrite/onDidClose events
  // The mock EventEmitter exposes an event function that registers listeners
  terminal.onDidWrite((text: string) => {
    lines.push(text);
  });

  const closeCode = new Promise<number>((resolve) => {
    terminal.onDidClose((code: number) => {
      resolve(code);
    });
  });

  return { terminal, lines, closeCode };
}

describe('HealthCheckTerminal', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    resetMocks();
    fetchStub = sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  function mockHealthOk(): void {
    fetchStub.withArgs(sinon.match(/\/api\/health$/)).resolves({
      ok: true,
      json: async () => ({ ok: true }),
    });
  }

  function mockHealthFail(): void {
    fetchStub.withArgs(sinon.match(/\/api\/health$/)).rejects(
      new Error('connection refused'),
    );
  }

  function mockIndexSuggestions(data: any[]): void {
    fetchStub.withArgs(sinon.match(/\/api\/index-suggestions$/)).resolves({
      ok: true,
      json: async () => data,
    });
  }

  function mockAnomalies(data: any[]): void {
    fetchStub.withArgs(sinon.match(/\/api\/anomalies$/)).resolves({
      ok: true,
      json: async () => data,
    });
  }

  function mockIndexSuggestionsFail(): void {
    fetchStub.withArgs(sinon.match(/\/api\/index-suggestions$/)).resolves({
      ok: false,
      status: 500,
    });
  }

  function mockAnomaliesFail(): void {
    fetchStub.withArgs(sinon.match(/\/api\/anomalies$/)).resolves({
      ok: false,
      status: 500,
    });
  }

  describe('server unreachable', () => {
    it('should exit with code 1 when server is down', async () => {
      mockHealthFail();
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('Cannot connect'), 'should mention connection failure');
    });
  });

  describe('healthCheck — all clean', () => {
    it('should exit with code 0 when no issues', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomalies([]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 0);
      const output = lines.join('');
      assert.ok(output.includes('All checks passed'));
    });
  });

  describe('healthCheck — errors found', () => {
    it('should exit with code 1 when high-priority index suggestions exist', async () => {
      mockHealthOk();
      mockIndexSuggestions([
        { table: 'posts', column: 'user_id', reason: 'missing FK index', sql: 'CREATE INDEX ...', priority: 'high' },
      ]);
      mockAnomalies([]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('posts.user_id'));
      assert.ok(output.includes('1 issue(s) found'));
    });

    it('should exit with code 1 when error-severity anomalies exist', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomalies([
        { message: '3 orphaned FKs', severity: 'error' },
      ]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('3 orphaned FKs'));
    });
  });

  describe('healthCheck — warnings only', () => {
    it('should exit with code 0 when only warnings (blockOnWarnings=false)', async () => {
      mockHealthOk();
      mockIndexSuggestions([
        { table: 'users', column: 'deleted_at', reason: 'potential index', sql: 'CREATE INDEX ...', priority: 'low' },
      ]);
      mockAnomalies([
        { message: '45 NULL values', severity: 'warning' },
      ]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 0);
      const output = lines.join('');
      assert.ok(output.includes('2 issue(s) found'));
    });
  });

  describe('healthCheck — warnings with blockOnWarnings=true', () => {
    it('should exit with code 1 when warnings exist and blockOnWarnings is enabled', async () => {
      // Override config to enable blockOnWarnings
      const originalGetConfig = workspace.getConfiguration;
      workspace.getConfiguration = (_section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T | undefined => {
          if (key === 'tasks.blockOnWarnings') { return true as unknown as T; }
          return defaultValue;
        },
      });

      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomalies([
        { message: 'some warning', severity: 'warning' },
      ]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('1 issue(s) found'));

      // Restore original config
      workspace.getConfiguration = originalGetConfig;
    });
  });

  describe('indexCoverage only', () => {
    it('should only run index checks, not anomaly scan', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      // Do not mock anomalies - it should not be called
      const { terminal, lines, closeCode } = runTerminal('indexCoverage');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 0);
      const output = lines.join('');
      assert.ok(output.includes('Index Coverage'));
      assert.ok(!output.includes('Anomaly Scan'));
    });
  });

  describe('anomalyScan only', () => {
    it('should only run anomaly scan, not index checks', async () => {
      mockHealthOk();
      mockAnomalies([]);
      // Do not mock index suggestions - it should not be called
      const { terminal, lines, closeCode } = runTerminal('anomalyScan');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 0);
      const output = lines.join('');
      assert.ok(output.includes('Anomaly Scan'));
      assert.ok(!output.includes('Index Coverage'));
    });
  });

  describe('API failure during checks', () => {
    it('should count index suggestion failure as error', async () => {
      mockHealthOk();
      mockIndexSuggestionsFail();
      mockAnomalies([]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('Failed to check indexes'));
    });

    it('should count anomaly scan failure as error', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomaliesFail();
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('Failed to scan anomalies'));
    });
  });

  describe('output formatting', () => {
    it('should write header with title and separator', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomalies([]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      await closeCode;
      assert.ok(lines[0].includes('Drift Health Check'));
      assert.ok(lines[1].includes('\u2550')); // box-drawing double line
    });

    it('should include connection info', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomalies([]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('127.0.0.1:8642'));
    });

    it('should use \u2717 for errors and \u26A0 for warnings in index suggestions', async () => {
      mockHealthOk();
      mockIndexSuggestions([
        { table: 'a', column: 'b', reason: 'err', sql: 'SQL', priority: 'high' },
        { table: 'c', column: 'd', reason: 'warn', sql: 'SQL', priority: 'low' },
      ]);
      mockAnomalies([]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('\u2717 a.b'));
      assert.ok(output.includes('\u26A0 c.d'));
    });

    it('should use severity icons for anomalies', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomalies([
        { message: 'bad thing', severity: 'error' },
        { message: 'meh thing', severity: 'warning' },
        { message: 'fyi thing', severity: 'info' },
      ]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('\u2717 bad thing'));
      assert.ok(output.includes('\u26A0 meh thing'));
      assert.ok(output.includes('\u2139 fyi thing'));
    });

    it('should end lines with \\r\\n', async () => {
      mockHealthOk();
      mockIndexSuggestions([]);
      mockAnomalies([]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      await closeCode;
      for (const line of lines) {
        assert.ok(line.endsWith('\r\n'), `line should end with \\r\\n: ${JSON.stringify(line)}`);
      }
    });
  });

  describe('close method', () => {
    it('should not throw', () => {
      const terminal = new HealthCheckTerminal('healthCheck');
      assert.doesNotThrow(() => terminal.close());
    });
  });
});
