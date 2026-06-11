/**
 * Migration-plan builders for the `merge` and `extract` refactoring types.
 * Output is advisory: callers must review before applying.
 */

import type { TableMetadata } from '../api-types';
import type { IMigrationPlan, IMigrationStep } from './refactoring-types';
import {
  driftColumnGetter,
  findSinglePkColumn,
  findTable,
  generateDartMigration,
  pascalCaseFromSqlTable,
  quoteIdent,
  sharedExtractTableName,
  sqlTypeForColumn,
  suggestedMergeFkColumn,
} from './refactoring-plan-naming';

/**
 * Merge: template for introducing a foreign key using the overlapping column as join key.
 */
export function buildMergePlan(
  fromTable: string,
  toTable: string,
  column: string,
  tablesMeta: TableMetadata[],
): IMigrationPlan {
  const tMeta = findTable(tablesMeta, toTable);
  if (!tMeta) {
    return {
      steps: [],
      dartCode: '',
      driftTableClass: '',
      preflightWarnings: [`Table metadata for "${toTable}" was not found.`],
    };
  }
  const pk = findSinglePkColumn(tMeta);
  const qc = quoteIdent(column);
  const qFrom = quoteIdent(fromTable);
  const qTo = quoteIdent(toTable);

  if (!pk) {
    return {
      steps: [
        {
          title: 'Manual merge required',
          description: `Target table "${toTable}" lacks a single-column primary key for a simple FK template.`,
          sql: `-- Design a composite-key or natural-key relationship manually.`,
          reversible: true,
        },
      ],
      dartCode: '',
      driftTableClass: '',
      preflightWarnings: ['Composite keys on the referenced table need a custom migration.'],
    };
  }

  const fkCol = suggestedMergeFkColumn(toTable, pk.name);
  const qFk = quoteIdent(fkCol);
  const qPk = quoteIdent(pk.name);

  const steps: IMigrationStep[] = [
    {
      title: 'Add nullable foreign key column',
      description: `Add ${fkCol} on ${fromTable} referencing ${toTable}.${pk.name}.`,
      sql: `ALTER TABLE ${qFrom}\nADD COLUMN ${qFk} INTEGER REFERENCES ${qTo}(${qPk});`,
      reversible: true,
    },
    {
      title: 'Populate foreign keys from overlapping text/value column',
      description: `Match rows where ${fromTable}.${column} equals ${toTable}.${column}.`,
      sql: `UPDATE ${qFrom}\nSET ${qFk} = (\n  SELECT ${qPk} FROM ${qTo}\n  WHERE ${qTo}.${qc} = ${qFrom}.${qc}\n)\nWHERE ${qc} IS NOT NULL;`,
      reversible: false,
    },
    {
      title: 'Optional: drop redundant column',
      description: `After code reads ${fkCol}, consider removing ${column} from ${fromTable}.`,
      sql: `-- ALTER TABLE ${qFrom} DROP COLUMN ${qc};`,
      reversible: true,
      destructive: true,
    },
  ];

  return {
    steps,
    dartCode: generateDartMigration(steps),
    driftTableClass: `// Add an IntColumn ${fkCol} to the ${pascalCaseFromSqlTable(fromTable)} table class after editing schema.dart.`,
    preflightWarnings: [
      `Confirm ${toTable}.${column} is effectively unique (or choose a different referenced column) before relying on this UPDATE.`,
      'Overlapping values can be coincidental; validate semantics before dropping legacy columns.',
    ],
  };
}

/**
 * Extract: define a recurring column bundle once. Emits a shared-table + FK
 * template (best for shared entities like addresses) plus a Drift mixin
 * (best for per-row metadata like timestamps). Advisory only — the backfill
 * and drop are left as commented steps because de-duplication semantics
 * depend on whether the bundle is a shared entity or per-row data.
 */
export function buildExtractPlan(
  columns: string[],
  sourceTables: string[],
  tablesMeta: TableMetadata[],
): IMigrationPlan {
  if (columns.length === 0 || sourceTables.length === 0) {
    return {
      steps: [],
      dartCode: '',
      driftTableClass: '',
      preflightWarnings: ['Unable to build an extract plan (no columns or tables in the bundle).'],
    };
  }

  const sharedName = sharedExtractTableName(columns);
  const qs = quoteIdent(sharedName);
  const fkCol = `${sharedName}_id`;

  // Resolve each column's type from the first source table that declares it;
  // default to TEXT when metadata is missing so the template still renders.
  const sqlTypeForName = (name: string): string => {
    for (const tn of sourceTables) {
      const t = findTable(tablesMeta, tn);
      const c = t?.columns.find((cc) => cc.name.toLowerCase() === name.toLowerCase());
      if (c) return sqlTypeForColumn(c);
    }
    return 'TEXT';
  };

  const colDefs = columns.map((c) => `  ${quoteIdent(c)} ${sqlTypeForName(c)}`).join(',\n');

  const steps: IMigrationStep[] = [
    {
      title: 'Create shared table',
      description: `New table ${sharedName} defining the recurring columns once.`,
      sql: `CREATE TABLE ${qs} (\n  "id" INTEGER PRIMARY KEY AUTOINCREMENT,\n${colDefs}\n);`,
      reversible: true,
    },
    ...sourceTables.map((t) => ({
      title: `Add reference on ${t}`,
      description: `Add ${fkCol} on ${t} referencing ${sharedName}(id).`,
      sql: `ALTER TABLE ${quoteIdent(t)}\nADD COLUMN ${quoteIdent(fkCol)} INTEGER REFERENCES ${qs}("id");`,
      reversible: true,
    })),
    {
      title: 'Backfill then drop moved columns',
      description:
        'Populate the shared rows and foreign keys per table, then drop the redundant columns after application code reads the shared table.',
      sql:
        `-- Per source table: insert shared rows, set ${fkCol}, then drop each moved column:\n` +
        columns.map((c) => `-- ALTER TABLE <table> DROP COLUMN ${quoteIdent(c)};`).join('\n'),
      reversible: true,
      destructive: true,
    },
  ];

  const className = pascalCaseFromSqlTable(sharedName);
  const mixinBody = columns.map((c) => driftColumnGetter(c, sqlTypeForName(c))).join('\n');

  return {
    steps,
    dartCode: generateDartMigration(steps),
    driftTableClass: `mixin ${className}Columns on Table {\n${mixinBody}\n}`,
    preflightWarnings: [
      'For per-row metadata (e.g. timestamps), a Drift mixin (shown) is usually better than a shared table — reuse the definitions instead of normalizing.',
      'For shared entities (e.g. addresses), use the shared-table + foreign-key template; de-duplicate and backfill before dropping source columns.',
      'SQLite 3.35.0+ is required for ALTER TABLE ... DROP COLUMN; older targets need a table rebuild migration.',
    ],
  };
}
