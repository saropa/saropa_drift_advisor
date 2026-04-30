<!--
  Archived 2026-04-30: Phases 1–3 closed. Stub: ../../../../66-drift-refactoring-engine.md
-->

# Feature 66: Drift Refactoring Engine

> **Plan status: CLOSED** (2026-04-30) — Phases **1–3** are delivered in the VS Code extension under `extension/src/refactoring/` plus health integration (`health-refactoring-merge.ts`, `health-scorer.ts`, `health-html.ts`). No open delivery items remain in this document. Optional future work is **only** in [Follow-on plans](#follow-on-plans).

**Shipped capabilities (maintainer reference):** Commands `driftViewer.suggestSchemaRefactorings` and `driftViewer.refactoringOpenWithHint`; webview toolbar (**Generate migration**, **Schema diff**, migration preview, ER diagram) and per-suggestion actions (plan, migration preview + advisory SQL append, ER `focusTable`, NL-SQL `initialQuestion` prefill, dismiss); analyzer **normalize / split / merge** (not `extract` — see [69](../../../../69-refactoring-extract-common-column-groups.md)); plan builder + copy SQL/Dart/Drift; workspace session summary; health advisor block and **Schema Quality** `details` lines from `HealthScorer.compute(client, workspaceState)`.

**User-facing notes** for this feature shipped in [CHANGELOG.md](../../../../../CHANGELOG.md) under `## [3.5.0]`.

## What It Does

Analyze the live database schema and suggest concrete refactorings: normalize repeated data into lookup tables, split wide tables, merge redundant columns, extract common column groups into shared tables. Each suggestion includes a multi-step migration plan with generated Dart code, data migration SQL, and a before/after schema comparison.

## Review Outcomes

- Keep: strong end-user flow, practical migration examples, and clear feature integrations.
- Update: add explicit scope boundaries, rollout phases, and quality gates before implementation.
- Tighten: enforce "advisory only" behavior (never auto-apply schema changes) plus migration safety checks.

## Goals

- Produce high-confidence, explainable refactoring suggestions from real schema + data signals.
- Generate migration artifacts developers can review and adapt (`SQL`, `Drift` table changes, Dart migration snippets).
- Prioritize suggestions by expected schema-quality impact and execution risk.

## Non-Goals (v1)

- Automatic migration execution against user databases.
- Full semantic workload analysis from production traces.
- Refactorings that require multi-db support beyond SQLite/Drift constraints.
- Composite-key rewrite automation across deeply coupled schemas.

## User Experience

1. Command palette → "Saropa Drift Advisor: Suggest Schema Refactorings"
2. Extension analyzes schema structure, data patterns, and FK relationships
3. Results displayed in a webview with actionable suggestions

```
╔══════════════════════════════════════════════════════════════╗
║  SCHEMA REFACTORING SUGGESTIONS                             ║
║  Analyzed 12 tables, 67 columns                             ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  1. NORMALIZE: orders.status → new status_types table        ║
║     ┌──────────────────────────────────────────────────┐    ║
║     │ orders.status has 4 distinct values across 5,891  │    ║
║     │ rows: "pending", "shipped", "delivered", "failed" │    ║
║     │                                                    │    ║
║     │ Before:                                            │    ║
║     │   orders: id, user_id, total, status (TEXT)        │    ║
║     │                                                    │    ║
║     │ After:                                             │    ║
║     │   order_statuses: id (PK), name (UNIQUE)           │    ║
║     │   orders: id, user_id, total, status_id (FK)       │    ║
║     │                                                    │    ║
║     │ Impact: Saves ~35KB, adds referential integrity    │    ║
║     └──────────────────────────────────────────────────┘    ║
║     [View Migration Plan] [Copy All Code] [Dismiss]          ║
║                                                              ║
║  2. SPLIT: users table has 18 columns                        ║
║     ┌──────────────────────────────────────────────────┐    ║
║     │ Suggest splitting into:                            │    ║
║     │   users: id, email, name, active (core identity)   │    ║
║     │   user_profiles: user_id (FK), bio, avatar_url,    │    ║
║     │                  website, phone, ... (8 columns)   │    ║
║     │                                                    │    ║
║     │ Reason: 8 columns are NULL in >60% of rows         │    ║
║     └──────────────────────────────────────────────────┘    ║
║     [View Migration Plan] [Copy All Code] [Dismiss]          ║
║                                                              ║
║  3. MERGE: audit_log.actor_email duplicates users.email      ║
║     ┌──────────────────────────────────────────────────┐    ║
║     │ 98% of audit_log.actor_email values match a        │    ║
║     │ users.email. Replace with user_id FK.              │    ║
║     └──────────────────────────────────────────────────┘    ║
║     [View Migration Plan] [Copy All Code] [Dismiss]          ║
╚══════════════════════════════════════════════════════════════╝
```

### Migration Plan Detail

```
╔══════════════════════════════════════════════════════════════╗
║  MIGRATION PLAN: Normalize orders.status                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Step 1: Create lookup table                                 ║
║  ┌──────────────────────────────────────────────────────┐   ║
║  │ CREATE TABLE "order_statuses" (                       │   ║
║  │   "id" INTEGER PRIMARY KEY AUTOINCREMENT,             │   ║
║  │   "name" TEXT NOT NULL UNIQUE                         │   ║
║  │ );                                                    │   ║
║  └──────────────────────────────────────────────────────┘   ║
║                                                              ║
║  Step 2: Populate lookup table                               ║
║  ┌──────────────────────────────────────────────────────┐   ║
║  │ INSERT INTO "order_statuses" ("name")                 │   ║
║  │ SELECT DISTINCT "status" FROM "orders"                │   ║
║  │ WHERE "status" IS NOT NULL;                           │   ║
║  └──────────────────────────────────────────────────────┘   ║
║                                                              ║
║  Step 3: Add FK column                                       ║
║  ┌──────────────────────────────────────────────────────┐   ║
║  │ ALTER TABLE "orders"                                  │   ║
║  │ ADD COLUMN "status_id" INTEGER                        │   ║
║  │ REFERENCES "order_statuses"("id");                    │   ║
║  └──────────────────────────────────────────────────────┘   ║
║                                                              ║
║  Step 4: Migrate data                                        ║
║  ┌──────────────────────────────────────────────────────┐   ║
║  │ UPDATE "orders" SET "status_id" = (                   │   ║
║  │   SELECT "id" FROM "order_statuses"                   │   ║
║  │   WHERE "name" = "orders"."status"                    │   ║
║  │ );                                                    │   ║
║  └──────────────────────────────────────────────────────┘   ║
║                                                              ║
║  Step 5: Drop old column                                     ║
║  ┌──────────────────────────────────────────────────────┐   ║
║  │ ALTER TABLE "orders" DROP COLUMN "status";            │   ║
║  └──────────────────────────────────────────────────────┘   ║
║                                                              ║
║  [Copy SQL] [Copy Dart Migration] [Copy Drift Table Class]   ║
╚══════════════════════════════════════════════════════════════╝
```

## New Files (as shipped)

```
extension/src/refactoring/
  refactoring-analyzer.ts
  refactoring-plan-builder.ts
  refactoring-panel.ts
  refactoring-html.ts
  refactoring-types.ts
  refactoring-commands.ts
  refactoring-advisor-state.ts
  refactoring-nl-bridge.ts
extension/src/health/
  health-refactoring-merge.ts
extension/src/test/
  refactoring-analyzer.test.ts
  refactoring-plan-builder.test.ts
```

## Modified Files (representative)

```
extension/src/extension-commands.ts   # registerRefactoringCommands
extension/package.json                 # commands, view contributions
extension/src/export/export-commands.ts
extension/src/er-diagram/*
extension/src/nl-sql/nl-sql-commands.ts
extension/src/health/health-scorer.ts, health-commands.ts, health-panel.ts, health-html.ts
```

## Dependencies

- `api-client.ts` — `schemaMetadata()`, `tableFkMeta()`, `sql()`, `schemaDump()`.
- Column profiler data (Feature 29) — null percentages, distinct value counts.
- Query intelligence cache (when available) to rank suggestions by practical impact.
- Migration Generator contracts (Feature 24) for interoperable output payloads.

## Delivery Plan

### Phase 1 - Analyzer + Ranking (MVP) — **shipped**

- Normalization and wide-table split detection; merge hints; confidence + risk scoring.
- Webview list shipped; scope grew in Phases 2–3 (plan builder and integrations).

### Phase 2 - Plan Builder + Copy Workflows — **shipped**

- Per-suggestion migration plan (`SQL`, Dart migration, Drift table class), preflight warnings, copy actions, dismiss + session persistence.

### Phase 3 - Cross-Feature Integrations — **shipped**

- Deep-link actions: toolbar **Generate migration (Dart)** / **Schema diff** / migration preview / ER; per-card migration preview + plan, ER focus, NL-SQL prefill, dismiss.
- External / AI-style bridge: `driftViewer.refactoringOpenWithHint` opens the panel with a **hint banner**; NL-SQL prefill remains a natural-language path; full LLM reviewer UI is [Feature 59](../../../../59-ai-schema-reviewer.md).
- Health: persisted advisor session is merged into **Schema Quality** `details` and a **Refactoring suggestions** action; health HTML shows the advisor block when session data exists.

## Follow-on plans

| Topic | Plan |
|--------|------|
| AI Schema Reviewer UI, LLM review panel, and structured handoff into refactoring | [59-ai-schema-reviewer.md](../../../../59-ai-schema-reviewer.md) |
| `extract` / common column-group detection in the deterministic analyzer | [69-refactoring-extract-common-column-groups.md](../../../../69-refactoring-extract-common-column-groups.md) |
| Numeric health-score adjustments from advisor session (beyond narrative `details`) | [70-health-score-refactoring-session-scoring.md](../../../../70-health-score-refactoring-session-scoring.md) |

## Architecture

### Refactoring Analyzer

Detects refactoring opportunities from schema and data analysis:

```typescript
interface IRefactoringSuggestion {
  id: string;
  type: 'normalize' | 'split' | 'merge' | 'extract';
  title: string;
  description: string;
  tables: string[];
  columns: string[];
  evidence: string[];
  topValues?: Array<{ value: string; count: number }>;
  severity: 'low' | 'medium' | 'high';
  impact: {
    spaceSaved?: number;
    integrityImproved: boolean;
    queryComplexity: 'simpler' | 'same' | 'more-complex';
  };
  estimatedMigrationRisk: 'low' | 'medium' | 'high';
  confidence: number;  // 0-1, how confident the suggestion is
}

class RefactoringAnalyzer {
  constructor(private readonly _client: DriftApiClient) {}

  async analyze(): Promise<IRefactoringSuggestion[]> {
    const suggestions: IRefactoringSuggestion[] = [];
    const meta = await this._client.schemaMetadata();
    const tables = meta.filter(t => !t.name.startsWith('sqlite_'));

    suggestions.push(...await this._detectNormalization(tables));
    suggestions.push(...this._detectWideTables(tables));
    suggestions.push(...await this._detectDuplicateColumns(tables));
    // v1 excludes common-column-group extraction to keep initial rollout focused.
    // This detector ships in a follow-up once split/normalize quality is stable.

    return suggestions.filter(s => s.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence);
  }

  private async _detectNormalization(tables: TableMetadata[]): Promise<IRefactoringSuggestion[]> {
    const suggestions: IRefactoringSuggestion[] = [];

    for (const table of tables) {
      const textCols = table.columns.filter(c =>
        c.type.toUpperCase().includes('TEXT') && !c.pk
      );

      for (const col of textCols) {
        // Check distinct value count vs row count
        const result = await this._client.sql(
          `SELECT COUNT(DISTINCT "${col.name}") as distinct_count, COUNT(*) as total FROM "${table.name}" WHERE "${col.name}" IS NOT NULL`
        );
        const row = result.rows[0] as Record<string, number>;
        const ratio = row.distinct_count / Math.max(row.total, 1);

        // Low cardinality TEXT column → normalization candidate
        if (row.distinct_count <= 20 && row.total > 50 && ratio < 0.1) {
          suggestions.push({
            type: 'normalize',
            title: `Normalize ${table.name}.${col.name}`,
            description: `${col.name} has ${row.distinct_count} distinct values across ${row.total} rows. Extract to a lookup table with FK.`,
            tables: [table.name],
            columns: [col.name],
            evidence: [
              `${row.distinct_count} distinct values`,
              `${row.total} populated rows`,
              `distinct/total ratio=${ratio.toFixed(4)}`,
            ],
            severity: ratio < 0.02 ? 'high' : 'medium',
            impact: {
              integrityImproved: true,
              queryComplexity: 'more-complex',
            },
            estimatedMigrationRisk: row.total > 100000 ? 'high' : 'medium',
            confidence: ratio < 0.01 ? 0.9 : 0.7,
          });
        }
      }
    }

    return suggestions;
  }

  private _detectWideTables(tables: TableMetadata[]): IRefactoringSuggestion[] {
    return tables
      .filter(t => t.columns.length > 12)
      .map(table => {
        // Group columns: PK + FK columns stay, others are candidates for split
        const core = table.columns.filter(c => c.pk);
        const optional = table.columns.filter(c => !c.pk);

        return {
          type: 'split' as const,
          title: `Split ${table.name} (${table.columns.length} columns)`,
          description: `Table has ${table.columns.length} columns. Consider splitting into a core table and a profile/details table.`,
          tables: [table.name],
          columns: optional.map(c => c.name),
          evidence: [
            `${table.columns.length} total columns`,
            `${optional.length} non-key candidate columns`,
          ],
          severity: table.columns.length > 24 ? 'high' : 'medium',
          impact: {
            integrityImproved: false,
            queryComplexity: 'more-complex',
          },
          estimatedMigrationRisk: table.columns.length > 24 ? 'high' : 'medium',
          confidence: table.columns.length > 20 ? 0.8 : 0.6,
        };
      });
  }

  private async _detectDuplicateColumns(tables: TableMetadata[]): Promise<IRefactoringSuggestion[]> {
    const suggestions: IRefactoringSuggestion[] = [];

    // Find columns with same name across tables that aren't FK-linked
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const fksI = await this._client.tableFkMeta(tables[i].name);
        const fksJ = await this._client.tableFkMeta(tables[j].name);

        for (const colI of tables[i].columns) {
          const colJ = tables[j].columns.find(c => c.name === colI.name && !c.pk);
          if (!colJ || colI.pk) continue;

          // Check if already FK-linked
          const linked = fksI.some(fk => fk.fromColumn === colI.name && fk.toTable === tables[j].name) ||
                         fksJ.some(fk => fk.fromColumn === colJ.name && fk.toTable === tables[i].name);
          if (linked) continue;

          // Check data overlap
          const overlap = await this._client.sql(
            `SELECT COUNT(*) as cnt FROM "${tables[i].name}" a INNER JOIN "${tables[j].name}" b ON a."${colI.name}" = b."${colJ.name}"`
          );
          const count = (overlap.rows[0] as Record<string, number>).cnt;
          if (count > 0) {
            suggestions.push({
              type: 'merge',
              title: `Merge: ${tables[i].name}.${colI.name} ↔ ${tables[j].name}.${colJ.name}`,
              description: `${count} rows have matching values. Consider replacing with an FK relationship.`,
              tables: [tables[i].name, tables[j].name],
              columns: [colI.name],
              evidence: [`${count} overlapping joined rows`],
              severity: 'medium',
              impact: { integrityImproved: true, queryComplexity: 'same' },
              estimatedMigrationRisk: 'medium',
              confidence: 0.6,
            });
          }
        }
      }
    }

    return suggestions;
  }
}
```

### Migration Plan Builder

Generates step-by-step migration code for each suggestion:

```typescript
interface IMigrationPlan {
  steps: IMigrationStep[];
  dartCode: string;
  driftTableClass: string;
}

interface IMigrationStep {
  title: string;
  description: string;
  sql: string;
  reversible: boolean;
}

class MigrationPlanBuilder {
  buildNormalizationPlan(
    table: string,
    column: string,
    newTable: string,
  ): IMigrationPlan {
    const steps: IMigrationStep[] = [
      {
        title: 'Create lookup table',
        description: `New table "${newTable}" for distinct ${column} values`,
        sql: `CREATE TABLE "${newTable}" (\n  "id" INTEGER PRIMARY KEY AUTOINCREMENT,\n  "name" TEXT NOT NULL UNIQUE\n);`,
        reversible: true,
      },
      {
        title: 'Populate lookup table',
        description: `Insert distinct values from ${table}.${column}`,
        sql: `INSERT INTO "${newTable}" ("name")\nSELECT DISTINCT "${column}" FROM "${table}"\nWHERE "${column}" IS NOT NULL;`,
        reversible: true,
      },
      {
        title: 'Add FK column',
        description: `Add ${column}_id referencing ${newTable}`,
        sql: `ALTER TABLE "${table}"\nADD COLUMN "${column}_id" INTEGER\nREFERENCES "${newTable}"("id");`,
        reversible: true,
      },
      {
        title: 'Migrate data',
        description: `Set FK values from existing text values`,
        sql: `UPDATE "${table}" SET "${column}_id" = (\n  SELECT "id" FROM "${newTable}"\n  WHERE "name" = "${table}"."${column}"\n);`,
        reversible: false,
      },
      {
        title: 'Drop old column',
        description: `Remove the denormalized text column`,
        sql: `ALTER TABLE "${table}" DROP COLUMN "${column}";`,
        reversible: false,
      },
    ];

    const dartCode = this._generateDartMigration(steps);
    const driftTableClass = this._generateDriftTable(newTable, [
      { name: 'id', type: 'IntColumn', pk: true },
      { name: 'name', type: 'TextColumn', unique: true },
    ]);

    return { steps, dartCode, driftTableClass };
  }

  private _generateDartMigration(steps: IMigrationStep[]): string {
    const statements = steps.map(s =>
      `    // ${s.title}\n    await customStatement(\n      '${s.sql.replace(/\n/g, "\\n").replace(/'/g, "\\'")}',\n    );`
    ).join('\n\n');

    return `onUpgrade: (m, from, to) async {\n${statements}\n}`;
  }

  private _generateDriftTable(name: string, columns: Array<{ name: string; type: string; pk?: boolean; unique?: boolean }>): string {
    const cols = columns.map(c => {
      let def = `  ${c.type} get ${c.name}`;
      if (c.pk) def += ' => integer().autoIncrement()()';
      else if (c.unique) def += ' => text().unique()()';
      else def += ' => text()()';
      return def + ';';
    }).join('\n');

    return `class ${pascalCase(name)} extends Table {\n${cols}\n}`;
  }
}
```

### Webview Message Protocol

Webview → Extension:
```typescript
{ command: 'analyze' }
{ command: 'viewPlan', suggestionIndex: number }
{ command: 'copySql', suggestionIndex: number }
{ command: 'copyDart', suggestionIndex: number }
{ command: 'copyDriftTable', suggestionIndex: number }
{ command: 'dismiss', suggestionIndex: number }
{ command: 'toggleRiskOnly', enabled: boolean }
```

Extension → Webview:
```typescript
{ command: 'analyzing', tableCount: number }
{ command: 'suggestions', suggestions: IRefactoringSuggestion[] }
{ command: 'plan', plan: IMigrationPlan, suggestion: IRefactoringSuggestion }
{ command: 'error', message: string }
{ command: 'empty', reason: string }
```

## Safety and Guardrails

- This feature is advisory-only; generated SQL is never executed automatically.
- Mark destructive or non-reversible steps clearly (`DROP COLUMN`, lossy transforms).
- Add preflight checks per plan: target tables exist, FK target uniqueness, null-safe migration path.
- Require explicit user confirmation before copying plans containing destructive steps.
- Include SQLite compatibility warnings (`DROP COLUMN` and table-rebuild fallback guidance).
- Log suggestion-generation failures as non-fatal diagnostics so one bad query does not fail the full analysis run.

## Server-Side Changes

None. Uses existing schema, FK, and SQL endpoints.

## package.json Contributions

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "driftViewer.suggestSchemaRefactorings",
        "title": "Saropa Drift Advisor: Suggest Schema Refactorings",
        "icon": "$(wrench)"
      }
    ]
  }
}
```

## Current Codebase Fit

- Follow existing command namespace convention with `driftViewer.*` command IDs.
- Reuse current webview command messaging patterns used by editing and query-builder panels.
- Keep analyzer output serializable over existing extension-webview bridge (plain JSON only).
- Route migration handoff through the established migration-preview/generator pathways instead of new side channels.

## Testing

### Unit

- `refactoring-analyzer.test.ts`:
  - Low-cardinality TEXT column (5 values, 1000 rows) -> normalize suggestion.
  - High-cardinality TEXT column (500 values, 1000 rows) -> no normalize suggestion.
  - Wide table (20 columns) -> split suggestion.
  - Narrow table (5 columns) -> no split suggestion.
  - Duplicate column values across tables without FK -> merge suggestion.
  - Duplicate column with existing FK -> no merge suggestion.
  - `sqlite_` tables excluded.
  - Empty table -> no suggestions.
  - Confidence threshold behavior and descending ranking.
  - Risk/severity/evidence fields always populated.

- `refactoring-plan-builder.test.ts`:
  - Normalization plan: 5 steps in correct order.
  - Step SQL is syntactically valid and safely quoted.
  - Dart migration snippet includes all generated steps.
  - Drift table class output compiles with expected table names.
  - Split and merge plan templates include expected FK/update semantics.
  - Irreversible steps are flagged correctly.

### Integration

- Command registration + webview load path works from command palette.
- Analyzer failure on one table still returns suggestions for other tables.
- Cross-feature handoff payloads match Migration Generator and ER Diagram contracts.

### Performance

- Baseline analyzer runtime captured at 10, 50, and 100-table synthetic schemas.
- Large-table scans capped or chunked to avoid blocking extension UI thread.

## Definition of Done

- Command is discoverable and produces ranked suggestions on representative test fixtures.
- Each suggestion includes evidence, confidence, risk, and migration impact metadata.
- Generated migration plans are copyable and clearly mark reversible vs destructive steps.
- Unit and integration tests added for analyzer, plan builder, and webview message handling.
- Known limitations and compatibility caveats documented in the final user-facing panel copy.

## Implementation Checklist (Execution Tracker)

Use this as the day-to-day build checklist. Keep statuses updated inline as work progresses.

Legend: `[ ]` not started, `[~]` in progress, `[x]` done, `BLOCKED` waiting on dependency.

### Track A - Foundations

- [ ] **A1. Finalize suggestion contracts** (Owner: Extension, Estimate: 0.5 day)
  - Deliverables: `IRefactoringSuggestion`, `IMigrationPlan`, `IMigrationStep` finalized for v1.
  - Includes: IDs, evidence, risk, severity, reversible flags, serialization checks.
  - Exit criteria: type definitions used by analyzer, plan builder, and webview without adapter shims.

- [ ] **A2. Command + entrypoint wiring** (Owner: Extension, Estimate: 0.5 day, Depends: A1)
  - Deliverables: command registration + command handler + panel bootstrap.
  - Exit criteria: command appears in palette and opens panel with loading state.

### Track B - Analyzer MVP

- [ ] **B1. Normalization detector** (Owner: Extension, Estimate: 1.0 day, Depends: A1)
  - Deliverables: low-cardinality text detector with confidence/risk scoring.
  - Guardrails: skip system tables; fail soft on per-table query errors.
  - Exit criteria: expected suggestions on synthetic fixtures; no crash on empty DB.

- [ ] **B2. Wide-table split detector** (Owner: Extension, Estimate: 0.75 day, Depends: A1)
  - Deliverables: split suggestions with evidence and migration-risk estimate.
  - Exit criteria: threshold behavior covered by tests; ordering works with confidence sort.

- [ ] **B3. Merge detector (overlap-based)** (Owner: Extension, Estimate: 1.0 day, Depends: A1)
  - Deliverables: duplicate-column overlap detection excluding already FK-linked pairs.
  - Exit criteria: false-positive guards included; expensive joins bounded.

- [ ] **B4. Ranking + prioritization** (Owner: Extension, Estimate: 0.5 day, Depends: B1,B2,B3)
  - Deliverables: deterministic ranking using confidence + risk + optional query-intelligence weighting.
  - Exit criteria: stable ordering across repeated runs on identical fixtures.

### Track C - Plan Builder

- [ ] **C1. Normalization plan templates** (Owner: Extension, Estimate: 0.75 day, Depends: A1,B1)
  - Deliverables: SQL steps, Dart migration snippet, Drift table class output.
  - Exit criteria: template output passes quoting/escaping tests.

- [ ] **C2. Split and merge plan templates** (Owner: Extension, Estimate: 1.0 day, Depends: A1,B2,B3)
  - Deliverables: v1 plan templates for split/merge paths.
  - Exit criteria: irreversible/destructive steps flagged correctly.

- [ ] **C3. Preflight diagnostics** (Owner: Extension, Estimate: 0.75 day, Depends: C1,C2)
  - Deliverables: checks for table existence, FK uniqueness assumptions, null-safety warnings.
  - Exit criteria: warnings appear in plan payload and panel render.

### Track D - Webview + UX

- [ ] **D1. Suggestion list UI** (Owner: Extension, Estimate: 0.75 day, Depends: A2,B4)
  - Deliverables: ranked cards, evidence display, severity/risk badges, empty state.
  - Exit criteria: UI handles 0, 1, and many suggestions.

- [ ] **D2. Plan detail + copy actions** (Owner: Extension, Estimate: 0.75 day, Depends: C1,C2,D1)
  - Deliverables: per-step migration detail and copy actions for SQL/Dart/Drift.
  - Exit criteria: copy actions produce expected content on clipboard.

- [ ] **D3. Safety UX markers** (Owner: Extension, Estimate: 0.5 day, Depends: C3,D2)
  - Deliverables: destructive-step warnings and confirmation affordances in UI.
  - Exit criteria: plans containing `DROP COLUMN` are clearly warned.

### Track E - Integration + Quality

- [ ] **E1. Migration generator handoff** (Owner: Extension, Estimate: 0.5 day, Depends: C2,D2)
  - Deliverables: payload bridge into existing migration workflows.
  - Exit criteria: one-click handoff works on sample suggestions.

- [ ] **E2. ER diagram preview hook** (Owner: Extension, Estimate: 0.5 day, Depends: C2,D2)
  - Deliverables: preview action and schema-before/after handoff metadata.
  - Exit criteria: preview opens with expected transformed schema input.

- [ ] **E3. Unit + integration tests** (Owner: Extension, Estimate: 1.5 days, Depends: B4,C3,D3)
  - Deliverables: analyzer, plan builder, and webview message protocol coverage.
  - Exit criteria: all new tests pass in CI.

- [ ] **E4. Performance baseline + limits** (Owner: Extension, Estimate: 0.5 day, Depends: B4)
  - Deliverables: timing baselines (10/50/100 table fixtures), scan limits/chunking.
  - Exit criteria: analyzer runtime documented and within accepted threshold.

### Track F - Release Readiness

- [ ] **F1. Documentation pass** (Owner: Docs/Extension, Estimate: 0.5 day, Depends: E1,E2,E3)
  - Deliverables: user-facing caveats and safety notes aligned with behavior.
  - Exit criteria: known limitations and panel copy match implemented behavior.

- [ ] **F2. Final regression sweep** (Owner: Extension, Estimate: 0.5 day, Depends: F1,E4)
  - Deliverables: command discoverability, panel stability, copy workflows, no regression in existing commands.
  - Exit criteria: manual smoke checklist completed.

## Milestones

- **M1 (End of Week 1):** A1-A2, B1-B2 complete; command opens panel and shows ranked MVP suggestions.
- **M2 (Mid Week 2):** B3-B4, C1-C2, D1 complete; full suggestion set with draft plan generation.
- **M3 (End of Week 2):** C3, D2-D3, E1-E4 complete; integrated, tested, and performance-bounded feature.
- **M4 (Release Gate):** F1-F2 complete; docs and regression checks signed off.

## Risks and Blockers Tracker

- **Data size risk:** overlap joins and distinct scans may be expensive on very large tables.
  - Mitigation: cap scans, batch queries, and expose "partial analysis" notice.
- **False-positive risk:** overlap-based merge suggestions may overfit coincidental matches.
  - Mitigation: require stricter confidence thresholds + explicit evidence strings.
- **Compatibility risk:** older SQLite targets may not support direct `DROP COLUMN`.
  - Mitigation: produce fallback guidance and mark step as destructive/compatibility-sensitive.

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| SchemaIntelligence | Cached schema metadata for analysis |
| QueryIntelligence | Query patterns inform refactoring priorities |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Schema Intelligence Cache (1.2) | Table/column metadata |
| Column Profiler (29) | Cardinality analysis, null percentages |
| QueryIntelligence (1.3) | JOIN patterns suggest relationships |
| AI Schema Reviewer (59) | AI suggestions feed into refactoring |
| Health Score (30) | Low scores trigger refactoring suggestions |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| Migration Generator (24) | Multi-step migration plans |
| ER Diagram (38) | "Preview Refactored Schema" |
| Health Score (30) | Refactoring improves schema quality |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| Refactoring Suggestion | "Generate Migration" | Migration with multi-step plan |
| Refactoring Suggestion | "Preview Schema" | ER Diagram showing result |
| Refactoring Suggestion | "Estimate Impact" | Impact analysis |
| Health Score | "Suggest Refactorings" | Refactoring Engine |
| AI Schema Reviewer | "Apply Suggestion" | Refactoring with AI-generated plan |
| Column Profiler | "Normalize Column" | Normalization refactoring |

### Health Score Contribution

| Metric | Contribution |
|--------|--------------|
| Schema Quality | Refactoring opportunities affect score |
| Action | "View Refactoring Suggestions" → panel |

### Column Profiler Integration

The Refactoring Engine uses Column Profiler data for smarter suggestions:

```typescript
async function _detectNormalization(tables: TableMetadata[]): Promise<IRefactoringSuggestion[]> {
  for (const table of tables) {
    for (const col of table.columns) {
      // Use Column Profiler for cardinality analysis
      const profile = await columnProfiler.getProfile(table.name, col.name);
      
      if (profile && profile.distinctCount <= 20 && profile.totalCount > 50) {
        const ratio = profile.distinctCount / profile.totalCount;
        if (ratio < 0.1) {
          suggestions.push({
            type: 'normalize',
            title: `Normalize ${table.name}.${col.name}`,
            description: `${profile.distinctCount} distinct values across ${profile.totalCount} rows`,
            confidence: ratio < 0.01 ? 0.9 : 0.7,
            // Include actual values for preview
            topValues: profile.topValues,
          });
        }
      }
    }
  }
}
```

### AI Schema Reviewer Bridge

AI suggestions can be implemented through the Refactoring Engine:

```
AI Schema Review Finding:
  "orders.status should be normalized to a lookup table"
      │
      ▼
[Apply Suggestion] button
      │
      ▼
Refactoring Engine:
  - Receives: { type: 'normalize', table: 'orders', column: 'status' }
  - Generates: Multi-step migration plan
  - Outputs: SQL + Dart code + Drift table class
```

### Health Score Feedback Loop

```
Low Health Score (Schema Quality: D)
      │
      ▼
Health Score Panel: "Suggest Refactorings" button
      │
      ▼
Refactoring Engine runs analysis
      │
      ▼
Suggestions prioritized by health impact:
  1. Normalize orders.status → +8% schema quality
  2. Split users table → +5% schema quality
  3. Add FK constraint → +3% schema quality
```

---

## Known Limitations

- Analysis requires querying data (DISTINCT counts, JOINs) — slow on large databases
- Split suggestions are heuristic (column count threshold) — no analysis of query patterns to determine optimal grouping
- Merge detection via data overlap can produce false positives (coincidental value matches)
- Generated migration code is a starting point — complex schemas may need manual adjustment
- No support for detecting enum-like INTEGER columns (only TEXT columns checked for normalization)
- SQLite `ALTER TABLE DROP COLUMN` requires 3.35.0+ — may not work on older Android
- Common column group extraction — see [Feature 69](../../../../69-refactoring-extract-common-column-groups.md)
- Only single-column FKs supported in generated code
