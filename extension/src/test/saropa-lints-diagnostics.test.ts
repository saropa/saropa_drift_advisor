import * as assert from 'assert';
import { DiagnosticSeverity } from './vscode-mock-classes';
import {
  mapScanSeverity,
  parseScanReport,
  mapReportToFileDiagnostics,
  type IScanReport,
} from '../saropa-lints-diagnostics';

describe('SaropaLintsDiagnostics parsing', () => {
  describe('mapScanSeverity', () => {
    it('maps analyzer severity names case-insensitively', () => {
      assert.strictEqual(mapScanSeverity('ERROR'), DiagnosticSeverity.Error);
      assert.strictEqual(mapScanSeverity('warning'), DiagnosticSeverity.Warning);
      assert.strictEqual(mapScanSeverity('Info'), DiagnosticSeverity.Information);
    });

    it('falls back to Information for unknown severities (never drops a finding)', () => {
      assert.strictEqual(mapScanSeverity('whatever'), DiagnosticSeverity.Information);
      assert.strictEqual(mapScanSeverity(''), DiagnosticSeverity.Information);
    });
  });

  describe('parseScanReport', () => {
    it('parses a clean v1 report', () => {
      const json = JSON.stringify({
        version: 1,
        diagnostics: [
          { filePath: 'lib/a.dart', line: 5, column: 3, ruleName: 'r', severity: 'INFO' },
        ],
        summary: { totalCount: 1, byFile: {}, byRule: { r: 1 } },
      });
      const report = parseScanReport(json);
      assert.ok(report);
      assert.strictEqual(report.diagnostics.length, 1);
    });

    it('tolerates build chatter prepended by `dart run` before the JSON', () => {
      const json =
        'Building package executable...\nBuilt saropa_lints:scan.\n' +
        JSON.stringify({ version: 1, diagnostics: [] });
      const report = parseScanReport(json);
      assert.ok(report);
      assert.strictEqual(report.diagnostics.length, 0);
    });

    it('returns null for non-JSON output', () => {
      assert.strictEqual(parseScanReport('No issues found.'), null);
      assert.strictEqual(parseScanReport(''), null);
    });

    it('returns null when the diagnostics array is missing', () => {
      assert.strictEqual(parseScanReport('{"version":1}'), null);
    });
  });

  describe('mapReportToFileDiagnostics', () => {
    const report: IScanReport = {
      version: 1,
      diagnostics: [
        {
          filePath: 'lib/a.dart',
          line: 10,
          column: 4,
          ruleName: 'avoid_x',
          severity: 'WARNING',
          problemMessage: 'Avoid X here',
          correctionMessage: 'Use Y instead',
        },
        {
          filePath: 'lib/a.dart',
          line: 12,
          column: 1,
          ruleName: 'prefer_z',
          severity: 'INFO',
          problemMessage: 'Prefer Z',
        },
        {
          filePath: 'lib/b.dart',
          line: 1,
          column: 1,
          ruleName: 'avoid_x',
          severity: 'ERROR',
          problemMessage: 'Bad',
        },
      ],
    };

    it('groups diagnostics by file', () => {
      const grouped = mapReportToFileDiagnostics(report, '/root');
      assert.strictEqual(grouped.length, 2, 'two distinct files');
      const counts = grouped.map((g) => g.diagnostics.length).sort();
      assert.deepStrictEqual(counts, [1, 2]);
    });

    it('converts 1-based analyzer coords to 0-based VS Code ranges', () => {
      const grouped = mapReportToFileDiagnostics(report, '/root');
      const aFile = grouped.find((g) => g.uri.fsPath.includes('a.dart'));
      assert.ok(aFile);
      const first = aFile.diagnostics[0];
      assert.strictEqual(first.range.start.line, 9, 'line 10 -> 9');
      assert.strictEqual(first.range.start.character, 3, 'column 4 -> 3');
    });

    it('carries rule name as code, sets source, and appends the correction', () => {
      const grouped = mapReportToFileDiagnostics(report, '/root');
      const aFile = grouped.find((g) => g.uri.fsPath.includes('a.dart'));
      const first = aFile!.diagnostics[0];
      assert.strictEqual(first.code, 'avoid_x');
      assert.strictEqual(first.source, 'Saropa Lints');
      assert.strictEqual(first.severity, DiagnosticSeverity.Warning);
      assert.ok(first.message.includes('Avoid X here'));
      assert.ok(first.message.includes('Use Y instead'), 'correction appended');
    });

    it('uses the rule name as the message when no problemMessage is present', () => {
      const r: IScanReport = {
        version: 1,
        diagnostics: [
          { filePath: 'lib/c.dart', line: 1, column: 1, ruleName: 'bare_rule', severity: 'INFO' },
        ],
      };
      const grouped = mapReportToFileDiagnostics(r, '/root');
      assert.strictEqual(grouped[0].diagnostics[0].message, 'bare_rule');
    });
  });
});
