# Branch restore is atomic via the transactional batch path (audit M9)

Restoring a data branch overwrote the live database by issuing each table clear and row re-insert as a separate `client.sql()` call. Two defects: `client.sql()` targets the read-only `/api/sql` endpoint, whose validator rejects DELETE/INSERT — so the restore never actually wrote anything — and, had it written, an incremental DELETE-then-INSERT sequence with no transaction would leave the database half-restored (some tables cleared, others repopulated) if any statement failed partway.

## Finish Report (2026-06-13)

This work will be reviewed by another AI. — (chat-time note; not part of the durable record.)

### Scope

(B) VS Code extension (TypeScript). No Dart, no Flutter, no docs beyond the changelog.

### What changed

- **`extension/src/branching/branch-restore.ts`** — `restoreBranch` now collects every clear and re-insert into a single ordered statement list (children-first DELETEs, then parents-first INSERTs via `DependencySorter`) and submits it once through `DriftApiClient.applyEditsBatch` (`POST /api/edits/apply`), which the server runs inside `BEGIN IMMEDIATE … COMMIT` and rolls back on any failure. Identifiers are quoted with the shared `q()` helper instead of raw `"${name}"`.

### Design notes

- The apply endpoint caps a batch at 500 statements. A restore needing more is rejected as a whole rather than applied partially — that preserves the all-or-nothing guarantee. Chunking is deliberately avoided: separate chunks would be separate transactions and reintroduce the half-restored state this change prevents. The size bound is documented in the file header.
- The previous code path was non-functional (writes via the read-only endpoint), so this change also makes restore work for the first time on a write-enabled server; on a read-only server it surfaces an error exactly as before.

### Verification

- `tsc --noEmit -p ./` — clean.
- New `extension/src/test/branch-restore.test.ts` (fake client) asserts: exactly one `applyEditsBatch` call (atomic), no DELETE/INSERT routed through `sql()`, one DELETE per table + one INSERT per row, all clears ordered before all inserts, identifiers quoted, and an empty branch produces no batch. Full extension suite passes (2727).

### Outstanding

None for this item. The 500-statement bound is an inherent property of the server apply endpoint, documented rather than worked around.
