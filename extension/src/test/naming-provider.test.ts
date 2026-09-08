import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from './vscode-mock-classes';
import { resetMocks, Uri } from './vscode-mock';
import { NamingProvider } from '../diagnostics/providers/naming-provider';
import type { IDartFileInfo, IDiagnosticContext } from '../diagnostics/diagnostic-context-types';
import { emptySuppressions } from '../diagnostics/suppression';
import type { IDartTable } from '../schema-diff/dart-schema';

describe('NamingProvider', () => {
  let provider: NamingProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new NamingProvider();
    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics', () => {
    it('should report snake_case violation for table names', async () => {
      const dartFile = createDartFile('UserAccounts', ['id', 'name']);
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const tableIssue = issues.find((i) => i.code === 'table-name-case');

      assert.ok(tableIssue, 'Should report table-name-case');
      assert.ok(tableIssue.message.includes('UserAccounts'));
      assert.strictEqual(tableIssue.data?.suggested, 'user_accounts');
    });

    it('should report SQL reserved word usage for tables', async () => {
      const dartFile = createDartFile('order', ['id', 'status']);
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const reservedIssue = issues.find((i) => i.code === 'reserved-word');

      assert.ok(reservedIssue, 'Should report reserved-word');
      assert.ok(reservedIssue.message.includes('order'));
    });

    it('should report column naming violations', async () => {
      const dartFile = createDartFile('users', ['userId', 'userName']);
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const colIssues = issues.filter((i) => i.code === 'column-name-case');

      assert.strictEqual(colIssues.length, 2, 'Should report 2 column-name-case issues');
      assert.ok(colIssues[0].message.includes('userId'));
      assert.strictEqual(colIssues[0].data?.suggested, 'user_id');
    });

    it('should report SQL reserved words in column names', async () => {
      const dartFile = createDartFile('products', ['id', 'select', 'from']);
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const reservedIssues = issues.filter((i) => i.code === 'reserved-word');

      assert.strictEqual(reservedIssues.length, 2, 'Should report 2 reserved-word issues');
    });

    it('should not report properly named snake_case tables', async () => {
      const dartFile = createDartFile('user_accounts', ['user_id', 'created_at']);
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const caseIssues = issues.filter(
        (i) => i.code === 'table-name-case' || i.code === 'column-name-case'
      );

      assert.strictEqual(caseIssues.length, 0, 'Should not report any case issues');
    });

    it('should not flag simple lowercase names', async () => {
      const dartFile = createDartFile('users', ['id', 'name', 'email']);
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const caseIssues = issues.filter(
        (i) => i.code === 'table-name-case' || i.code === 'column-name-case'
      );

      assert.strictEqual(caseIssues.length, 0, 'Simple lowercase names should pass');
    });

    it('should not fire getter-table-mismatch when .named() override is used', async () => {
      // A .named() override IS the intentional declaration of a different SQL
      // name — reporting it as a mismatch contradicts column-name-acronym-mismatch
      // which tells users to add .named() as the fix.
      const dartFile = createDartFileWithNamedOverride(
        'users',
        [
          // Simple case: .named('user_name_v2') on a getter called userName
          { dartName: 'userName', sqlName: 'user_name_v2', hasNamedOverride: true },
          // Normal column without override — should still be checked
          { dartName: 'id', sqlName: 'id', hasNamedOverride: false },
        ],
      );
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const mismatchIssues = issues.filter((i) => i.code === 'getter-table-mismatch');

      assert.strictEqual(
        mismatchIssues.length,
        0,
        'Should not report getter-table-mismatch when .named() override is present',
      );
    });

    it('should not fire getter-table-mismatch for acronym case with .named() override', async () => {
      // Reproduces the exact scenario from the bug report: contactSaropaUUID
      // with .named('contact_saropa_uuid'). Without the fix, _toSnakeCase
      // produces 'contact_saropa_u_u_i_d' which differs from the .named() value,
      // causing a false positive.
      const dartFile = createDartFileWithNamedOverride(
        'contacts',
        [
          { dartName: 'id', sqlName: 'id', hasNamedOverride: false },
          {
            dartName: 'contactSaropaUUID',
            sqlName: 'contact_saropa_uuid',
            hasNamedOverride: true,
          },
        ],
      );
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const mismatchIssues = issues.filter((i) => i.code === 'getter-table-mismatch');

      assert.strictEqual(
        mismatchIssues.length,
        0,
        'Acronym getter with .named() override should not trigger getter-table-mismatch',
      );
    });

    it('should still fire getter-table-mismatch without .named() override', async () => {
      // Columns WITHOUT .named() that have a genuine mismatch should still be
      // caught — the fix must not suppress all mismatches, only intentional ones.
      const dartFile = createDartFileWithNamedOverride(
        'users',
        [
          // sqlName differs from _toSnakeCase(dartName) and dartName, but
          // hasNamedOverride is false — this is a genuine anomaly
          { dartName: 'userName', sqlName: 'usr_nm', hasNamedOverride: false },
        ],
      );
      const ctx = createContext({ dartFiles: [dartFile] });

      const issues = await provider.collectDiagnostics(ctx);
      const mismatchIssues = issues.filter((i) => i.code === 'getter-table-mismatch');

      assert.strictEqual(
        mismatchIssues.length,
        1,
        'Should still report getter-table-mismatch when there is no .named() override',
      );
    });
  });

  describe('provideCodeActions', () => {
    it('should provide copy suggested name action for naming violations', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 20),
        '[drift_advisor] Table "UserAccounts" doesn\'t follow snake_case',
        DiagnosticSeverity.Hint,
      );
      diag.code = 'table-name-case';
      (diag as any).data = { current: 'UserAccounts', suggested: 'user_accounts' };

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const copyAction = actions.find((a) => a.title.includes('user_accounts'));
      assert.ok(copyAction, 'Should have copy suggested name action');
      assert.ok(copyAction.isPreferred, 'Copy should be preferred action');
      assert.strictEqual(copyAction.command?.command, 'driftViewer.copySuggestedName');
    });

    it('should provide SQLite docs link for reserved words', () => {
      const diag = new Diagnostic(
        new Range(5, 0, 5, 20),
        '[drift_advisor] Table "order" uses SQL reserved word',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'reserved-word';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const docsAction = actions.find((a) => a.title.includes('Reserved Words'));
      assert.ok(docsAction, 'Should have docs action');
    });

    it('should always provide disable rule action', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 20),
        '[drift_advisor] Column name issue',
        DiagnosticSeverity.Hint,
      );
      diag.code = 'column-name-case';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const disableAction = actions.find((a) => a.title.includes('Disable'));
      assert.ok(disableAction, 'Should have disable action');
      assert.strictEqual(disableAction.command?.arguments?.[0], 'column-name-case');
    });
  });
});

function createContext(options: {
  dartFiles: IDartFileInfo[];
}): IDiagnosticContext {
  const client = {
    schemaMetadata: () => Promise.resolve([]),
    tableFkMeta: () => Promise.resolve([]),
  } as any;

  return {
    client,
    schemaIntel: {} as any,
    queryIntel: {} as any,
    dartFiles: options.dartFiles,
    config: {
      enabled: true,
      refreshOnSave: true,
      refreshIntervalMs: 30000,
      categories: {
        schema: true,
        performance: true,
        dataQuality: true,
        bestPractices: true,
        naming: true,
        runtime: true,
        compliance: true,
      },
      severityOverrides: {},
      disabledRules: new Set(),
      tableExclusions: new Map(),
      columnExclusions: new Map(),
    },
  };
}

function createDartFile(
  tableName: string,
  columns: string[],
): IDartFileInfo {
  const dartColumns = columns.map((name, idx) => ({
    dartName: name,
    sqlName: name,
    dartType: name === 'id' || name.endsWith('_id') ? 'IntColumn' : 'TextColumn',
    sqlType: name === 'id' || name.endsWith('_id') ? 'INTEGER' : 'TEXT',
    nullable: false,
    autoIncrement: name === 'id',
    line: 10 + idx,
  }));

  const dartTable: IDartTable = {
    dartClassName: tableName.charAt(0).toUpperCase() + tableName.slice(1),
    sqlTableName: tableName,
    columns: dartColumns,
    indexes: [],
    uniqueKeys: [],
    fileUri: `file:///lib/database/${tableName}.dart`,
    line: 5,
  };

  return {
    uri: Uri.parse(`file:///lib/database/${tableName}.dart`) as any,
    text: `class ${dartTable.dartClassName} extends Table {}`,
    tables: [dartTable],
    suppressions: emptySuppressions(),
  };
}

/**
 * Creates a Dart file fixture with explicit control over hasNamedOverride
 * per column — used to test that .named() overrides suppress
 * getter-table-mismatch while non-overridden mismatches are still caught.
 */
function createDartFileWithNamedOverride(
  tableName: string,
  columns: { dartName: string; sqlName: string; hasNamedOverride: boolean }[],
): IDartFileInfo {
  const dartColumns = columns.map((col, idx) => ({
    dartName: col.dartName,
    sqlName: col.sqlName,
    dartType: col.dartName === 'id' ? 'IntColumn' : 'TextColumn',
    sqlType: col.dartName === 'id' ? 'INTEGER' : 'TEXT',
    nullable: false,
    autoIncrement: col.dartName === 'id',
    hasNamedOverride: col.hasNamedOverride,
    line: 10 + idx,
  }));

  const dartTable: IDartTable = {
    dartClassName: tableName.charAt(0).toUpperCase() + tableName.slice(1),
    sqlTableName: tableName,
    columns: dartColumns,
    indexes: [],
    uniqueKeys: [],
    fileUri: `file:///lib/database/${tableName}.dart`,
    line: 5,
  };

  return {
    uri: Uri.parse(`file:///lib/database/${tableName}.dart`) as any,
    text: `class ${dartTable.dartClassName} extends Table {}`,
    tables: [dartTable],
    suppressions: emptySuppressions(),
  };
}
