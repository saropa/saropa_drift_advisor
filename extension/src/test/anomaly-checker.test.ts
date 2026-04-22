/**
 * Tests for checkAnomalies — covers the column-line lookup that
 * replaces the former class-header placement. The bug report
 * (bugs/anomaly_false_positive_tight_timestamp_range.md, Bug 2)
 * called for diagnostics to land on the column getter rather
 * than the `class Foo extends Table` header, so these cases
 * verify both the happy path (column resolved → column line)
 * and the fallback (column not found → class line).
 */

import * as assert from 'assert';
import type { Anomaly } from '../api-types';
import { checkAnomalies } from '../diagnostics/checkers/anomaly-checker';
import type { IDiagnosticIssue } from '../diagnostics/diagnostic-types';
import { createDartFile } from './diagnostic-test-helpers';

describe('checkAnomalies', () => {
  it('places the diagnostic on the column getter line when the column resolves', () => {
    // createDartFile places the class at line 5 and each column
    // at 10 + index. An anomaly on `contact_points.last_modified`
    // should land on the `last_modified` getter line (11), NOT
    // the class header (5).
    const file = createDartFile('contact_points', ['id', 'last_modified', 'name']);
    const issues: IDiagnosticIssue[] = [];
    const anomalies: Anomaly[] = [
      {
        message:
          'Potential outlier in contact_points.last_modified: max value 1776862643.0 is 4.1σ from mean 1776805997.23 (range [1776802512.0, 1776862643.0])',
        severity: 'info',
      },
    ];

    checkAnomalies(issues, anomalies, [file]);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(
      issues[0].range.start.line,
      11,
      'should land on last_modified getter (line 11), not class header (line 5)',
    );
    assert.strictEqual(issues[0].code, 'anomaly');
  });

  it('falls back to the class header when the column does not resolve', () => {
    // Column `ghost_column` is not in the parsed Dart file —
    // this simulates a schema/codegen gap. The diagnostic must
    // still appear (on the class header), not silently drop,
    // so the user still sees the server-reported issue.
    const file = createDartFile('contact_points', ['id', 'last_modified']);
    const issues: IDiagnosticIssue[] = [];
    const anomalies: Anomaly[] = [
      {
        message:
          '5 NULL value(s) in NOT NULL column contact_points.ghost_column (10.0%)',
        severity: 'warning',
      },
    ];

    checkAnomalies(issues, anomalies, [file]);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(
      issues[0].range.start.line,
      5,
      'should fall back to class header (line 5) when column unknown',
    );
  });

  it('matches column names case-insensitively (camelCase Dart → snake_case SQL)', () => {
    // Server reports `last_modified` (SQLite), but the Drift
    // getter is `lastModified`. `createDartFile` stores
    // `sqlName` as the raw name passed in — we mimic both
    // casings and rely on the checker's toLowerCase comparison.
    const file = createDartFile('contact_points', ['id', 'LAST_MODIFIED']);
    const issues: IDiagnosticIssue[] = [];
    const anomalies: Anomaly[] = [
      {
        message: 'Potential outlier in contact_points.last_modified: …',
        severity: 'info',
      },
    ];

    checkAnomalies(issues, anomalies, [file]);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].range.start.line, 11);
  });

  it('emits `orphaned-fk` code for severity=error anomalies', () => {
    // Severity-driven code routing is load-bearing for code
    // actions (SchemaProvider handles 'orphaned-fk' but not
    // generic 'anomaly'). Guard the branch so a future refactor
    // doesn't silently lose the orphan-FK code actions.
    const file = createDartFile('posts', ['id', 'author_id']);
    const issues: IDiagnosticIssue[] = [];
    const anomalies: Anomaly[] = [
      {
        message: '3 orphaned FK(s): posts.author_id -> users.id',
        severity: 'error',
      },
    ];

    checkAnomalies(issues, anomalies, [file]);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].code, 'orphaned-fk');
  });

  it('skips anomalies whose message has no `table.column` pattern', () => {
    // duplicate_rows messages are table-scoped and have no dot
    // form — the prior behavior was to drop them silently
    // (no Dart location to attach to). This test pins that
    // behavior so a future widening of the regex doesn't start
    // attaching table-scoped anomalies to arbitrary columns.
    const file = createDartFile('contact_points', ['id']);
    const issues: IDiagnosticIssue[] = [];
    const anomalies: Anomaly[] = [
      { message: '2 duplicate row(s) in contact_points', severity: 'warning' },
    ];

    checkAnomalies(issues, anomalies, [file]);

    assert.strictEqual(issues.length, 0);
  });
});
