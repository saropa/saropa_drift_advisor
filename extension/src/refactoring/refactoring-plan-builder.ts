/**
 * Builds multi-step migration plans (SQL + Dart snippets) for refactoring
 * suggestions. Output is advisory: callers must review before applying.
 */

import type { ColumnMetadata, TableMetadata } from '../api-types';
import type { IRefactoringSuggestion, IMigrationPlan, IMigrationStep } from './refactoring-types';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Builds a Dart class name from a SQL table name. */
export function pascalCaseFromSqlTable(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'Lookup';
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function lookupTableName(table: string, column: string): string {
  const raw = `${table}_${column}_lookup`.replace(/[^a-zA-Z0-9_]/g, '_');
  return raw.length > 60 ? raw.slice(0, 60) : raw;
}

function sqlTypeForColumn(col: ColumnMetadata): string {
  const u = col.type.toUpperCase();
  if (u.includes('INT')) return 'INTEGER';
  if (u.includes('REAL') || u.includes('FLOA') || u.includes('DOUB')) return 'REAL';
  if (u.includes('BLOB')) return 'BLOB';
  return 'TEXT';
}

function findTable(meta: TableMetadata[], name: string): TableMetadata | undefined {
  return meta.find((t) => t.name === name);
}

function findSinglePkColumn(table: TableMetadata): ColumnMetadata | undefined {
  const pks = table.columns.filter((c) => c.pk);
  if (pks.length !== 1) return undefined;
  return pks[0];
}

function suggestedMergeFkColumn(referencedTable: string, pkColumn: string): string {
  const base = `fk_${referencedTable}_${pkColumn}`.replace(/[^a-zA-Z0-9_]/g, '_');
  return base.length > 48 ? base.slice(0, 48) : base;
}

/**
 * Generates [IMigrationPlan] payloads for a suggestion using live schema metadata.
 */
export class MigrationPlanBuilder {
  /**
   * Dispatches on [IRefactoringSuggestion.type] and returns an empty advisory plan
   * when metadata is insufficient (e.g. composite primary keys for split templates).
   */
  buildFor(suggestion: IRefactoringSuggestion, tablesMeta: TableMetadata[]): IMigrationPlan {
    switch (suggestion.type) {
      case 'normalize':
        if (suggestion.tables[0] && suggestion.columns[0]) {
          return this.buildNormalizationPlan(suggestion.tables[0], suggestion.columns[0]);
        }
        break;
      case 'split':
        if (suggestion.tables[0]) {
          return this.buildSplitPlan(suggestion.tables[0], tablesMeta);
        }
        break;
      case 'merge':
        if (suggestion.tables[0] && suggestion.tables[1] && suggestion.columns[0]) {
          return this.buildMergePlan(
            suggestion.tables[0],
            suggestion.tables[1],
            suggestion.columns[0],
            tablesMeta,
          );
        }
        break;
      default:
        break;
    }
    return {
      steps: [],
      dartCode: '',
      driftTableClass: '',
      preflightWarnings: ['Unable to build a migration plan for this suggestion (missing metadata).'],
    };
  }

  /**
   * Normalization: new lookup table + FK column + backfill + optional drop of text column.
   */
  buildNormalizationPlan(table: string, column: string): IMigrationPlan {
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
    const dartCode = this._generateDartMigration(steps);
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
  buildSplitPlan(tableName: string, tablesMeta: TableMetadata[]): IMigrationPlan {
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

    const dartCode = this._generateDartMigration(steps);
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

  /**
   * Merge: template for introducing a foreign key using the overlapping column as join key.
   */
  buildMergePlan(fromTable: string, toTable: string, column: string, tablesMeta: TableMetadata[]): IMigrationPlan {
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
      dartCode: this._generateDartMigration(steps),
      driftTableClass: `// Add an IntColumn ${fkCol} to the ${pascalCaseFromSqlTable(fromTable)} table class after editing schema.dart.`,
      preflightWarnings: [
        `Confirm ${toTable}.${column} is effectively unique (or choose a different referenced column) before relying on this UPDATE.`,
        'Overlapping values can be coincidental; validate semantics before dropping legacy columns.',
      ],
    };
  }

  private _generateDartMigration(steps: IMigrationStep[]): string {
    const blocks = steps.map((s) => {
      const safe = s.sql.replace(/'''/g, "\\'\\'\\'");
      return `    // ${s.title}\n    await customStatement(r'''${safe}''');`;
    });
    return `onUpgrade: (m, from, to) async {\n${blocks.join('\n\n')}\n}`;
  }
}
