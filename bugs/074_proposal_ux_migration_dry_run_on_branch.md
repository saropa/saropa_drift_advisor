# PROPOSAL: Migration Dry-Run — Execute Generated DDL Against a Data Branch and Report What It Did

**Status: Open**

Created: 2026-09-02
Type: UX improvement
Related plan: research frontier item 6 ("Refactoring engine: verified migrations — preview shipped, apply-and-verify unbuilt")

---

## Summary

The extension generates migration DDL, rollback DDL, and SchemaVerifier tests, and it validates that
`drift_schemas/vN.json` files have no numeric gaps — but nothing anywhere ever *runs* a migration.
"Validate Migration Paths" reads filenames, not SQL. Add a dry-run that applies the generated DDL to
a Data Branch (a throwaway copy the extension already knows how to make) and reports success,
failure, and row-count deltas before the user commits the migration to source.

**Wow: 7/10, Effort: High**

---

## Motivation

Migration is the most-advertised capability in the README ("migration preview and rollback codegen",
"schema diff, generate Dart from runtime, migration preview & codegen, rollback generator") and the
one with the worst failure mode: a migration that compiles, ships, and destroys user data on
upgrade. Everything the extension offers today is text generation with no execution:

| Command | What it actually does |
| --- | --- |
| `driftViewer.migrationPreview` | renders DDL text |
| `driftViewer.generateMigration` | writes Dart migration code |
| `driftViewer.generateRollback` | writes reverse DDL + `customStatement()` Dart |
| `driftViewer.generateSchemaVerifierTest` | writes a test file the user must run themselves |
| `driftViewer.validateMigrationPaths` | see below |

`extension/src/migration-gen/migration-path-validator.ts` states its own scope in its header:

> "Scans `drift_schemas/` for version snapshot files (v1.json, v2.json, ...), extracts the version
> numbers, and reports gaps where an intermediate version is missing."

```ts
const versionPattern = /v(\d+)\./i;
```

It matches filenames. It never opens a snapshot, never compares schemas, never executes SQL. A user
who runs **Validate Migration Paths** and sees a clean result has learned only that their files are
numbered consecutively — which reads, from the command title, as far stronger assurance than it is.

The missing half is the frontier's item 6, "apply-and-verify unbuilt". The substrate for it is
already here:

- `extension/src/branching/branch-manager.ts` — creates a Data Branch: a bounded copy of table data
  (`driftViewer.branching.maxRowsPerTable`, default 10000; `maxBranches`, default 10).
- `extension/src/branching/branch-restore.ts` — writes a branch back through the server's
  `writeQuery` callback, batched, and already "gated on the server `writeQuery` callback, returns an
  error on a read-only server" (its own header comment).
- `extension/src/branching/branch-diff.ts` — `diffTable` / `diffBranches` already compute per-table
  row-level differences.
- `extension/src/compare/compare-panel.ts` and `driftViewer.compareReport` — already render a
  schema/row-count diff between two databases.
- `lib/src/server/index_batch_handler.dart` — the precedent for a narrow, validator-gated DDL
  endpoint that is deliberately not `/api/sql`.

So the missing piece is not infrastructure; it is a command that composes what exists into
"run it and tell me what happened".

---

## Detection / Behavior

### Should flag (problematic)

A user about to commit generated migration DDL with no evidence it runs:

```sql
ALTER TABLE users ADD COLUMN email TEXT NOT NULL;    -- fails on any existing row
CREATE UNIQUE INDEX users_email_idx ON users(email); -- fails on duplicates
ALTER TABLE orders RENAME COLUMN qty TO quantity;    -- needs SQLite >= 3.25
```

Every one of these is a runtime failure that no amount of text preview reveals — SQLite's
`ALTER TABLE` limitations and existing-data conflicts are precisely what break real migrations.

### Should pass (correct)

New command `driftViewer.migrationDryRun`, offered from the migration preview panel:

1. **Snapshot** — create a Data Branch from the live database (bounded, existing code path). Name it
   `dry-run/<schemaVersion>-><target>` so it is obvious in the Branches panel.
2. **Apply** — execute the generated DDL statement-by-statement against the branch. Stop at the
   first failure, keeping the statement index and the raw SQLite error.
3. **Report** — a result panel:

```
Migration v3 -> v4 dry-run              4 of 5 statements applied

OK   ALTER TABLE users ADD COLUMN nickname TEXT
OK   CREATE INDEX users_nickname_idx ON users(nickname)
OK   UPDATE users SET nickname = name WHERE nickname IS NULL
OK   ALTER TABLE orders RENAME COLUMN qty TO quantity
FAIL CREATE UNIQUE INDEX users_email_idx ON users(email)
       UNIQUE constraint failed: users.email  (3 duplicate values)
       -> Preview duplicates   -> Add a dedupe step before this statement

Row counts     users 1,204 -> 1,204   orders 8,331 -> 8,331   (no data lost)
Schema after   matches drift_schemas/v4.json
```

4. **Rollback check** — optionally apply `driftViewer.generateRollback`'s output to the same branch
   and assert the schema returns to the starting snapshot. That is the claim the rollback generator
   makes today and never demonstrates.
5. **Discard** — drop the branch. The live database is never touched at any point.

### Should pass (unchanged)

- Read-only server: the dry-run is unavailable with the reason stated up front (branch restore
  already refuses; surface that as a precondition, not as a mid-run error) — see
  `018_proposal_ux_write_capability_gating.md`.

---

## Edge Cases

1. **The branch is bounded** (`maxRowsPerTable`, default 10000). A `UNIQUE` violation that exists
   only in row 10,001 will not be found. The report must state the sample size in its header —
   "dry-run over the first 10,000 rows per table" — or a green result is a false assurance, which is
   worse than no dry-run at all.
2. **Where the branch lives.** A branch held in extension storage is not a SQLite database and
   cannot execute `ALTER TABLE`. This is the load-bearing design decision and must be settled before
   any code: either (a) a server-side scratch-database endpoint — correct, but Dart work plus a new
   attack surface that must be validator-gated the way `index_batch_handler.dart` is, or (b) an
   extension-hosted SQLite via a bundled WASM/native build — no server change, but a new dependency,
   which is a blast-radius decision requiring sign-off.
3. **`NOT NULL` without a default on a non-empty table** — the most common real failure; the report
   must name the offending existing rows, not just echo SQLite's message.
4. **SQLite version skew** — the dry-run engine's SQLite must match the device's, or `RENAME COLUMN`
   (3.25+) and `DROP COLUMN` (3.35+) pass in the dry-run and fail against an old Android system
   library. The report must print both versions.
5. **Triggers, views, and FTS5 shadow tables** — a branch that omits them will report a clean
   migration that breaks them in production; either copy them or declare them out of scope in the
   report header.
6. **Non-deterministic DDL** (`CURRENT_TIMESTAMP`, `random()`) — the result is not reproducible;
   flag such statements rather than implying the outcome is guaranteed.
7. **Long-running migrations** — report elapsed time per statement; a migration that succeeds but
   takes 40 s on 10k sampled rows is itself a finding.

---

## Alternatives Considered

- **Fix `validateMigrationPaths` to compare snapshot *contents* rather than filenames.** Strictly
  better than today and far cheaper — it would catch a schema that drifted from its recorded
  snapshot. But it still never executes SQL, so it cannot catch a `NOT NULL` conflict or a `UNIQUE`
  violation, which are the failures that actually reach users. Worth filing as a separate, smaller
  issue; it is not a substitute.
- **Lean on `generateSchemaVerifierTest`.** Drift's `SchemaVerifier` tests migrations against
  *empty* generated schemas. The whole value of a dry-run here is that it runs against the
  developer's real data, which is where the conflicts live.
- **Run the migration against the live database and offer the rollback.** Unacceptable: the rollback
  is itself unverified, and a failed migration on a developer's working dataset is exactly the
  outcome this feature exists to prevent.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

<!-- Fill in when work begins -->

---

## Commits

<!-- Add commit hashes as implementation lands -->
