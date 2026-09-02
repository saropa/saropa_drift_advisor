# BUG: Inline cell edit silently corrupts INTEGER values above 2^53

**Status: Fix Ready**

Created: 2026-09-02
Component: Extension
File: `extension/src/editing/sqlite-cell-value.ts` (line ~138), `extension/src/editing/sql-generator.ts` (line ~4)
Severity: Wrong fix

---

## Summary

`coerceNonTextValue` runs `Number.parseInt` on an INTEGER cell edit and `sqlLiteral` writes the result back with `String(value)`. SQLite INTEGER is 64-bit; a JavaScript `number` is an IEEE-754 double with 53 bits of integer precision. A value above 2^53 is rounded to the nearest representable double and the rounded value is written to the database, with no warning and no visual cue - the grid shows the value the user typed.

---

## Attribution Evidence

```bash
# Positive - the coercion IS here
grep -rn "parseInt" extension/src/editing/
# extension/src/editing/sqlite-cell-value.ts:141:    return Number.parseInt(trimmed, 10);

grep -rn "export function sqlLiteral" extension/src/editing/
# extension/src/editing/sql-generator.ts:4:export function sqlLiteral(value: unknown): string {

grep -rn "coerceNonTextValue\|parseCellEditForColumn" extension/src/ | grep -v /test/
# extension/src/editing/sqlite-cell-value.ts:138:function coerceNonTextValue(
# extension/src/editing/sqlite-cell-value.ts:162:export function parseCellEditForColumn(
# extension/src/editing/sqlite-cell-value.ts:214:  return { ok: true, value: coerceNonTextValue(trimmed, col.type) };
# extension/src/editing/sqlite-cell-value.ts:237:  return parseCellEditForColumn(col, newValue);
# extension/src/editing/sqlite-cell-value.ts:260:    const r = parseCellEditForColumn(col, raw);

grep -rn "coerceNonTextValue" lib/src/
# Expected: 0 matches (inline-edit coercion is TypeScript-only)

# Negative - not a sibling-repo rule
grep -rn "coerceNonTextValue\|sqlLiteral" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:** `extension/src/editing/sqlite-cell-value.ts:141` (the `parseInt`), `extension/src/editing/sql-generator.ts:6` (`typeof value === 'number'` -> `String(value)`), reached from `EditingBridge` cell-update and row-insert handling.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Database type and version: SQLite 3.x (64-bit INTEGER)
- Connection method: local debug server
- Relevant non-default settings: write/editing enabled

---

## Steps to Reproduce

1. Table with a 64-bit identifier column - the shape produced by any snowflake ID, Twitter/Discord-style ID, or `Int64Column`:

   ```sql
   CREATE TABLE messages (id INTEGER PRIMARY KEY, remote_id INTEGER NOT NULL);
   INSERT INTO messages (remote_id) VALUES (1);
   ```

2. Open `messages` in the data grid.
3. Edit the `remote_id` cell to `9007199254740993` (2^53 + 1).
4. Apply the pending change.
5. Re-read the row: `SELECT remote_id FROM messages;`

---

## Expected Behavior

Either the value `9007199254740993` is stored exactly, or the edit is rejected with a message saying the value exceeds the precision the editor can guarantee.

---

## Actual Behavior

`9007199254740992` is stored. The applied SQL is:

```sql
UPDATE "messages" SET "remote_id" = 9007199254740992 WHERE "id" = 1
```

No warning is shown. The pending-changes view and the grid both display the typed value until the row is refetched, so the corruption is only visible if the user goes looking for it.

---

## Minimal Reproducible Example

Pure-function reproduction:

```js
const v = '9007199254740993';
/^-?\d+$/.test(v)                 // true   -> sqliteTypeCompatibilityError passes it
Number.parseInt(v, 10)            // 9007199254740992
String(Number.parseInt(v, 10))    // '9007199254740992'   <-- written to SQL

const v2 = '72057594037927937';   // 2^56 + 1, a plausible snowflake ID
String(Number.parseInt(v2, 10))   // '72057594037927940'  <-- off by 3
```

Note that the validator explicitly *approves* the input: `sqliteTypeCompatibilityError` tests `/^-?\d+$/`, which matches an arbitrarily long digit string, so the value passes validation and is then silently rounded by the coercion step that runs immediately afterwards.

The same path affects `validateRowInsert`, so a new row can be inserted with a rounded 64-bit key.

---

## Root Cause

`sqlite-cell-value.ts` validates the *text* correctly (any digit string is a valid SQLite INTEGER literal) and then converts it to a JavaScript `number`, a lossy type for this domain. The conversion serves no purpose: the value's only consumer is `sqlLiteral`, which turns it straight back into a decimal string for the SQL text.

```ts
// sqlite-cell-value.ts:138-142
function coerceNonTextValue(trimmed: string, sqlType: string): unknown {
  const u = (sqlType || '').toUpperCase();
  if (u === 'INTEGER' || u === 'INT') {
    return Number.parseInt(trimmed, 10);     // <-- 53-bit round trip
  }
```

```ts
// sql-generator.ts:4-9
export function sqlLiteral(value: unknown): string {
  ...
  if (typeof value === 'number') return String(value);
```

So the pipeline is `string -> lossy number -> string`, where the intermediate step is the only place precision can be lost.

**Fix sketch**

1. Keep the value as a `bigint` (or as a validated raw digit string) for INTEGER columns, since the only consumer re-serialises it:

   ```ts
   // SQLite INTEGER is 64-bit; a JS number carries 53 bits, so parseInt would
   // silently round a snowflake/Int64 id. The value is re-serialised as text by
   // sqlLiteral, so there is no reason to pass through a double at all.
   if (u === 'INTEGER' || u === 'INT') return BigInt(trimmed);
   ```

2. Teach `sqlLiteral` about `bigint` before its string fallback, so it emits the digits unquoted rather than falling through to `'...'`:

   ```ts
   if (typeof value === 'bigint') return value.toString();
   ```

   Without this the value would be quoted and stored as TEXT - a different corruption - so the two changes must land together.
3. Audit the other consumers of the coerced value: `PendingChange` persistence (`extension/src/editing/pending-changes-persistence.ts`) serialises changes to JSON, and `JSON.stringify` throws on `bigint`. Either add a `{ __bigint: '...' }` envelope there or carry the validated digit string instead of a `bigint` - the string form avoids the serialisation problem entirely and is the smaller change.
4. Tests: `extension/src/test/sqlite-cell-value.test.ts` and `extension/src/test/sql-generator.test.ts` have no case above 2^53. Add `9007199254740993` and `72057594037927937` round-trip assertions through `parseCellEditForColumn` -> `generateSqlStatements`.

---

## Impact

- Who is affected: any project storing 64-bit identifiers or timestamps in microseconds - snowflake IDs, Discord/Twitter IDs, `Int64Column`, `DateTime.microsecondsSinceEpoch` (which crosses 2^53 in the year 2255, so not urgent) and any externally-assigned key above 9,007,199,254,740,992.
- What is blocked: nothing visibly; the edit reports success.
- Data risk: **yes** - a wrong value is written to the user's real database with no warning, no error, and no visual difference in the grid until the row is refetched. If the column is a foreign key or an external system's identifier, the row is now unjoinable and the original value is unrecoverable from the database.
- Frequency: every inline edit or new-row insert of an INTEGER value above 2^53.

---

## Changes Made

Implemented the string-carrying variant of the fix sketch above (point 3's
"smaller change" alternative), not `bigint`, so no custom `JSON.stringify`
envelope is needed anywhere on the `PendingChange` persistence path:

- `extension/src/editing/sql-generator.ts`: added `RawIntegerLiteral`
  (`{ readonly rawInteger: string }`) and `isRawIntegerLiteral()`. `sqlLiteral`
  now emits `value.rawInteger` unquoted before falling through to the
  `typeof value === 'number'` / quoted-string branches, so a wrapped digit
  string reaches SQL as a number literal instead of being quoted as TEXT.

- `extension/src/editing/sqlite-cell-value.ts`: `coerceNonTextValue` now
  compares the validated digit string against `Number.MAX_SAFE_INTEGER` /
  `Number.MIN_SAFE_INTEGER` via `BigInt` (not float comparison, so the
  boundary check itself cannot round). Values inside the safe range still
  convert to `number` exactly as before; values outside it are returned as a
  `RawIntegerLiteral` wrapping the exact digit string. `sqliteTypeCompatibilityError`
  already guarantees the input matches `/^-?\d+$/`, so the `BigInt(trimmed)`
  parse cannot throw.

- `parseCellEditForColumn` (same file) now returns an optional `warning`
  field on the `ok: true` result when the coerced value is a
  `RawIntegerLiteral` - the edit is **not** rejected (it is stored exactly),
  the warning is purely informational. `validateCellEdit` passes the field
  through; `validateRowInsert` collects one `warnings: string[]` array across
  all columns of an insert.

- `extension/src/editing/editing-bridge.ts`: `_handleCellEdit` and
  `_handleRowInsert` now show `result.warning` / `result.warnings` via
  `vscode.window.showWarningMessage` after a successful validation, so the
  user is told when a value was stored via the 64-bit-exact path.

- Chose the reject-nothing approach over rejecting values above
  `MAX_SAFE_INTEGER` outright: SQLite INTEGER genuinely supports the full
  64-bit range, so rejecting would block a legitimate edit (e.g. a real
  snowflake ID) that the fix can store exactly. The warning tells the user
  what happened without blocking them.

- Tests added: `extension/src/test/sqlite-cell-value.test.ts` (coercion of
  `9007199254740993` and `-72057594037927937` to `RawIntegerLiteral`, safe
  boundary at `Number.MAX_SAFE_INTEGER` still a plain `number`) and
  `extension/src/test/sql-generator.test.ts` (`sqlLiteral` emits a
  `RawIntegerLiteral` unquoted; `generateSql` round-trips a 64-bit-only cell
  edit to the exact digit string in the `UPDATE` statement).

- Verified with `npx tsc --noEmit -p extension/tsconfig.json` (clean) and a
  scoped mocha run of `sqlite-cell-value.test.js` and `sql-generator.test.js`
  (33 passing, including the new cases).
