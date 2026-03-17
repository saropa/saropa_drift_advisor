/**
 * Rollback generator tests: Dart output and CREATE TABLE formatting.
 */

import * as assert from 'assert';
import { generateRollback } from '../rollback/rollback-generator';
import type { ISchemaChange } from '../schema-timeline/schema-timeline-types';
import { col, snap } from './rollback-generator-test-helpers';

describe('generateRollback — Dart output & formatting', () => {
  it('generates valid Dart with import and customStatement calls', () => {
    const changes: ISchemaChange[] = [
      { type: 'table_added', table: 'users', detail: '' },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    assert.ok(result.dart.includes("import 'package:drift/drift.dart';"));
    assert.ok(result.dart.includes('generation 1 to 2'));
    assert.ok(result.dart.includes('await customStatement('));
    assert.ok(result.dart.includes('DROP TABLE IF EXISTS'));
  });

  it('escapes single quotes in single-line Dart string literals', () => {
    const changes: ISchemaChange[] = [
      { type: 'table_added', table: "it's_a_table", detail: '' },
    ];

    const result = generateRollback(changes, snap(1), snap(2));

    assert.ok(
      result.dart.includes("\\'"),
      'Single quotes should be escaped in Dart strings',
    );
  });

  it('uses triple-quote strings for multi-line SQL in Dart', () => {
    const before = snap(1, [
      {
        name: 'items',
        columns: [col('id', 'INTEGER', true), col('name', 'TEXT')],
        fks: [],
      },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'table_dropped', table: 'items', detail: '' },
    ];

    const result = generateRollback(changes, before, snap(2));

    assert.ok(
      result.dart.includes("await customStatement('''"),
      'Multi-line SQL should use triple-quote Dart strings',
    );
    assert.ok(
      result.dart.includes("''');"),
      'Triple-quote block should be properly closed',
    );
  });

  it('converts SQL comments to Dart comments', () => {
    const changes: ISchemaChange[] = [
      {
        type: 'column_type_changed',
        table: 't',
        detail: '"col" INTEGER → TEXT',
      },
    ];
    const result = generateRollback(changes, snap(1), snap(2));

    assert.ok(result.dart.includes('//'));
    assert.ok(!result.dart.includes("customStatement(\n  '--"));
  });

  it('includes PRIMARY KEY annotation in recreated table', () => {
    const before = snap(1, [
      {
        name: 'items',
        columns: [col('id', 'INTEGER', true), col('name', 'TEXT')],
        fks: [],
      },
    ]);
    const changes: ISchemaChange[] = [
      { type: 'table_dropped', table: 'items', detail: '' },
    ];

    const result = generateRollback(changes, before, snap(2));

    assert.ok(result.sql[0].includes('PRIMARY KEY'));
    assert.ok(result.sql[0].includes('"name" TEXT'));
    assert.ok(!result.sql[0].includes('"name" TEXT PRIMARY KEY'));
  });
});
