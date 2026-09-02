/**
 * Tests for the table-file suppression fallback in buildDiagnosticsByFile.
 *
 * When an n-plus-one diagnostic is pinned to a caller site, the primary
 * suppression check misses ignore directives in the table definition file
 * because the caller file is not in dartFiles. The fallback uses
 * issue.data.tableFileUri / tableFileLine to consult the table file's
 * suppressions.
 */

import * as assert from 'assert';
import {
  DiagnosticSeverity,
  Range,
  Uri,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { buildDiagnosticsByFile } from '../diagnostics/diagnostic-apply';
import { parseInlineSuppressions, emptySuppressions } from '../diagnostics/suppression';
import type { IDartFileInfo, IDiagnosticConfig, IDiagnosticIssue } from '../diagnostics/diagnostic-types';

// Minimal config with all rules enabled and no exclusions.
function defaultConfig(): IDiagnosticConfig {
  return {
    enabled: true,
    refreshOnSave: true,
    refreshIntervalMs: 30000,
    categories: {
      schema: true,
      performance: true,
      dataQuality: true,
      bestPractices: true,
      naming: false,
      runtime: true,
      compliance: true,
    },
    disabledRules: new Set(),
    severityOverrides: {},
    tableExclusions: new Map(),
    columnExclusions: new Map(),
  };
}

describe('buildDiagnosticsByFile – table-file suppression fallback', () => {
  beforeEach(() => {
    resetMocks();
  });

  // Table file with an ignore directive above the class line (line 3).
  // The directive on line 2 targets line 3 (next non-blank line).
  const TABLE_SRC = [
    'import \'package:drift/drift.dart\';',                   // 0
    '',                                                         // 1
    '// drift-advisor:ignore n-plus-one',                       // 2
    'class Activities extends Table {',                         // 3
    '  IntColumn get id => integer().autoIncrement()();',       // 4
    '}',                                                        // 5
  ].join('\n');

  const TABLE_URI = Uri.parse('file:///lib/database/activities.dart') as any;

  // Build the table dartFile with real suppression parsing.
  function tableFile(): IDartFileInfo {
    return {
      uri: TABLE_URI,
      text: TABLE_SRC,
      tables: [{
        dartClassName: 'Activities',
        sqlTableName: 'activities',
        columns: [],
        indexes: [],
        uniqueKeys: [],
        fileUri: TABLE_URI.toString(),
        line: 3,
      }],
      suppressions: parseInlineSuppressions(TABLE_SRC),
    };
  }

  // Caller file is NOT in dartFiles — mirrors real usage where the caller
  // is a repository/service file, not a table definition.
  const CALLER_URI = Uri.parse('file:///lib/src/activity_repository.dart') as any;

  // Issue pinned to the caller, carrying tableFileUri/tableFileLine.
  function callerPinnedIssue(overrides?: Partial<IDiagnosticIssue>): IDiagnosticIssue {
    return {
      code: 'n-plus-one',
      message: 'Potential N+1 query pattern: "activities" queried 15 times in recent window',
      fileUri: CALLER_URI,
      range: new Range(87, 0, 87, 999) as any,
      severity: DiagnosticSeverity.Information as any,
      data: {
        tableName: 'activities',
        tableFileUri: TABLE_URI.toString(),
        tableFileLine: 3,
      },
      ...overrides,
    };
  }

  it('suppresses n-plus-one via field-level ignore in table file when pinned to caller', () => {
    // The table file has `// drift-advisor:ignore n-plus-one` targeting line 3.
    // The issue carries tableFileUri + tableFileLine=3.
    const result = buildDiagnosticsByFile(
      [callerPinnedIssue()],
      defaultConfig(),
      [tableFile()],
    );

    // The diagnostic should be suppressed — no output for any file.
    assert.strictEqual(result.size, 0, 'Diagnostic should be suppressed by table file directive');
  });

  it('suppresses n-plus-one via file-level ignore-file in table file', () => {
    // Table file with ignore-file directive (suppresses all n-plus-one in the file).
    const fileLevelSrc = '// drift-advisor:ignore-file n-plus-one\nclass Activities extends Table {}';
    const df: IDartFileInfo = {
      uri: TABLE_URI,
      text: fileLevelSrc,
      tables: [{
        dartClassName: 'Activities',
        sqlTableName: 'activities',
        columns: [],
        indexes: [],
        uniqueKeys: [],
        fileUri: TABLE_URI.toString(),
        line: 1,
      }],
      suppressions: parseInlineSuppressions(fileLevelSrc),
    };

    const result = buildDiagnosticsByFile(
      [callerPinnedIssue({ data: { tableName: 'activities', tableFileUri: TABLE_URI.toString(), tableFileLine: 1 } })],
      defaultConfig(),
      [df],
    );

    assert.strictEqual(result.size, 0, 'file-level ignore-file should suppress caller-pinned diagnostic');
  });

  it('does NOT suppress when table file has no ignore directive', () => {
    // Table file with empty suppressions — diagnostic should pass through.
    const df: IDartFileInfo = {
      uri: TABLE_URI,
      text: 'class Activities extends Table {}',
      tables: [{
        dartClassName: 'Activities',
        sqlTableName: 'activities',
        columns: [],
        indexes: [],
        uniqueKeys: [],
        fileUri: TABLE_URI.toString(),
        line: 0,
      }],
      suppressions: emptySuppressions(),
    };

    const result = buildDiagnosticsByFile(
      [callerPinnedIssue({ data: { tableName: 'activities', tableFileUri: TABLE_URI.toString(), tableFileLine: 0 } })],
      defaultConfig(),
      [df],
    );

    // Diagnostic should NOT be suppressed.
    assert.strictEqual(result.size, 1, 'Diagnostic should pass through without ignore directive');
  });

  it('does NOT suppress when issue has no tableFileUri (table-pinned diagnostic)', () => {
    // Issue pinned directly to the table file, no tableFileUri in data.
    // The primary suppression check handles this case — the fallback should not fire.
    const df = tableFile();
    const tablePinnedIssue: IDiagnosticIssue = {
      code: 'n-plus-one',
      message: 'Potential N+1 query pattern',
      fileUri: TABLE_URI,
      range: new Range(3, 0, 3, 999) as any,
      severity: DiagnosticSeverity.Information as any,
      data: { tableName: 'activities' },
    };

    const result = buildDiagnosticsByFile(
      [tablePinnedIssue],
      defaultConfig(),
      [df],
    );

    // The primary check should suppress it (line 3 matches the directive target).
    assert.strictEqual(result.size, 0, 'Table-pinned diagnostic should be suppressed by primary check');
  });

  it('does not suppress a different code via the table file fallback', () => {
    // Table file ignores n-plus-one but not slow-query-pattern.
    const issue = callerPinnedIssue({ code: 'slow-query-pattern' });

    const result = buildDiagnosticsByFile(
      [issue],
      defaultConfig(),
      [tableFile()],
    );

    // slow-query-pattern should NOT be suppressed by the n-plus-one ignore.
    assert.strictEqual(result.size, 1, 'Different code should not be suppressed by n-plus-one ignore');
  });

  it('suppresses slow-query-pattern via ignore directive in table file when pinned to caller', () => {
    // Table file with an ignore directive targeting slow-query-pattern.
    const slowIgnoreSrc = [
      'import \'package:drift/drift.dart\';',
      '',
      '// drift-advisor:ignore slow-query-pattern',
      'class Activities extends Table {',
      '  IntColumn get id => integer().autoIncrement()();',
      '}',
    ].join('\n');

    const df: IDartFileInfo = {
      uri: TABLE_URI,
      text: slowIgnoreSrc,
      tables: [{
        dartClassName: 'Activities',
        sqlTableName: 'activities',
        columns: [],
        indexes: [],
        uniqueKeys: [],
        fileUri: TABLE_URI.toString(),
        line: 3,
      }],
      suppressions: parseInlineSuppressions(slowIgnoreSrc),
    };

    // Slow-query issue pinned to a caller, carrying table file info.
    const issue: IDiagnosticIssue = {
      code: 'slow-query-pattern',
      message: 'Slow query (250ms): SELECT * FROM activities WHERE ...',
      fileUri: CALLER_URI,
      range: new Range(42, 0, 42, 999) as any,
      severity: DiagnosticSeverity.Information as any,
      data: {
        sql: 'SELECT * FROM activities WHERE id = 1',
        durationMs: 250,
        tableName: 'activities',
        tableFileUri: TABLE_URI.toString(),
        tableFileLine: 3,
      },
    };

    const result = buildDiagnosticsByFile([issue], defaultConfig(), [df]);

    assert.strictEqual(result.size, 0, 'slow-query-pattern should be suppressed via table file fallback');
  });
});
