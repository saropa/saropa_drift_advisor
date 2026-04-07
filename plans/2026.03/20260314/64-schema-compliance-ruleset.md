# Feature 64: Schema Compliance Ruleset

## What It Does

Define team-wide schema conventions in a `.drift-rules.json` config file and validate the live database schema against them. Rules cover naming conventions, required columns, FK naming patterns, type restrictions, and structural constraints. Results surface as VS Code diagnostics (squiggles) on Drift table classes and can be checked in CI via a pre-launch task.

## User Experience

1. Create a `.drift-rules.json` in the project root
2. Extension validates the live schema against rules on every generation change
3. Violations appear as diagnostics on Dart table class files
4. Pre-launch task can block debug session if violations exist

```
╔══════════════════════════════════════════════════════════════╗
║  .drift-rules.json                                           ║
╠══════════════════════════════════════════════════════════════╣
║  {                                                           ║
║    "naming": {                                               ║
║      "tables": "snake_case",                                 ║
║      "columns": "snake_case",                                ║
║      "fkColumns": "{table}_id"                               ║
║    },                                                        ║
║    "requiredColumns": [                                      ║
║      { "name": "created_at", "type": "INTEGER" },            ║
║      { "name": "updated_at", "type": "INTEGER" }             ║
║    ],                                                        ║
║    "rules": [                                                ║
║      { "rule": "no-text-primary-key" },                      ║
║      { "rule": "max-columns", "max": 20 },                   ║
║      { "rule": "require-pk" },                               ║
║      { "rule": "no-nullable-fk" }                            ║
║    ]                                                         ║
║  }                                                           ║
╚══════════════════════════════════════════════════════════════╝
```

Diagnostics appear on Dart files:

```
users.dart:
  ⚠ Line 5: Table "users" missing required column "updated_at" (INTEGER)
  ⚠ Line 12: FK column "categoryId" should be "category_id" (snake_case pattern: {table}_id)

orders.dart:
  ⚠ Line 8: Column "OrderDate" violates snake_case naming convention
  ❌ Line 3: Table "Orders" violates snake_case naming convention
```

## Available Metadata

Rules must be derived from data the extension already has. Here is what each source provides:

### From `schemaMetadata()` → `TableMetadata[]`

| Field | Type | Available |
|-------|------|-----------|
| `table.name` | `string` | ✓ |
| `table.columns[].name` | `string` | ✓ |
| `table.columns[].type` | `string` | ✓ (INTEGER, TEXT, REAL, BLOB) |
| `table.columns[].pk` | `boolean` | ✓ |
| `table.rowCount` | `number` | ✓ |

### From `schemaDiagram()` → `IDiagramData`

| Field | Type | Available |
|-------|------|-----------|
| `foreignKeys[].fromTable` | `string` | ✓ |
| `foreignKeys[].fromColumn` | `string` | ✓ |
| `foreignKeys[].toTable` | `string` | ✓ |
| `foreignKeys[].toColumn` | `string` | ✓ |

Better than per-table `tableFkMeta()` — gives all FKs in one call.

### From Dart source parsing → `IDartTable[]` / `IDartColumn[]`

| Field | Type | Available |
|-------|------|-----------|
| `column.nullable` | `boolean` | ✓ (from `.nullable()` in builder chain) |
| `column.autoIncrement` | `boolean` | ✓ |
| `table.fileUri` | `string` | ✓ |
| `table.line` | `number` | ✓ (0-based) |
| `column.line` | `number` | ✓ (0-based) |

### From `sizeAnalytics()` → `ISizeAnalytics`

| Field | Type | Available |
|-------|------|-----------|
| `table.indexCount` | `number` | ✓ |
| `table.indexes` | `string[]` | ✓ (names only — no column mapping) |

### NOT available

| Field | Reason |
|-------|--------|
| Column nullability from DB | Would need `PRAGMA table_info()` — not exposed |
| Index → column mapping | `indexes` is names only, no column info |

## Rule Derivation

Each rule maps to available metadata:

| Rule | Data Source | Fields Used |
|------|------------|-------------|
| `naming.tables` | `TableMetadata.name` | name |
| `naming.columns` | `ColumnMetadata.name` | name |
| `naming.fkColumns` | `IDiagramForeignKey` | fromColumn, toTable |
| `requiredColumns` | `TableMetadata.columns` | name, type |
| `no-text-primary-key` | `ColumnMetadata` | type, pk |
| `require-pk` | `ColumnMetadata` | pk |
| `max-columns` | `TableMetadata.columns` | length |
| `no-nullable-fk` | `IDartColumn` + `IDiagramForeignKey` | nullable, fromColumn |

## New Files

```
extension/src/compliance/
  compliance-checker.ts       # Rule evaluation engine
  compliance-rules.ts         # Built-in rule definitions
  compliance-config.ts        # Config file parser + file watcher
  compliance-types.ts         # IComplianceConfig, IComplianceViolation, IComplianceRule
extension/schemas/
  drift-rules.schema.json     # JSON Schema for .drift-rules.json (autocomplete + validation)
extension/src/test/
  compliance-checker.test.ts
```

## Modified Files

```
extension/src/linter/schema-diagnostics.ts  # Add compliance violations to existing refresh cycle
extension/src/linter/issue-mapper.ts        # Add 'compliance' to ServerIssue source union
extension/src/extension.ts                  # Register config watcher, wire up checker
extension/package.json                      # Configuration, command, jsonValidation
```

## Dependencies

- `api-client.ts` — `schemaMetadata()`, `schemaDiagram()` (all FKs in one call)
- `schema-diff/dart-schema.ts` — `IDartTable`, `IDartColumn` (for nullable detection)
- `linter/issue-mapper.ts` — `ServerIssue`, `mapIssuesToDiagnostics()` (reuse existing source mapping)
- `linter/schema-diagnostics.ts` — `SchemaDiagnostics` (integrate into existing diagnostic refresh)
- `GenerationWatcher` — trigger re-check on schema change
- `vscode.workspace.fs` — read `.drift-rules.json`

Source location mapping is already solved by `findTableLine()` and `findColumnLine()` in `issue-mapper.ts`. Compliance violations produce `ServerIssue[]` and feed into the existing pipeline — no separate diagnostic infrastructure needed.

## Architecture

### Config Schema

```typescript
type Severity = 'error' | 'warning' | 'info';

interface IComplianceConfig {
  naming?: {
    tables?: NamingConvention;
    columns?: NamingConvention;
    fkColumns?: string;        // Pattern like "{table}_id"
    severity?: Severity;       // Default: 'warning'
  };
  requiredColumns?: Array<{
    name: string;
    type?: string;
    excludeTables?: string[];  // Tables exempt from this requirement
    severity?: Severity;       // Default: 'warning'
  }>;
  rules?: Array<{
    rule: string;
    severity?: Severity;       // Default: 'warning'
    [key: string]: unknown;    // Rule-specific config
  }>;
  exclude?: string[];          // Tables to skip entirely
}

type NamingConvention = 'snake_case' | 'camelCase' | 'PascalCase' | 'UPPER_SNAKE';
```

### Config Loading

```typescript
const CONFIG_FILENAME = '.drift-rules.json';

async function loadConfig(workspaceRoot: vscode.Uri): Promise<IComplianceConfig | null> {
  const configUri = vscode.Uri.joinPath(workspaceRoot, CONFIG_FILENAME);
  try {
    const content = await vscode.workspace.fs.readFile(configUri);
    return JSON.parse(Buffer.from(content).toString('utf-8'));
  } catch {
    return null;  // No config file — compliance checking disabled
  }
}
```

### Compliance Checker

```typescript
interface IComplianceViolation {
  rule: string;
  severity: Severity;
  table: string;
  column?: string;
  message: string;
}

class ComplianceChecker {
  private readonly _rules = new Map<string, IComplianceRule>();

  constructor() {
    this._registerBuiltinRules();
  }

  check(
    config: IComplianceConfig,
    meta: TableMetadata[],
    fks: IDiagramForeignKey[],
    dartTables?: IDartTable[],
  ): IComplianceViolation[] {
    const violations: IComplianceViolation[] = [];
    const tables = meta.filter(t =>
      !t.name.startsWith('sqlite_') &&
      !(config.exclude ?? []).includes(t.name)
    );

    // Build FK lookup: tableName → ForeignKey[]
    const fkMap = new Map<string, IDiagramForeignKey[]>();
    for (const fk of fks) {
      const list = fkMap.get(fk.fromTable) ?? [];
      list.push(fk);
      fkMap.set(fk.fromTable, list);
    }

    // Naming checks
    if (config.naming) {
      violations.push(...this._checkNaming(config.naming, tables, fkMap));
    }

    // Required columns
    if (config.requiredColumns) {
      violations.push(...this._checkRequired(config.requiredColumns, tables));
    }

    // Built-in rules
    for (const ruleConfig of config.rules ?? []) {
      const rule = this._rules.get(ruleConfig.rule);
      if (rule) {
        violations.push(...rule.check(tables, fkMap, dartTables, ruleConfig));
      }
    }

    return violations;
  }
}
```

### Integration with Existing Diagnostics

Compliance violations convert to `ServerIssue[]` and merge into the existing `SchemaDiagnostics.refresh()` pipeline:

```typescript
// In compliance-checker.ts
function toServerIssues(violations: IComplianceViolation[]): ServerIssue[] {
  return violations.map(v => ({
    source: 'compliance' as const,
    severity: v.severity,
    table: v.table,
    column: v.column,
    message: v.message,
  }));
}
```

```typescript
// In issue-mapper.ts — extend the source union
export interface ServerIssue {
  source: 'index-suggestion' | 'anomaly' | 'compliance';
  // ... rest unchanged
}
```

```typescript
// In schema-diagnostics.ts — add to refresh()
const [suggestions, anomalies, complianceViolations] = await Promise.all([
  this._client.indexSuggestions(),
  this._client.anomalies(),
  this._complianceChecker.run(),  // returns ServerIssue[]
]);

const issues = [
  ...mergeServerIssues(suggestions, anomalies),
  ...complianceViolations,
];
```

### Naming Convention Matcher

```typescript
function matchesConvention(name: string, convention: NamingConvention): boolean {
  switch (convention) {
    case 'snake_case':
      return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
    case 'camelCase':
      return /^[a-z][a-zA-Z0-9]*$/.test(name);
    case 'PascalCase':
      return /^[A-Z][a-zA-Z0-9]*$/.test(name);
    case 'UPPER_SNAKE':
      return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
  }
}
```

### Built-in Rule Interface

```typescript
interface IComplianceRule {
  check(
    tables: TableMetadata[],
    fkMap: Map<string, IDiagramForeignKey[]>,
    dartTables: IDartTable[] | undefined,
    config: Record<string, unknown>,
  ): IComplianceViolation[];
}
```

### Built-in Rules

**`no-text-primary-key`** — flags any column where `pk === true && type === 'TEXT'`
- Data: `ColumnMetadata.pk`, `ColumnMetadata.type`

**`require-pk`** — flags tables with no column where `pk === true`
- Data: `ColumnMetadata.pk`

**`max-columns`** — flags tables where `columns.length > config.max` (default 20)
- Data: `TableMetadata.columns.length`

**`no-nullable-fk`** — flags FK columns declared as `.nullable()` in Dart source
- Data: `IDiagramForeignKey.fromColumn` cross-referenced with `IDartColumn.nullable`
- Requires `dartTables` parameter; silently skips if Dart parsing unavailable

```typescript
class NoNullableFkRule implements IComplianceRule {
  check(
    _tables: TableMetadata[],
    fkMap: Map<string, IDiagramForeignKey[]>,
    dartTables: IDartTable[] | undefined,
    config: Record<string, unknown>,
  ): IComplianceViolation[] {
    if (!dartTables) return [];
    const severity = (config.severity as Severity) ?? 'warning';
    const violations: IComplianceViolation[] = [];

    // Build lookup: sqlTableName → IDartColumn[]
    const dartLookup = new Map<string, IDartColumn[]>();
    for (const dt of dartTables) {
      dartLookup.set(dt.sqlTableName, dt.columns);
    }

    for (const [tableName, fks] of fkMap) {
      const dartCols = dartLookup.get(tableName);
      if (!dartCols) continue;

      for (const fk of fks) {
        const dartCol = dartCols.find(c => c.sqlName === fk.fromColumn);
        if (dartCol?.nullable) {
          violations.push({
            rule: 'no-nullable-fk',
            severity,
            table: tableName,
            column: fk.fromColumn,
            message: `FK column "${fk.fromColumn}" is nullable — consider making it required.`,
          });
        }
      }
    }

    return violations;
  }
}
```

## Server-Side Changes

None. Uses existing schema metadata, diagram, and Dart source parsing.

## package.json Contributions

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "driftViewer.runCompliance",
        "title": "Saropa Drift Advisor: Check Schema Compliance"
      }
    ],
    "configuration": {
      "properties": {
        "driftViewer.compliance.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Validate schema against .drift-rules.json on every generation change."
        }
      }
    },
    "jsonValidation": [{
      "fileMatch": ".drift-rules.json",
      "url": "./schemas/drift-rules.schema.json"
    }]
  }
}
```

## Testing

- `compliance-checker.test.ts`:
  - snake_case: "user_name" passes, "userName" fails
  - camelCase: "userName" passes, "user_name" fails
  - PascalCase: "UserName" passes, "user_name" fails
  - UPPER_SNAKE: "USER_NAME" passes, "userName" fails
  - Required column present → no violation
  - Required column missing → violation with table name
  - Required column wrong type → violation
  - Required column with excludeTables → excluded table skipped
  - Required column with severity override → uses specified severity
  - FK column pattern: "{table}_id" matches "user_id" for FK to "user"
  - FK column pattern with multi-word table: "user_accounts" → expects "user_accounts_id"
  - No config file → no violations (feature disabled)
  - Empty rules array → naming and required still checked
  - `no-text-primary-key`: TEXT PK → violation, INTEGER PK → no violation
  - `require-pk`: table with no pk column → violation
  - `max-columns`: 21 columns with max=20 → violation, 20 → no violation
  - `no-nullable-fk`: nullable FK column → violation, non-nullable → no violation
  - `no-nullable-fk`: skipped when dartTables unavailable
  - Excluded tables skipped for all checks
  - Multiple violations per table reported individually
  - `sqlite_` internal tables always excluded
  - Naming severity override applies to table, column, and FK violations
  - Violations convert to `ServerIssue[]` with source `'compliance'`

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| SchemaIntelligence | Cached schema metadata for rule evaluation |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Schema Intelligence Cache (1.2) | Table/column metadata |
| Schema Linter (7) | Shares diagnostic infrastructure |
| Generation Watcher | Triggers re-evaluation |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| Health Score (30) | "Schema Compliance" metric |
| Pre-Launch Tasks (13) | Block launch on compliance errors |
| Schema Linter (7) | Additional compliance-based diagnostics |
| Migration Generator (24) | "Fix Violation" generates migration |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| Compliance Violation | "Generate Fix Migration" | Migration Generator |
| Compliance Violation | "View Table" | Table definition in editor |
| Health Score | "View Compliance" | Compliance panel |
| Pre-Launch Tasks | "Show Compliance Issues" | Compliance panel |
| Schema Linter | "Check Compliance" | Run compliance rules |

### Health Score Contribution

| Metric | Contribution |
|--------|--------------|
| Schema Quality | Compliance pass/fail ratio |
| Action | "View Compliance Violations" → Compliance panel |
| Quick Fix | "Generate All Fix Migrations" → batch migration |

### Integration with Schema Linter

Compliance violations merge into the existing diagnostic system:

```typescript
// compliance-checker.ts
function toServerIssues(violations: IComplianceViolation[]): ServerIssue[] {
  return violations.map(v => ({
    source: 'compliance' as const,  // New source type
    severity: v.severity,
    table: v.table,
    column: v.column,
    message: v.message,
    rule: v.rule,  // Rule ID for filtering
  }));
}

// schema-diagnostics.ts — merged into existing refresh
const [suggestions, anomalies, compliance] = await Promise.all([
  this._client.indexSuggestions(),
  this._client.anomalies(),
  this._complianceChecker.run(),
]);

const issues = [...suggestions, ...anomalies, ...compliance];
this._refreshDiagnostics(issues);
```

### Pre-Launch Task Integration

```typescript
// Pre-launch task checks compliance
tasks.registerTask('drift.compliance', async () => {
  const violations = await complianceChecker.check(config, schema);
  const errors = violations.filter(v => v.severity === 'error');
  
  if (errors.length > 0) {
    return {
      success: false,
      message: `${errors.length} compliance errors block launch`,
      action: 'driftViewer.showCompliance',
    };
  }
  
  return { success: true };
});
```

### Batch Migration Generation

"Fix All Violations" generates migrations for all fixable violations:

```typescript
commands.registerCommand('driftViewer.fixAllCompliance', async () => {
  const violations = complianceChecker.getViolations();
  const fixable = violations.filter(v => v.suggestedFix);
  
  const migrations = fixable.map(v => v.suggestedFix);
  const combined = MigrationGenerator.combine(migrations);
  
  // Open as SQL document
  const doc = await vscode.workspace.openTextDocument({
    content: combined,
    language: 'sql'
  });
  await vscode.window.showTextDocument(doc);
});
```

---

## Known Limitations

- FK column pattern only supports `{table}` placeholder with literal table name — multi-word tables like `user_accounts` produce `user_accounts_id`. No singularization or custom transforms.
- No auto-fix — violations are diagnostic-only
- Config file must be in workspace root — no support for monorepo with multiple config files
- Custom rule plugins are not supported — only built-in rules
- `no-nullable-fk` depends on Dart source parsing — won't fire if table files can't be parsed

## Future Rules (blocked on metadata)

- `require-fk-index` — `ITableSizeInfo.indexes` has index names but not which columns they cover. Needs column-level index mapping.
