<!--
  Archived 2026-04-30: full retained specification. Entry-point stub: ../../../../18-natural-language-sql.md
-->

# Feature 18: Natural Language to SQL

> **Status: COMPLETE** — Phases 1 and 2 are implemented in the VS Code extension (as of 2026-04-30). Active stub: [../../../../18-natural-language-sql.md](../../../../18-natural-language-sql.md).

## What It Does

In the VS Code extension, users type a plain-English question ("users who signed up this week with no orders") and receive generated SQL based on live schema metadata (tables, columns, types, foreign keys). Generated SQL is inserted into the **SQL Notebook** webview as a **new query tab** (not a VS Code Notebook cell), pre-filled so users can review and edit before running.

## User Experience

### Package debug surface (existing behavior)

**Ask in English…** opens a modal with a multiline question and a read-only **Generated SQL (preview)** updated as you type; **Use** copies into the main SQL editor. This path remains client-side pattern matching against `/api/schema/metadata` (`nlToSql` in `assets/web/app.js`), not an LLM.

### VS Code extension surface (this feature)

LLM-backed NL-to-SQL generation that inserts output into SQL Notebook.

1. Open the SQL Notebook (`Ctrl+Shift+Q`) or click **Ask in English…** in the notebook toolbar (or **Ask Natural Language** from the Database view when connected)
2. Either a **QuickPick** of suggestions (past NL questions, saved table filters, SQL Notebook history) or a plain **input box** appears — configurable via `driftViewer.nlSql.seedSuggestions`
3. Type or choose: e.g. "show me users who have no orders"
4. Extension sends schema + question to the configured LLM provider
5. Generated SQL appears in a new SQL Notebook **query tab**, pre-filled but not yet executed:
   ```sql
   SELECT u.* FROM "users" u
   LEFT JOIN "orders" o ON o.user_id = u.id
   WHERE o.id IS NULL;
   ```
6. User reviews, optionally edits, then executes with the existing Run button
7. Results render in the standard notebook results pane
8. Previous NL questions + SQL are saved; reopen via command **NL Query History** (`driftViewer.nlSqlHistory`) or from the suggestion picker

### Error / Edge Cases

- If the LLM call fails (timeout/network/401/429/5xx) or validation fails after generation, `showErrorMessage` includes a **Retry** action that re-runs generation for the **same** question (no duplicate history row until a successful validated result).
- If SQL fails post-generation validation (see "SQL Safety Contract"), show the validation error and do not open the destination picker or insert into SQL Notebook / VQB.
- If no API key is configured, show a setup prompt and allow inline secure entry via `showInputBox(..., password: true)`; cancel returns without throwing.
- **Status bar:** while the LLM call runs, a left-aligned status item shows `NL-to-SQL: generating…`; on success it briefly shows `done` then disposes. On HTTP **429** / rate-limit text in the error, the status item shows **rate limited** and stays visible a few seconds longer as the rate-limit hint.

## New Files

```
extension/src/
  nl-sql/
    nl-sql-provider.ts        # Orchestrates schema collection + LLM call + result injection
    schema-context-builder.ts  # Builds compact schema summary for the LLM prompt
    llm-client.ts              # HTTP client for LLM API (provider-agnostic)
    sql-validator.ts           # Enforces SELECT-only, single-statement safety rules
    nl-sql-history.ts          # Persists past NL queries + generated SQL
extension/src/test/
  schema-context-builder.test.ts
  nl-sql-history.test.ts
  sql-validator.test.ts
  llm-client.test.ts
  nl-sql-provider.test.ts
```

## Dependencies

- `api-client.ts` — `schemaMetadata()` for table/column/type info, `tableFkMeta()` for FK relationships
- `sql-notebook/` — insert generated SQL into a new **query tab** (`SqlNotebookPanel.showAndInsertQuery` + webview `insertQueryCell` message); toolbar **Ask in English…** posts `requestNlSql` to run the same command
- External: user-configured LLM API (OpenAI, Anthropic, Ollama, etc.)

## Architecture

### Implementation Scope (Phase 1 vs Phase 2)

**Phase 1 (required for this feature to ship):**
- Extension command + API key setup + LLM generation
- Schema context builder (using existing metadata endpoints)
- SQL safety validation gate
- Insert generated SQL into SQL Notebook as a new, unexecuted **query tab** (or import into Visual Query Builder via post-generation destination picker)
- Local NL query history (`vscode.Memento`)

**Phase 2 (shipped):**
- `SchemaIntelligence` cache-backed schema context (with client fallback)
- `QueryIntelligence.recordQuery(sql, 0, 0)` after destination pick (no `source` field on engine API)
- NL suggestions: `NlSqlHistory`, saved filters (`FilterStore`), SQL Notebook `QueryHistoryStore` (`seedSuggestions` setting)
- Post-generation destinations: SQL Notebook, Visual Query Builder, **Save as snippet** (`driftViewer.saveAsSnippet`), **Add query widget to dashboard** (`driftViewer.addQueryWidgetToDashboard`), query cost analyzer
- Optional `LogCaptureBridge.writeNlQueryEvent` when log mode is not `off`
- Schema prompt caps: `driftViewer.nlSql.maxSchemaTables`, `driftViewer.nlSql.maxSchemaContextChars`

### Schema Context Builder

Collects the live schema and formats it as a compact prompt:

```typescript
interface ISchemaContext {
  tables: ITableContext[];
  foreignKeys: IFkContext[];
}

interface ITableContext {
  name: string;
  columns: { name: string; type: string; pk: boolean }[];
  rowCount: number;
}

interface IFkContext {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

class SchemaContextBuilder {
  constructor(private readonly _client: DriftApiClient) {}

  async build(): Promise<string> {
    const meta = await this._client.schemaMetadata();
    const fks = await Promise.all(
      meta.tables.map(t => this._client.tableFkMeta(t.name))
    );

    // Format as compact DDL-like text (not full CREATE TABLE — saves tokens)
    // Example output:
    // users(id INTEGER PK, name TEXT, email TEXT, created_at TEXT) [1250 rows]
    // orders(id INTEGER PK, user_id INTEGER FK→users.id, total REAL) [3400 rows]
    return this._formatForLlm(meta, fks);
  }
}
```

### LLM Client

Provider-agnostic HTTP client. Supports OpenAI-compatible APIs (covers OpenAI, Anthropic via proxy, Ollama, LM Studio, etc.):

```typescript
interface ILlmConfig {
  apiUrl: string;       // e.g., "https://api.openai.com/v1/chat/completions"
  apiKey: string;       // from VS Code secret storage
  model: string;        // e.g., "gpt-4o-mini"
  maxTokens: number;    // default 500
}

class LlmClient {
  constructor(private readonly _config: ILlmConfig) {}

  async generateSql(schemaContext: string, question: string): Promise<string> {
    const systemPrompt = [
      'You are a SQL assistant for SQLite databases.',
      'Given the schema below, write a single SELECT query that answers the user\'s question.',
      'Return ONLY the SQL query, no explanation.',
      'Use double quotes for identifiers. Use single quotes for strings.',
      '',
      'Schema:',
      schemaContext,
    ].join('\n');

    const response = await fetch(this._config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._config.apiKey}`,
      },
      body: JSON.stringify({
        model: this._config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: this._config.maxTokens,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed (${response.status})`);
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('LLM returned an empty response');
    }

    return this._extractSql(content);
  }

  private _extractSql(text: string): string {
    // Strip markdown code fences if present
    const match = text.match(/```sql?\s*([\s\S]*?)```/);
    return (match ? match[1] : text).trim();
  }
}
```

### NL-SQL Provider

Orchestrates the full flow:

```typescript
class NlSqlProvider {
  constructor(
    private readonly _contextBuilder: SchemaContextBuilder,
    private readonly _llmClient: LlmClient,
    private readonly _history: NlSqlHistory,
  ) {}

  async ask(question: string): Promise<string> {
    const schema = await this._contextBuilder.build();
    const sql = await this._llmClient.generateSql(schema, question);
    validateGeneratedSql(sql);
    this._history.add(question, sql);
    return sql;
  }
}
```

### SQL Safety Contract

Generated SQL must pass validation before opening the destination picker or inserting into SQL Notebook / VQB:

1. Exactly one statement (no stacked statements)
2. Must start with `SELECT` or `WITH` (CTE that resolves to SELECT)
3. Reject mutation and DDL/DCL/pragma tokens (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `ATTACH`, `DETACH`, `PRAGMA`, etc.)
4. Max SQL length: 20,000 chars (guardrail against malformed output)

```typescript
function validateGeneratedSql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!trimmed) throw new Error('Generated SQL is empty');

  // Single-statement guard (ignore trailing semicolon)
  if (trimmed.includes(';')) throw new Error('Only a single SQL statement is allowed');

  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed');
  }

  const banned = /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|GRANT|REVOKE)\b/i;
  if (banned.test(trimmed)) {
    throw new Error('Only read-only SELECT queries are allowed');
  }

  if (trimmed.length > 20000) {
    throw new Error('Generated SQL exceeds max allowed length');
  }
}
```

### Query History

```typescript
interface INlSqlEntry {
  question: string;
  sql: string;
  timestamp: number;
}

class NlSqlHistory {
  private _entries: INlSqlEntry[] = [];

  constructor(private readonly _state: vscode.Memento) {
    this._entries = _state.get<INlSqlEntry[]>('nlSqlHistory', []);
  }

  add(question: string, sql: string): void {
    this._entries = this._entries.filter(e => !(e.question === question && e.sql === sql));
    this._entries.unshift({ question, sql, timestamp: Date.now() });
    if (this._entries.length > 50) this._entries.length = 50;
    this._state.update('nlSqlHistory', this._entries);
  }

  get entries(): readonly INlSqlEntry[] { return this._entries; }
}
```

## Server-Side Changes

None. This feature is extension-only — it uses the existing `schemaMetadata()`, `tableFkMeta()`, and `sql()` endpoints.

## package.json Contributions

Authoritative `contributes.commands`, `menus`, and `configuration` keys live in **`extension/package.json`**. NL-SQL–related settings include at least: `driftViewer.nlSql.apiUrl`, `model`, `maxTokens`, `seedSuggestions`, `maxSchemaTables`, `maxSchemaContextChars`. Related commands include `driftViewer.askNaturalLanguage`, `driftViewer.nlSqlHistory`, and (for dashboard handoff) `driftViewer.addQueryWidgetToDashboard`.

API key is stored in `vscode.SecretStorage`, not in settings (never in plaintext).

## Wiring (implementation)

Registration lives in `extension/src/nl-sql/nl-sql-commands.ts` (`registerNlSqlCommands`), invoked from `extension/src/extension-commands.ts` like other feature modules.

Behavior summary:

- `driftViewer.askNaturalLanguage` — API key prompt if missing → suggestion QuickPick (or `showInputBox` / seeded question) → status-bar + `withProgress` → `NlSqlProvider.ask` → on failure **Retry** → on success optional `writeNlQueryEvent` → **QuickPick** destination (Notebook, VQB, Snippet, Dashboard widget, Cost) → dispatch (`saveAsSnippet`, `addQueryWidgetToDashboard`, etc.).
- `driftViewer.nlSqlHistory` — pick a saved entry, same destination QuickPick.
- SQL Notebook webview toolbar **Ask in English…** posts `requestNlSql`; `SqlNotebookPanel` handles it with `executeCommand('driftViewer.askNaturalLanguage', { openFrom: 'sql-notebook' })`.

## Testing

- `schema-context-builder.test.ts`: compact formatting, FK inclusion, empty schema, optional `SchemaIntelligence` path, table/char caps
- `nl-sql-history.test.ts`: test add, deduplication, max length cap, persistence round-trip
- `sql-validator.test.ts`: single statement, SELECT/CTE acceptance, banned keyword rejection, max-length guard
- `llm-client.test.ts` (mock HTTP): non-200 handling, malformed JSON shape, empty content, markdown-fenced SQL extraction
- `nl-sql-provider.test.ts`: validation failure blocks `history.add`; successful `SELECT` persists one history entry

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| DriftApiClient | `schemaMetadata()` and `tableFkMeta()` for live schema context in Phase 1 |
| SQL Notebook panel | Inserts generated SQL as a new unexecuted **query tab** in Phase 1 |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Schema Intelligence Cache (1.2) | **Phase 2:** used when intelligence activation succeeds; else direct `DriftApiClient` metadata |
| Query History Search (50) | **Phase 2:** SQL Notebook `QueryHistoryStore` seeds NL suggestion picker |
| Saved Filters (52) | **Phase 2:** `FilterStore` entries seed NL suggestion picker |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| SQL Notebook (3) | Generated SQL injected as new **query tab** |
| Query Intelligence (1.3) | **Phase 2:** `recordQuery(sql, durationMs, rowCount)` after user picks a destination |
| Visual Query Builder (21) | **Phase 1/2:** destination imports SQL; dashboard integration uses `addQueryWidgetToDashboard` from VQB |
| Dashboard Builder (36) | **Phase 2:** `driftViewer.addQueryWidgetToDashboard` appends a `queryResult` widget |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| NL-SQL Result | "Edit Visually" | Visual Query Builder destination |
| NL-SQL Result | "Explain Query" | Query Cost Analyzer destination |
| NL-SQL Result | "Save as Snippet" | `driftViewer.saveAsSnippet` with SQL + suggested name |
| NL-SQL Result | "Add to Dashboard" | `driftViewer.addQueryWidgetToDashboard` |
| SQL Notebook | "Ask in English…" (toolbar) | Runs `driftViewer.askNaturalLanguage` (picker or input per `seedSuggestions`) |

### Health Score Contribution

None — this is a query tool, not a health metric.

### Unified Timeline Events

| Event Type | Data |
|------------|------|
| `nl-query` | `{ type, question, generatedSql, timestamp }` — `LogCaptureBridge.writeNlQueryEvent` when `performance.logToCapture` is not `off` |

---

## Known Limitations

- Requires an external LLM API key — no built-in model
- Quality depends on the LLM; small models may produce invalid SQL for complex schemas
- Schema context is rebuilt for each NL request; when `SchemaIntelligence` is active, insights use a server-backed cache (not “embedding” cache)
- Only SELECT queries are generated — no INSERT/UPDATE/DELETE
- Very large schemas: use `driftViewer.nlSql.maxSchemaTables` and `driftViewer.nlSql.maxSchemaContextChars` (defaults reduce prompt size)
- No feedback loop: if the SQL is wrong, user must manually fix it (no "refine" step)
- API key stored in VS Code secret storage — not synced across machines
- Phase 2 cross-feature actions are implemented as listed above; further polish (e.g. refine-in-English loop) is future work
