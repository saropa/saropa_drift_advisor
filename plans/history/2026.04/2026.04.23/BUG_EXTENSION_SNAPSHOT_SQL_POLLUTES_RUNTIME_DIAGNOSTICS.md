# Bug: Extension snapshot and diff SQL run without `internal: true`, so `slow-query-pattern` and `n-plus-one` pin to the user’s Drift table files

## Title

Extension-owned `SELECT * FROM "<table>" ORDER BY rowid LIMIT …` runs through `DriftApiClient.sql()` without `{ internal: true }`, so the server records `isInternal: false`, those queries appear in `slowQueries` / `recentQueries`, and runtime diagnostics fall back to the table definition line in the **application** workspace (e.g. `country_state_table.dart`, `activity_table.dart`).

## Environment

Fill every row when reproducing for triage:

| Field | Value |
|--------|--------|
| **OS** | *(e.g. Windows 11 10.0.22631 x64)* |
| **VS Code version** | *(Help → About)* |
| **Extension version** | *(Extensions panel — Saropa Drift Advisor)* |
| **Dart SDK version** | *(`dart --version`)* |
| **Flutter SDK version** | *(`flutter --version`, if Flutter app)* |
| **Database** | SQLite (Drift), app-embedded |
| **Connection** | HTTP to app-hosted Drift debug server (`startDriftViewer`) |
| **Relevant settings** | Drift Advisor runtime diagnostics category enabled (default) |
| **Other extensions** | *(list if any DB/SQL extensions interact)* |

## Steps to Reproduce

1. Open a Flutter workspace that depends on `saropa_drift_advisor` and calls `startDriftViewer` in debug (e.g. Saropa **contacts** app: `lib/main.dart` starts the viewer after first frame when `MainSettings.isDebugMode && DriftConfig.isInitialized`).
2. Launch the app in **debug** so the Drift debug server is listening.
3. Ensure the **Saropa Drift Advisor** VS Code extension is connected to the running session (same workflow you normally use for DB inspection).
4. Trigger a **timeline snapshot capture** (or any code path that runs `SnapshotStore.capture()`), **or** open **snapshot diff** for a table so `driftViewer.showSnapshotDiff` runs.
5. Open the **Problems** panel and/or the Drift table Dart files under `lib/database/drift/tables/`.

## Expected Behavior

- SQL executed **only** for extension features (snapshot of all tables, snapshot diff refresh) should be tagged **`isInternal: true`** on the wire (`POST /api/sql` body per [`extension/src/api-client-http-impl.ts`](../extension/src/api-client-http-impl.ts) and [`lib/src/server/sql_handler.dart`](../lib/src/server/sql_handler.dart)), so:
  - They are **omitted** from `slowQueries` in [`lib/src/server/performance_handler.dart`](../lib/src/server/performance_handler.dart) (`userTimings = timings.where((t) => !t.isInternal)`), and
  - They do **not** inflate `recentQueries` in a way that triggers false **N+1** counts against user app tables.
- If a diagnostic were still useful for extension-only traffic, it should **not** anchor on the user repo’s `class Foo extends Table` line as if the schema were defective.

## Actual Behavior

- Observed diagnostic examples (from a contacts dev session):
  - `[drift_advisor] Slow query (306ms, 1000 rows): SELECT * FROM "country_states" ORDER BY rowid LIMIT 1000` on `country_state_table.dart` line 15.
  - Same pattern for `emergency_tips`, `family_groups`, `native_contact_rollbacks`, `activities`, etc.
  - `n-plus-one` on `activities` (e.g. 43 hits in window) with message suggesting a loop.
- VS Code `severity` **2** = **Information** (not Warning) when pinned to table fallback — consistent with [`extension/src/diagnostics/checkers/slow-query-checker.ts`](../extension/src/diagnostics/checkers/slow-query-checker.ts) downgrading when `callerLoc` is absent — but the diagnostic **still** sits on the user’s table file, which reads as “fix this table.”

## Error Output

### 6a–6d. Console / Output / stack traces

Not captured in the originating handoff. When reproducing, attach:

- **Help → Toggle Developer Tools → Console** during steps 4–5.
- **Output → Saropa Drift Advisor** full buffer for the same window.
- Any stack traces from notifications (full text, not screenshots only).

### 6e. Emitter Attribution

#### Pair A — `slow-query-pattern`

| Field | Value |
|--------|--------|
| **owner** | `drift-advisor` |
| **code** | `slow-query-pattern` |
| **source** | `Drift Advisor` |
| **Registered at** | [`extension/src/diagnostics/codes/performance-codes.ts`](../extension/src/diagnostics/codes/performance-codes.ts) lines **23–32** (`PERFORMANCE_CODES['slow-query-pattern']`) |
| **Emit site(s)** | [`extension/src/diagnostics/checkers/slow-query-checker.ts`](../extension/src/diagnostics/checkers/slow-query-checker.ts) lines **79–86** (`issues.push` with `code: 'slow-query-pattern'`); invoked from [`extension/src/diagnostics/providers/performance-provider.ts`](../extension/src/diagnostics/providers/performance-provider.ts) lines **34–36** (`checkSlowQueries`) |
| **Grep command used** | `grep -rn "slow-query-pattern" extension/src/` (from `saropa_drift_advisor` repo root) |
| **Dart package (`lib/src/`)** | `grep -rn "slow-query-pattern" lib/` → **no matches** — this code is **not** emitted from the Dart analyzer tree for this diagnostic |
| **Sibling-repo negative grep** | `findstr /s /i "slow-query-pattern" D:\src\saropa_lints\lib\*.dart` → **exit 1 (no matches)** — not owned by `saropa_lints` |

#### Pair B — `n-plus-one`

| Field | Value |
|--------|--------|
| **owner** | `drift-advisor` |
| **code** | `n-plus-one` |
| **source** | `Drift Advisor` |
| **Registered at** | [`extension/src/diagnostics/codes/performance-codes.ts`](../extension/src/diagnostics/codes/performance-codes.ts) lines **34–41** |
| **Emit site(s)** | [`extension/src/diagnostics/checkers/n-plus-one-checker.ts`](../extension/src/diagnostics/checkers/n-plus-one-checker.ts) lines **89–95**; invoked from [`performance-provider.ts`](../extension/src/diagnostics/providers/performance-provider.ts) line **36** (`checkNPlusOnePatterns`) |
| **Grep command used** | `grep -rn "'n-plus-one'" extension/src/diagnostics` |
| **Note** | `checkNPlusOnePatterns` iterates `perfData.recentQueries` from [`performance_handler.dart`](../lib/src/server/performance_handler.dart) lines **79–81**, which includes **all** timings (internal + user). It does **not** skip `query.isInternal === true` before counting (unlike `checkSlowQueries`, which skips at line 38). Extension-generated SELECTs without `internal: true` therefore contribute to N+1 counts. |

## Root cause (confirmed in this repo)

1. **Snapshot capture** — [`extension/src/timeline/snapshot-store.ts`](../extension/src/timeline/snapshot-store.ts) lines **232–234**:

   ```ts
   const result = await client.sql(
     `SELECT * FROM "${table.name}" ORDER BY rowid LIMIT ${ROW_LIMIT}`,
   );
   ```

   No second argument `{ internal: true }`. [`DriftApiClient.sql`](../extension/src/api-client.ts) documents that omitting `internal` leaves `isInternal: false` on the server (**lines 153–170**).

2. **Snapshot diff refresh** — [`extension/src/timeline/snapshot-commands.ts`](../extension/src/timeline/snapshot-commands.ts) lines **79–81**: same `client.sql(...)` shape, no `{ internal: true }`.

3. **Server** — [`lib/src/server/performance_handler.dart`](../lib/src/server/performance_handler.dart): `slowQueries` excludes `isInternal`, but **`recentQueries`** includes the full ring buffer (comment lines **28–29**, implementation **79–81**). Any extension SELECT recorded as non-internal pollutes both paths.

## Minimal Reproducible Example

- Smallest trigger: connect extension + run one snapshot capture against a DB with a medium-sized table; observe `SELECT * FROM "<that_table>" ORDER BY rowid LIMIT …` in performance payload and matching `slow-query-pattern` on that table’s `extends Table` line in the open workspace.

## What We Already Tried

- Confirmed **contacts** production IO paths for some tables use indexed, limited queries; the literal `ORDER BY rowid LIMIT 1000` string is **not** from contacts DAOs — it matches **extension** `snapshot-store.ts` / `snapshot-commands.ts` exactly (`grep ORDER BY rowid` under `saropa_drift_advisor/extension`).

## Suggested fix (implementation sketch)

1. Pass **`{ internal: true }`** to `client.sql(...)` for all extension-only bulk reads in snapshot capture/diff (and audit other `client.sql(` call sites for the same pattern).
2. **Defense in depth:** in `n-plus-one-checker.ts`, skip entries with `query.isInternal === true` (mirror `slow-query-checker.ts`), so even if a caller forgets the flag, N+1 heuristics ignore extension probes.

## Regression info

- **CHANGELOG** reference: `saropa_drift_advisor` changelog mentions moving runtime diagnostics and downgrading severity when caller is missing — partial mitigation; this bug is about **wrong source** + **non-internal** tagging for snapshot SQL.

## Impact

- **Who:** Flutter/Drift developers using Saropa Drift Advisor against real apps.
- **Blocked:** Trust in `slow-query-pattern` / `n-plus-one` on table files; time spent chasing non-app SQL.
- **Data risk:** None.
- **Frequency:** Whenever snapshot / diff features run against many tables or one hot table repeatedly.

## Checklist (from BUG_REPORT_GUIDE)

- [x] Title names specific broken behavior
- [ ] Environment fully filled *(placeholder table — complete when filing)*
- [x] Steps numbered from clean state
- [x] Expected vs actual explicit
- [ ] Full error output attached *(pending repro capture)*
- [x] Emitter attribution for both `(owner, code)` pairs with file:line + grep
- [x] Dart `lib/src/` searched — no Dart emitter for these codes
- [x] Sibling `saropa_lints` negative check documented
