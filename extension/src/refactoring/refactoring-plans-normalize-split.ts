/**
 * Migration-plan builders for the `normalize` and `split` refactoring types.
 * Output is advisory: callers must review before applying.
 */

import type { TableMetadata } from '../api-types';
import type { IMigrationPlan, IMigrationStep } from './refactoring-types';
import {
  findSinglePkColumn,
  findTable,
  generateDartMigration,
  lookupTableName,
  pascalCaseFromSqlTable,
  quoteIdent,
  sqlTypeForColumn,
} from './refactoring-plan-naming';

/**
 * Normalization: new lookup table + FK column + backfill + optional drop of text column.
 */
export function buildNormalizationPlan(table: string, column: string): IMigrationPlan {
  const newTable = lookupTableName(table, column);
  const qt = quoteIdent(table);
  const qc = quoteIdent(column);
  const qn = quoteIdent(newTable);
  const fkCol = `${column}_id`;

  const steps: IMigrationStep[] = [
    {
      title: 'Create lookup table',
      description: `New table ${newTable} holding distinct ${column} values.`,
      sql: `CREATE TABLE ${qn} (\n  "id" INTEGER PRIMARY KEY AUTOINCREMENT,\n  "name" TEXT NOT NULL UNIQUE\n);`,
      reversible: true,
    },
    {
      title: 'Populate lookup table',
      description: `Insert distinct values from ${table}.${column}.`,
      sql: `INSERT INTO ${qn} ("name")\nSELECT DISTINCT ${qc} FROM ${qt}\nWHERE ${qc} IS NOT NULL;`,
      reversible: true,
    },
    {
      title: 'Add referencing column',
      description: `Add ${fkCol} referencing ${newTable}(id).`,
      sql: `ALTER TABLE ${qt}\nADD COLUMN ${quoteIdent(fkCol)} INTEGER REFERENCES ${qn}("id");`,
      reversible: true,
    },
    {
      title: 'Backfill foreign keys',
      description: `Populate ${fkCol} from existing text values.`,
      sql: `UPDATE ${qt} SET ${quoteIdent(fkCol)} = (\n  SELECT "id" FROM ${qn}\n  WHERE ${qn}."name" = ${qt}.${qc}\n)\nWHERE ${qc} IS NOT NULL;`,
      reversible: false,
    },
    {
      title: 'Drop legacy text column',
      description: `Remove ${column} after verifying reads use ${fkCol}.`,
      sql: `ALTER TABLE ${qt} DROP COLUMN ${qc};`,
      reversible: false,
      destructive: true,
    },
  ];

  const className = pascalCaseFromSqlTable(newTable);
  const dartCode = generateDartMigration(steps);
  const driftTableClass = `class ${className} extends Table {\n  IntColumn get id => integer().autoIncrement()();\n  TextColumn get name => text().unique()();\n}`;

  return {
    steps,
    dartCode,
    driftTableClass,
    preflightWarnings: [
      'SQLite 3.35.0+ is required for ALTER TABLE ... DROP COLUMN; older targets may need a table rebuild migration.',
      'Ensure application code reads the new foreign key before dropping the legacy text column.',
    ],
  };
}

/**
 * Split: creates a 1:1 detail table keyed by the parent primary key (single-column PK only).
 */
export function buildSplitPlan(tableName: string, tablesMeta: TableMetadata[]): IMigrationPlan {
  const table = findTable(tablesMeta, tableName);
  if (!table) {
    return {
      steps: [],
      dartCode: '',
      driftTableClass: '',
      preflightWarnings: [`Table metadata for "${tableName}" was not found.`],
    };
  }
  const pk = findSinglePkColumn(table);
  if (!pk) {
    return {
      steps: [
        {
          title: 'Manual split required',
          description: `Table "${tableName}" has a composite or missing primary key; automatic split templates are not generated.`,
          sql: `-- Review primary keys and design a keyed child table manually.`,
          reversible: true,
        },
      ],
      dartCode: '',
      driftTableClass: '',
      preflightWarnings: ['Composite or ambiguous primary keys require a hand-written migration.'],
    };
  }

  const detailName = `${tableName}_detail`.replace(/[^a-zA-Z0-9_]/g, '_');
  const qd = quoteIdent(detailName);
  const qt = quoteIdent(tableName);
  const qpk = quoteIdent(pk.name);

  const nonPk = table.columns.filter((c) => !c.pk);
  const colDefs = nonPk
    .map((c) => `  ${quoteIdent(c.name)} ${sqlTypeForColumn(c)}`)
    .join(',\n');

  const createSql = `CREATE TABLE ${qd} (\n  ${qpk} INTEGER NOT NULL PRIMARY KEY REFERENCES ${qt}(${qpk}) ON DELETE CASCADE${nonPk.length ? ',\n' + colDefs : ''}\n);`;

  const insertCols = [qpk, ...nonPk.map((c) => quoteIdent(c.name))].join(', ');
  const selectCols = [quoteIdent(pk.name), ...nonPk.map((c) => quoteIdent(c.name))].join(', ');

  const insertSql = `INSERT INTO ${qd} (${insertCols})\nSELECT ${selectCols} FROM ${qt};`;

  const steps: IMigrationStep[] = [
    {
      title: 'Create detail table',
      description: `One row per parent key in ${detailName}, referencing ${tableName}.`,
      sql: createSql,
      reversible: true,
    },
    {
      title: 'Backfill detail rows',
      description: `Copy non-key columns from ${tableName} into ${detailName}.`,
      sql: insertSql,
      reversible: false,
    },
    {
      title: 'Optional: drop moved columns from parent',
      description:
        'After deploying code that reads from the detail table, drop redundant columns from the parent (destructive).',
      sql: `-- Example per column (run only after code changes):\n-- ALTER TABLE ${qt} DROP COLUMN ${quoteIdent('some_column')};`,
      reversible: true,
      destructive: true,
    },
  ];

  const dartCode = generateDartMigration(steps);
  const driftTableClass = `// Add a Drift table class for ${detailName} mirroring the CREATE TABLE above.\n// Example: class ${pascalCaseFromSqlTable(detailName)} extends Table { ... }`;

  return {
    steps,
    dartCode,
    driftTableClass,
    preflightWarnings: [
      'Verify ORM / query code loads related detail rows before dropping parent columns.',
      'Large tables may need batched INSERTs not shown in this template.',
    ],
  };
}
