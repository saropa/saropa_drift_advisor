# Feature 21: Visual Query Builder

## Product direction (canonical surface)

**The debug web viewer (`assets/web/`) is the canonical place to compose and run queries.** It already ships a per-table query builder with Visual/Raw SQL, WHERE, ORDER BY, and LIMIT. Users who live in the browser should not be forced through the narrow Database sidebar or the command palette to get multi-table / join / aggregate workflows.

### (a) Extension: no sidebar / tree discovery for this feature

- **Removed** Database view **title bar** and **table context menu** entries that opened the Visual Query Builder or “Build query from table.” The sidebar stays for navigation; it is not a query-workbench surface.
- **Commands remain registered** (`driftViewer.openQueryBuilder`, `driftViewer.buildQueryFromTable`, `driftViewer.openQueryBuilderFromSql`) for automation and for flows that already invoke them (e.g. NL-SQL “edit in builder”, tests, optional palette use). They are intentionally **not** advertised from the tree.

### (b) Website: upgrade the table query builder to close the gap

Extend `assets/web/query-builder.ts` (and callers) so the **website** gains everything users would otherwise reach for in the extension-only builder:

| Gap (today’s web vs extension model) | Website work |
|--------------------------------------|--------------|
| Single `FROM` current table only | Multi-table instances, aliases, self-joins |
| No JOIN UI | Add/remove joins with FK hints from `/api/schema/metadata` + `tableFkMeta` (or equivalent client bundle) |
| No GROUP BY / aggregates | GROUP BY list + per–selected-column aggregation when grouping |
| Single ORDER BY column | Multiple ORDER BY clauses (column + ASC/DESC) |
| No “paste SELECT → graph” | Optional: port or share `sql-import` rules (TS shared with extension, or hand-ported JS) behind Raw/paste affordance |
| Results + preview | Keep live SQL preview + `POST /api/sql` (already the web pattern) |

**Web v1 (landed in repo):** `assets/web/query-builder.ts` exposes **Single table | Multi-table**; `query-builder-multi.ts` holds the multi UI and model; `query-builder-sql.ts` validates/renders SQL aligned with the extension renderer (duplicated TS until a shared package exists). **Web SQL → visual graph import landed** (`query-builder-import.ts`, wired behind the Raw SQL panel's "Import to visual builder" button). **Shared single-source module landed (Phase 1):** render/validate/ops/parse/import now live in dependency-free `query-builder-core*.ts` consumed by both surfaces; the four web/extension files are thin adapters. No remaining parity gap vs the extension.

**Implementation note:** Prefer **one source of truth** for model + SQL rendering (shared package, or compile extension query-builder TS for the web bundle) so the site and extension do not diverge. Until that lands, treat the extension webview as a **secondary** or internal surface.

---

## What It Does

A visual query composer for flat `SELECT` statements: multiple table instances, joins (including self-joins), WHERE filters, GROUP BY with aggregation pickers, ORDER BY, LIMIT, live SQL preview, and execution. **Primary UX target: the debug website** (see above). The VS Code extension may host an equivalent webview for IDE-only flows (NL-SQL handoff, import SQL) without tree-based discovery.

## User Experience

1. **Website (target):** From the table / data view in the debug UI, open an upgraded query builder that supports the full model (multi-table, joins, GROUP BY, …) and run against `/api/sql`.
2. **Extension (optional):** Command-driven or NL-SQL–driven webview for the same model when the user is in VS Code—not from the Database tree.
3. A builder surface opens with zones analogous to:

```
╔═══════════════════════════════════════════════════════════╗
║  VISUAL QUERY BUILDER                                     ║
╠═══════════════════════════════════════════════════════════╣
║  ┌─────────────┐    ┌────────────────────────────────┐   ║
║  │ TABLES       │    │ CANVAS                         │   ║
║  │              │    │                                 │   ║
║  │  ☐ users     │    │  ┌─────────┐    ┌──────────┐  │   ║
║  │  ☐ orders    │    │  │ users   │───▶│ orders   │  │   ║
║  │  ☐ products  │    │  │ ☑ id    │    │ ☑ id     │  │   ║
║  │  ☐ categories│    │  │ ☑ name  │    │ ☑ total  │  │   ║
║  │              │    │  │ ☐ email │    │ ☑ status │  │   ║
║  │              │    │  └─────────┘    └──────────┘  │   ║
║  └─────────────┘    └────────────────────────────────┘   ║
║                                                           ║
║  ┌─────────────────────────────────────────────────────┐ ║
║  │ WHERE   users.name LIKE [%alice%]  [+ Add Filter]  │ ║
║  │ GROUP BY  users.name                                │ ║
║  │ ORDER BY  orders.total DESC                         │ ║
║  │ LIMIT     [100]                                     │ ║
║  └─────────────────────────────────────────────────────┘ ║
║                                                           ║
║  ┌─ SQL Preview ────────────────────────────────────────┐ ║
║  │ SELECT "users"."name", SUM("orders"."total")        │ ║
║  │ FROM "users"                                         │ ║
║  │ JOIN "orders" ON "orders"."user_id" = "users"."id"  │ ║
║  │ WHERE "users"."name" LIKE '%alice%'                  │ ║
║  │ GROUP BY "users"."name"                              │ ║
║  │ ORDER BY "orders"."total" DESC                       │ ║
║  │ LIMIT 100                                            │ ║
║  └──────────────────────────────────────────────────────┘ ║
║                                                           ║
║  [Run Query]  [Copy SQL]  [Open in Notebook]             ║
╚═══════════════════════════════════════════════════════════╝
```

3. **Adding tables**: Pick tables from schema (web: add instance controls; extension webview: same)—not from the Database sidebar as a primary path.
4. **Joins**: Drag from a column in one table card to a column in another (including a second instance of the same base table) → join line appears with type selector (INNER/LEFT/RIGHT)
5. **Selecting columns**: Check/uncheck columns in each table card
6. **Filters**: Click "+ Add Filter" → pick column → pick operator (=, !=, <, >, LIKE, IN, IS NULL, IS NOT NULL) → enter typed value(s)
7. **Aggregations**: When GROUP BY is set, non-grouped columns show aggregation picker (SUM, COUNT, AVG, MIN, MAX)
8. **SQL Preview**: Updates live as the user modifies the visual query
9. **Run Query**: Executes via `POST /api/sql` and shows results in a table below; stale responses from previous runs are ignored using request IDs

## New Files

```
extension/src/
  query-builder/
    query-builder-panel.ts     # Webview panel lifecycle (singleton)
    query-builder-html.ts      # HTML/CSS/JS template for the interactive builder
    query-model.ts             # Data model representing the visual query
    sql-renderer.ts            # Converts query model to SQL string
extension/src/test/
  query-model.test.ts
  sql-renderer.test.ts
```

## Dependencies

- `api-client.ts` — `schemaMetadata()` for table list, `tableFkMeta()` for join suggestions, `sql()` for execution
- `panel.ts` — base webview panel pattern

## Architecture

### Query Model

Pure TypeScript data model, no VS Code dependency:

```typescript
interface IQueryModel {
  modelVersion: 1;
  tables: IQueryTableInstance[];
  joins: IQueryJoin[];
  selectedColumns: ISelectedColumn[];
  filters: IQueryFilter[];
  groupBy: IGroupByColumn[];
  orderBy: IOrderByClause[];
  limit: number | null;
}

interface IQueryTableInstance {
  id: string;                // stable UUID for instance identity
  baseTable: string;         // e.g. "contacts"
  alias: string;             // auto-generated: c1, c2 (must be unique)
  columns: ColumnMetadata[];
  position: { x: number; y: number };
}

interface IQueryJoin {
  id: string;
  leftTableId: string;
  leftColumn: string;
  rightTableId: string;
  rightColumn: string;
  type: 'INNER' | 'LEFT' | 'RIGHT';
}

interface ISelectedColumn {
  tableId: string;
  column: string;
  aggregation?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';
  alias?: string;
}

type IQueryFilter =
  | IScalarFilter
  | IInFilter
  | INullFilter;

interface IScalarFilter {
  id: string;
  tableId: string;
  column: string;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=';
  value: string | number | boolean;
  conjunction: 'AND' | 'OR';
}

interface IInFilter {
  id: string;
  tableId: string;
  column: string;
  operator: 'IN';
  values: Array<string | number | boolean>;
  conjunction: 'AND' | 'OR';
}

interface INullFilter {
  id: string;
  tableId: string;
  column: string;
  operator: 'IS NULL' | 'IS NOT NULL';
  conjunction: 'AND' | 'OR';
}

interface IGroupByColumn {
  tableId: string;
  column: string;
}

interface IOrderByClause {
  tableId: string;
  column: string;
  direction: 'ASC' | 'DESC';
}
```

**Model rules (v1):**
- Table identity is by `IQueryTableInstance.id`; base table names are not unique.
- Self-joins are supported by adding multiple instances of the same base table.
- Boolean logic is flat in v1 (`AND`/`OR` chain, no nested parentheses).
- `limit` must be a positive integer; default to `100`.
- Empty-table model is valid in UI state, but not executable.

### SQL Renderer

Converts the model to valid SQLite SQL:

```typescript
class SqlRenderer {
  render(model: IQueryModel): string {
    const validationErrors = validateQueryModel(model);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid query model: ${validationErrors.join('; ')}`);
    }

    const parts: string[] = [];
    const tableById = new Map(model.tables.map(t => [t.id, t]));

    // SELECT
    const cols = model.selectedColumns.map(c => {
      const table = tableById.get(c.tableId)!;
      const ref = `"${table.alias}"."${c.column}"`;
      if (c.aggregation) {
        const alias = c.alias ?? `${c.aggregation.toLowerCase()}_${c.column}`;
        return `${c.aggregation}(${ref}) AS "${alias}"`;
      }
      return ref;
    });
    parts.push(`SELECT ${cols.length > 0 ? cols.join(', ') : '*'}`);

    // FROM (first-added instance is root)
    const rootTable = model.tables[0];
    parts.push(`FROM "${rootTable.baseTable}" AS "${rootTable.alias}"`);

    // JOINs
    for (const join of model.joins) {
      const left = tableById.get(join.leftTableId)!;
      const right = tableById.get(join.rightTableId)!;
      parts.push(
        `${join.type} JOIN "${right.baseTable}" AS "${right.alias}" ON "${right.alias}"."${join.rightColumn}" = "${left.alias}"."${join.leftColumn}"`
      );
    }

    // WHERE
    if (model.filters.length > 0) {
      const conditions = model.filters.map((f, i) => {
        const table = tableById.get(f.tableId)!;
        const ref = `"${table.alias}"."${f.column}"`;
        const prefix = i === 0 ? 'WHERE' : f.conjunction;
        if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
          return `${prefix} ${ref} ${f.operator}`;
        }
        if (f.operator === 'IN') {
          return `${prefix} ${ref} IN (${f.values.map(v => sqlLiteral(v)).join(', ')})`;
        }
        return `${prefix} ${ref} ${f.operator} ${sqlLiteral(f.value)}`;
      });
      parts.push(conditions.join('\n'));
    }

    // GROUP BY
    if (model.groupBy.length > 0) {
      parts.push(`GROUP BY ${model.groupBy.map(g => {
        const table = tableById.get(g.tableId)!;
        return `"${table.alias}"."${g.column}"`;
      }).join(', ')}`);
    }

    // ORDER BY
    if (model.orderBy.length > 0) {
      parts.push(`ORDER BY ${model.orderBy.map(o =>
        `"${tableById.get(o.tableId)!.alias}"."${o.column}" ${o.direction}`
      ).join(', ')}`);
    }

    // LIMIT
    if (model.limit !== null) parts.push(`LIMIT ${model.limit}`);

    return parts.join('\n');
  }
}
```

`validateQueryModel(model)` must enforce:
- at least one table for executable SQL
- no duplicate aliases
- no orphan references (table removed but join/filter/select remains)
- GROUP BY correctness for non-aggregated selected columns
- non-negative finite integer limit
- dedupe/forbid mirrored duplicate joins between same endpoints

### Webview Message Protocol

**Webview → Extension:**
```typescript
{ command: 'addTable', baseTable: string }
{ command: 'addTableInstance', baseTable: string } // explicit self-join path
{ command: 'removeTable', tableId: string }
{ command: 'addJoin', join: IQueryJoin }
{ command: 'removeJoin', joinId: string }
{ command: 'toggleColumn', tableId: string, column: string, selected: boolean }
{ command: 'setAggregation', tableId: string, column: string, aggregation: string | null }
{ command: 'addFilter', filter: Omit<IQueryFilter, 'id'> }
{ command: 'removeFilter', id: string }
{ command: 'setGroupBy', columns: IGroupByColumn[] }
{ command: 'setOrderBy', clauses: IOrderByClause[] }
{ command: 'setLimit', limit: number | null }
{ command: 'runQuery', requestId: string }
{ command: 'copySql' }
{ command: 'openInNotebook' }
{ command: 'saveAsSnippet' }
{ command: 'analyzeCost' }
{ command: 'addToDashboard' }
```

**Extension → Webview:**
```typescript
{ command: 'init', tables: TableMetadata[], fks: IFkContext[], capabilities: IBuilderCapabilities }
{ command: 'sqlPreview', sql: string }
{ command: 'validationErrors', errors: string[] }
{ command: 'queryResult', requestId: string, columns: string[], rows: object[], rowCount: number }
{ command: 'queryError', requestId: string, message: string }
{ command: 'integrationError', target: 'notebook' | 'snippet' | 'dashboard' | 'cost', message: string }
```

`requestId` correlation rule:
- Webview generates a UUID for each run.
- Extension echoes that UUID in success/error.
- Webview renders result only when `requestId === lastRunRequestId`.

### Auto-Join Suggestions

When a new table instance is added, the builder checks FK metadata and scored history from Query Intelligence to suggest joins:

```typescript
function suggestJoins(
  instances: IQueryTableInstance[],
  fks: IFkContext[],
  frequent: IFrequentJoin[]
): IQueryJoin[] {
  // Build candidates that connect the newly added instance to one existing instance.
  // If multiple candidates score similarly, show suggestion UI and require explicit user choice.
  return pickBestCandidates(instances, fks, frequent).map(candidate => ({
    id: uuid(),
    leftTableId: candidate.leftInstanceId,
    leftColumn: candidate.leftColumn,
    rightTableId: candidate.rightInstanceId,
    rightColumn: candidate.rightColumn,
    type: 'LEFT' as const,
  }));
}
```

### Canvas Rendering (HTML/JS)

Table cards are positioned with absolute positioning and snap-to-grid. Join lines are drawn using SVG between column endpoints. The JS uses vanilla DOM manipulation (no framework) to keep the bundle small. Include keyboard alternatives for adding joins, selecting columns, and adding filters.

## Server-Side Changes

No new backend endpoints required. Existing endpoints are used:
- `schemaMetadata()` for table/column list
- `tableFkMeta()` for foreign-key relationships
- `sql()` for query execution

Feature integrations in scope now are extension-layer actions that call existing services/features.

## package.json Contributions

**Menus:** Do **not** contribute Visual Query Builder to `view/title` or `view/item/context` on the Database tree. Sidebar discovery for this feature is intentionally omitted.

**Commands (remain):** Register palette/automation commands only, for example:

```jsonc
{
  "contributes": {
    "commands": [
      { "command": "driftViewer.openQueryBuilder", "title": "Visual Query Builder", "icon": "$(layout)" },
      { "command": "driftViewer.buildQueryFromTable", "title": "Build Query From Table" },
      { "command": "driftViewer.openQueryBuilderFromSql", "title": "Import SQL into Visual Query Builder" }
    ]
  }
}
```

Optional `keybindings` may be added later; do not bind this feature to tree UX.

## Wiring in extension.ts

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('driftViewer.openQueryBuilder', () => {
    QueryBuilderPanel.createOrShow(context.extensionUri, client);
  }),

  vscode.commands.registerCommand('driftViewer.buildQueryFromTable', (item: TableItem) => {
    QueryBuilderPanel.createOrShow(context.extensionUri, client, item.tableMetadata.name);
  })
);
```

## Testing

- `query-model.test.ts`: test model mutations (add/remove table, toggle column, add filter, etc.)
- `sql-renderer.test.ts`:
  - Single table, all columns → `SELECT * FROM "t" AS "t1"` style output
  - Self-join (`contacts` + `contacts`) → unique aliases and correct ON clause
  - Two tables with join → correct JOIN clause and deterministic ordering
  - Filters with scalar/null/IN operators → correct WHERE rendering
  - GROUP BY with aggregations → correct SELECT + GROUP BY; invalid models rejected
  - ORDER BY + LIMIT → correct clauses; invalid limit rejected
  - Empty model → validation error, no SQL render
  - SQL literal escaping edge cases → safely escaped
  - Duplicate/mirrored joins → rejected by validation
- `query-builder-panel.test.ts`:
  - request correlation drops stale `queryResult`/`queryError`
  - capability flags hide/disable unavailable integration actions
  - remove table instance cascades dependent state cleanup

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| SchemaIntelligence | `getTable()`, `getForeignKeys()` for table metadata + FK join suggestions |
| RelationshipEngine | `getForeignKeys(table)` → draw FK arrows between tables on canvas |
| QueryIntelligence | `recordQuery()` when executing built queries; `getFrequentJoins()` for suggested joins |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Schema Intelligence Cache (1.2) | Table list, column metadata, FK relationships for canvas |
| Natural Language SQL (18) | "Edit Visually" action loads generated SQL into builder |
| SQL Snippet Library (40) | "Load Snippet" inserts saved query patterns |
| Query History Search (50) | "Open in Builder" reconstructs visual model from SQL |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| SQL Notebook (3) | "Open in Notebook" creates cell with built SQL |
| Query Intelligence (1.3) | Built queries recorded for pattern learning |
| Dashboard Builder (36) | "Add to Dashboard" creates query result widget |
| Query Cost Analyzer (43) | "Analyze Cost" button sends built SQL for EXPLAIN |
| SQL Snippet Library (40) | "Save as Snippet" stores generated SQL with optional title |

### Integration Contracts (Scope Now)

| Action | Contract | Failure Behavior |
|--------|----------|------------------|
| Open in Notebook | Call notebook feature command with SQL text payload | Show toast + `integrationError`; keep builder state intact |
| Save as Snippet | Call snippet feature command with `{ title?, sql }` | Show toast + `integrationError`; leave unsaved draft title in UI |
| Add to Dashboard | Call dashboard command with `{ sql, displayName }` | Disable action when capability absent; error toast on runtime failure |
| Analyze Cost | Call cost analyzer command with SQL | Open analyzer panel on success; non-blocking error on failure |
| Record Query | `QueryIntelligence.recordQuery(sql, metadata)` after successful execution | Log warning only; never block result rendering |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| Visual Builder (extension webview) | "Analyze Cost" | Query Cost Analyzer |
| Visual Builder (extension webview) | "Open in Notebook" | SQL Notebook with generated SQL |
| Visual Builder (extension webview) | "Save as Snippet" | SQL Snippet Library |
| **Website** query builder (upgraded) | Run / preview | `/api/sql` + in-page results (canonical) |
| NL-SQL Result | "Edit Visually" | Extension Visual Builder webview (optional IDE path) |

**Removed:** Tree / sidebar “Build query from table” as a primary or advertised path (see Product direction).

### Health Score Contribution

None — query building tool.

### Query Autocomplete Enhancement

The Visual Builder benefits from Query Intelligence:
- **Frequent JOINs**: When adding a table instance, auto-suggest JOIN based on most common patterns from `QueryIntelligence.getFrequentJoins()`
- **Column suggestions**: Checkboxes sorted by frequency of use in historical queries

---

## Known Limitations

- No HAVING clause support (only WHERE)
- No subquery or UNION support — single query only
- Filter boolean logic is flat (no nested parentheses/grouping)
- No query save/load — ephemeral per session (copy SQL to persist)
- Join lines may overlap visually with many tables — no advanced auto-routing
- No column type validation in filters (user can compare TEXT with integer literal)
- Maximum ~10 tables on canvas before it becomes unwieldy

---

## Implementation Plan

Web v1 already landed (single + multi-table builder, SQL render/validate) — see **Product direction** above. The remaining work closes the gap to the extension model and removes the hand-synced duplication. The canonical surface is the **website**; the extension webview is secondary. Each phase ends at a verifiable gate. Files/tests referenced are defined in **New Files**, **Architecture**, and **Testing** above.

### Phase 0 — Landed (web v1)
- `query-builder.ts` (Single | Multi), `query-builder-multi.ts` (multi model + UI), `query-builder-sql.ts` (validate/render aligned to the extension renderer). **Status: done; baseline for the phases below.**

### Phase 1 — Single source of truth for model + SQL render — DONE
- Collapsed the duplicated TS into self-contained `extension/src/query-builder/query-builder-core*.ts` (`-core` render/validate/`sqlLiteral`, `-core-ops` operator lists, `-core-parse` string primitives, `-core-import` + `-core-import-clauses` flat-SELECT parser). No `api-client`/`vscode` imports, so esbuild bundles them into the web build and tsc into the extension. The extension (`sql-renderer.ts`, `sql-import.ts`) and web (`query-builder-sql.ts`, `query-builder-import.ts`) are thin adapters; the importer takes an injected table factory so each surface keeps its own model shape (extension: initials aliases + canvas `position`; web: `tN`). The five `sql-import-*` helpers were deleted. `validateQueryModel` enforces all listed rules and now also the JOIN-reachability check (was web-only).
- **Gate met:** `sql-renderer.test.ts` (and the full 2677-test extension suite) green; web `typecheck:web`/`build:js` clean; web and extension import the same compiled core; round-trip stability verified.

### Phase 2 — Web parity: joins, GROUP BY, multiple ORDER BY
- Extend `query-builder-multi.ts` and callers to add FK-hinted joins (from `/api/schema/metadata` + `tableFkMeta`), GROUP BY with per-column aggregation pickers, and multiple ORDER BY clauses; keep live SQL preview + `POST /api/sql` with request-ID staleness guarding.
- **Gate:** a multi-table query with a join, GROUP BY, an aggregate, and two ORDER BY clauses builds visually, previews correct SQL, and runs; stale results from a prior run are dropped.

### Phase 3 — SQL → visual graph import (web) — DONE
- Ported the `sql-import` rules to `assets/web/query-builder-import.ts` (`importSelectSqlToWebModel`) so a pasted `SELECT` reconstructs the multi-table model in the browser; wired behind the Raw SQL panel's **Import to visual builder** button in `query-builder.ts`. A failed parse preserves existing builder state (model returned as `null`).
- **Gate met:** a join+filter+GROUP BY+aggregate+multi-ORDER BY SELECT (plus IN/IS NULL, self-join, and `*` cases) reproduces the equivalent visual model and re-renders identical SQL — verified by an import→render→import→render stability check using the same web renderer.

### Phase 4 — Extension webview (optional, command-driven)
- Host the shared model in `query-builder-panel.ts` + `query-builder-html.ts` for IDE-only flows (NL-SQL "Edit Visually", import SQL). No tree/sidebar discovery — palette/automation commands only, per **Product direction**.
- **Gate:** `query-builder-panel.test.ts` green (request correlation drops stale results, capability flags hide unavailable integrations, remove-table cascades cleanup); NL-SQL handoff opens the builder with the generated SQL.

### Phase 5 — Integration actions (capability-gated)
- Wire "Open in Notebook", "Save as Snippet", "Add to Dashboard", "Analyze Cost", and `recordQuery`, each behind a capability flag with the documented failure behavior (toast + `integrationError`, state preserved).
- **Gate:** each action invokes its target when present and is hidden/disabled when absent; failures never discard builder state.

---

## Finish Report (2026-06-11)

**Trigger:** "implement this: plans/21-visual-query-builder.md". On inspection, Phases 0/2/4/5 were already landed; the two open items were Phase 3 (web SQL→visual import) and Phase 1 (single shared SQL module). Both are now implemented, closing the plan.

**Scope:** (B) VS Code extension (TypeScript) + the Dart package's debug web bundle (`assets/web/*.ts`, esbuild). No Flutter/Dart app code (`lib/`) touched → Flutter l10n checklist is out of scope.

### Phase 3 — web SQL → visual graph import
- New `assets/web/query-builder-import.ts` → `importSelectSqlToWebModel(sql, schemaTables)` produces the multi-table `WebQbModel`.
- `assets/web/query-builder.ts`: added an **Import to visual builder** button to the Raw SQL panel + handler (parse → load → switch to multi visual scope; alert on error; failed parse keeps prior state).
- `assets/web/query-builder-multi.ts`: `loadImportedMultiModel(model)` installs the parsed graph.

### Phase 1 — single source of truth
- Extracted the duplicated SQL semantics into self-contained, dependency-free modules under `extension/src/query-builder/`: `query-builder-core.ts` (render/validate/`sqlLiteral`), `query-builder-core-ops.ts` (WHERE operator lists), `query-builder-core-parse.ts` (string primitives + `makeImportId`), `query-builder-core-import.ts` + `query-builder-core-import-clauses.ts` (flat-SELECT parser, factory-injected table creation).
- Adapters: extension `sql-renderer.ts` / `sql-import.ts` and web `query-builder-sql.ts` / `query-builder-import.ts` now re-export or delegate to the core. The importer injects a per-surface table factory, so the extension keeps initials aliases + canvas `position` and the web keeps `tN` aliases.
- Deleted the 5 redundant `sql-import-{utils,from-joins,select-list,where,group-order}.ts` helpers (`utils` renamed → `query-builder-core-parse.ts`).
- The shared validator also added the JOIN-reachability check the web had but the extension lacked (a disconnected table now reports an error rather than emitting an un-runnable cross-join SELECT — a behavior improvement to the extension, covered by the existing 2677-test suite).

### Verification
- `extension` `npm run compile` clean; full mocha suite **2677 passing** (covers `sql-renderer`, `sql-import`, `query-model`, `query-builder-panel`, exercising the shared core through the unchanged public adapters).
- `npm run typecheck:web` clean; `npm run build:js` rebuilt `assets/web/bundle.js`.
- Throwaway import→render→import→render stability check passed 4/4 (join+filter+GROUP BY+aggregate+multi-ORDER BY, IN/IS NULL, self-join, `*`) — confirms a pasted SELECT reproduces an equivalent model and re-renders identical SQL.

### Files
- Added: `extension/src/query-builder/query-builder-core.ts`, `-core-ops.ts`, `-core-import.ts`, `-core-import-clauses.ts`; `assets/web/query-builder-import.ts`.
- Renamed: `sql-import-utils.ts` → `query-builder-core-parse.ts`.
- Modified: extension `sql-renderer.ts`, `sql-import.ts`; web `query-builder.ts`, `query-builder-multi.ts`, `query-builder-sql.ts`, `bundle.js`; `CHANGELOG.md`, `README.md`, this plan.
- Deleted: `sql-import-{from-joins,select-list,where,group-order}.ts`.

### Outstanding
None for this plan. "Known Limitations" (HAVING, subquery/UNION, nested boolean grouping, save/load) remain intentionally out of scope; any future work gets its own plan.

No bug archive — task did not close a `bugs/*.md` file.
