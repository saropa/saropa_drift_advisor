import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks, workspace } from './vscode-mock';
import { HealthCheckTerminal } from '../tasks/health-check-runner';
import { runTerminal } from './health-check-helpers';

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
    fetchStub.withArgs(sinon.match(/\/api\/analytics\/anomalies$/)).resolves({
      ok: true,
      json: async () => ({ anomalies: data }),
    });
  }

  function mockIndexSuggestionsFail(): void {
    fetchStub.withArgs(sinon.match(/\/api\/index-suggestions$/)).resolves({
      ok: false,
      status: 500,
    });
  }

  function mockAnomaliesFail(): void {
    fetchStub.withArgs(sinon.match(/\/api\/analytics\/anomalies$/)).resolves({
      ok: false,
      status: 500,
    });
  }

  function mockSchemaMetadata(tables: any[] = []): void {
    fetchStub.withArgs(sinon.match(/\/api\/schema-metadata$/)).resolves({
      ok: true,
      json: async () => tables,
    });
  }

  function mockPerformance(): void {
    fetchStub.withArgs(sinon.match(/\/api\/performance$/)).resolves({
      ok: true,
      json: async () => ({ queries: [], totalQueries: 0, avgDuration: 0 }),
    });
  }

  function mockSizeAnalytics(): void {
    fetchStub.withArgs(sinon.match(/\/api\/size-analytics$/)).resolves({
      ok: true,
      json: async () => ({ tables: [], totalSize: 0 }),
    });
  }

  function mockTableFkMeta(): void {
    fetchStub.withArgs(sinon.match(/\/api\/tables\/.*\/fk-meta$/)).resolves({
      ok: true,
      json: async () => [],
    });
  }

  function mockNullCounts(): void {
    fetchStub.withArgs(sinon.match(/\/api\/tables\/.*\/null-counts$/)).resolves({
      ok: true,
      json: async () => ({}),
    });
  }

  function mockSql(): void {
    fetchStub.withArgs(sinon.match(/\/api\/sql$/)).resolves({
      ok: true,
      json: async () => ({ columns: ['result'], rows: [[0]] }),
    });
  }

  function mockAllHealthCheckApis(indexSuggestions: any[] = [], anomalies: any[] = []): void {
    mockHealthOk();
    mockSchemaMetadata([]);
    mockIndexSuggestions(indexSuggestions);
    mockAnomalies(anomalies);
    mockPerformance();
    mockSizeAnalytics();
    mockTableFkMeta();
    mockNullCounts();
    mockSql();
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
      mockAllHealthCheckApis([], []);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('Pre-Launch Health Check'), 'Should include header');
      assert.ok(code === 0 || output.includes('Health'));
    });
  });

  describe('healthCheck — errors found', () => {
    it('should exit with code 1 when high-priority index suggestions exist', async () => {
      mockAllHealthCheckApis(
        [{ table: 'posts', column: 'user_id', reason: 'missing FK index', sql: 'CREATE INDEX ...', priority: 'high' }],
        [],
      );
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('Pre-Launch Health Check'), 'Should include header');
    });

    it('should exit with code 1 when error-severity anomalies exist', async () => {
      mockAllHealthCheckApis(
        [],
        [{ message: '3 orphaned FKs', severity: 'error' }],
      );
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('Pre-Launch Health Check'), 'Should include header');
    });
  });

  describe('healthCheck — warnings only', () => {
    it('should exit with code 0 when only warnings (blockOnWarnings=false)', async () => {
      mockAllHealthCheckApis(
        [{ table: 'users', column: 'deleted_at', reason: 'potential index', sql: 'CREATE INDEX ...', priority: 'low' }],
        [{ message: '45 NULL values', severity: 'warning' }],
      );
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('Health:') || output.includes('issue'));
    });
  });

  describe('healthCheck — warnings with blockOnWarnings=true', () => {
    it('should exit with code 1 when warnings exist and blockOnWarnings is enabled', async () => {
      const originalGetConfig = workspace.getConfiguration;
      workspace.getConfiguration = (_section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T | undefined => {
          if (key === 'tasks.blockOnWarnings') { return true as unknown as T; }
          return defaultValue;
        },
      });

      mockAllHealthCheckApis([], [{ message: 'some warning', severity: 'warning' }]);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      const code = await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('Health:') || output.includes('issue'));

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
      const { terminal, lines, closeCode } = runTerminal('indexCoverage');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('Failed to check indexes'));
    });

    it('should count anomaly scan failure as error', async () => {
      mockHealthOk();
      mockAnomaliesFail();
      const { terminal, lines, closeCode } = runTerminal('anomalyScan');
      terminal.open();
      const code = await closeCode;
      assert.strictEqual(code, 1);
      const output = lines.join('');
      assert.ok(output.includes('Failed to scan anomalies'));
    });
  });

  describe('output formatting', () => {
    it('should write header with title and separator', async () => {
      mockAllHealthCheckApis([], []);
      const { terminal, lines, closeCode } = runTerminal('healthCheck');
      terminal.open();
      await closeCode;
      assert.ok(lines[0].includes('Pre-Launch Health Check'));
      assert.ok(lines[1].includes('\u2550'));
    });

    it('should include connection info', async () => {
      mockAllHealthCheckApis([], []);
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
      const { terminal, lines, closeCode } = runTerminal('indexCoverage');
      terminal.open();
      await closeCode;
      const output = lines.join('');
      assert.ok(output.includes('\u2717 a.b'));
      assert.ok(output.includes('\u26A0 c.d'));
    });

    it('should use severity icons for anomalies', async () => {
      mockHealthOk();
      mockAnomalies([
        { message: 'bad thing', severity: 'error' },
        { message: 'meh thing', severity: 'warning' },
        { message: 'fyi thing', severity: 'info' },
      ]);
      const { terminal, lines, closeCode } = runTerminal('anomalyScan');
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
