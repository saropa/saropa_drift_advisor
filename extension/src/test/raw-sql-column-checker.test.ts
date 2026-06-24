import * as assert from 'assert';
import * as vscode from 'vscode';
import type { TableMetadata } from '../api-types';
import { checkRawSqlColumns } from '../diagnostics/checkers/raw-sql-column-checker';
import { TableNameMapper } from '../codelens/table-name-mapper';
import { emptySuppressions } from '../diagnostics/suppression';
import type {
  IDartFileInfo,
  IDiagnosticIssue,
} from '../diagnostics/diagnostic-types';

function col(name: string): { name: string; type: string; pk: boolean } {
  return { name, type: 'TEXT', pk: false };
}

/** Build the exact + normalized table maps the checker consumes. */
function makeMaps(
  tables: TableMetadata[],
): {
  exact: Map<string, TableMetadata>;
  normalized: Map<string, TableMetadata>;
} {
  const exact = new Map<string, TableMetadata>();
  const normalized = new Map<string, TableMetadata>();
  for (const t of tables) {
    exact.set(t.name, t);
    normalized.set(TableNameMapper.normalizeForComparison(t.name), t);
  }
  return { exact, normalized };
}

function makeFile(text: string): IDartFileInfo {
  return {
    uri: vscode.Uri.file('/x/test.dart'),
    text,
    tables: [],
    suppressions: emptySuppressions(),
  };
}

const avatars: TableMetadata = {
  name: 'contact_avatars',
  rowCount: 0,
  columns: [
    col('id'),
    col('image'),
    col('contact_saropa_u_u_i_d'),
  ],
};

describe('checkRawSqlColumns', () => {
  it('flags the unknown column from the motivating incident', () => {
    const issues: IDiagnosticIssue[] = [];
    const { exact, normalized } = makeMaps([avatars]);
    const file = makeFile(
      "db.customSelect('SELECT contact_saropa_uuid AS uuid, " +
        "LENGTH(image) AS sz FROM contact_avatars').get();",
    );

    checkRawSqlColumns(issues, file, exact, normalized);

    assert.strictEqual(issues.length, 1);
    const issue = issues[0];
    assert.strictEqual(issue.code, 'raw-sql-unknown-column');
    assert.ok(issue.message.includes('contact_saropa_uuid'));
    assert.ok(issue.message.includes('contact_avatars'));
    // The real column is suggested as the nearest match.
    assert.ok(issue.message.includes('contact_saropa_u_u_i_d'));
    assert.strictEqual(issue.data?.tableName, 'contact_avatars');
    assert.strictEqual(issue.data?.column, 'contact_saropa_uuid');
  });

  it('does not flag valid columns', () => {
    const issues: IDiagnosticIssue[] = [];
    const { exact, normalized } = makeMaps([avatars]);
    const file = makeFile(
      "db.customSelect('SELECT id, image FROM contact_avatars');",
    );

    checkRawSqlColumns(issues, file, exact, normalized);

    assert.strictEqual(issues.length, 0);
  });

  it('skips queries against tables not in the profiled schema', () => {
    const issues: IDiagnosticIssue[] = [];
    const { exact, normalized } = makeMaps([avatars]);
    const file = makeFile(
      "db.customSelect('SELECT anything FROM some_cte');",
    );

    checkRawSqlColumns(issues, file, exact, normalized);

    assert.strictEqual(issues.length, 0);
  });

  it('pins the diagnostic range to the offending column token', () => {
    const issues: IDiagnosticIssue[] = [];
    const { exact, normalized } = makeMaps([avatars]);
    const text = "db.customSelect('SELECT bad FROM contact_avatars');";
    const file = makeFile(text);

    checkRawSqlColumns(issues, file, exact, normalized);

    assert.strictEqual(issues.length, 1);
    const range = issues[0].range;
    const expectedStart = text.indexOf('bad');
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, expectedStart);
    assert.strictEqual(range.end.character, expectedStart + 3);
  });

  it('matches column names case-insensitively', () => {
    const issues: IDiagnosticIssue[] = [];
    const { exact, normalized } = makeMaps([avatars]);
    const file = makeFile(
      "db.customSelect('SELECT IMAGE FROM contact_avatars');",
    );

    checkRawSqlColumns(issues, file, exact, normalized);

    assert.strictEqual(issues.length, 0);
  });
});
