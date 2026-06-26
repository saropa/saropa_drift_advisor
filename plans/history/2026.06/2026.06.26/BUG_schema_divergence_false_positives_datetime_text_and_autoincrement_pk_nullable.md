# Bug Report

**Status:** Fixed

## Title

"Code vs database" schema divergence reports ~107 false positives: every `DateTime` column as `code TEXT vs database INTEGER`, and every autoincrement `id` as `code not null vs database nullable`.

## Environment

- **OS:** Windows 11 Pro 10.0.22631 x64
- **VS Code version:** 1.126.0
- **Extension version:** saropa_drift_advisor ext-v9.0.7
- **Dart SDK version:** (Flutter-bundled; project under analysis is `d:\src\contacts`)
- **Database type and version:** SQLite (Drift `NativeDatabase`, app-embedded)
- **Connection method:** Drift Advisor loopback to the running Flutter app (`http://127.0.0.1:8642`)
- **Relevant non-default settings:** none
- **Other potentially conflicting extensions:** none relevant

This is a **diagnostic-content / analyzer false-positive** report against the extension's own schema comparison, not a VS Code editor diagnostic. The reporter is the analyzed app's maintainer, not the extension author — code references below into `saropa_drift_advisor` are attribution only (per BUG_REPORT_GUIDE §6e), not edits.

## Steps to Reproduce

1. Open `d:\src\contacts` (a Drift app whose `AppDatabase` does **not** set `storeDateTimeAsText`, so DateTime columns use Drift's default INTEGER/unix-epoch storage).
2. Launch the app so the Drift Advisor loopback server is reachable.
3. Open the Drift Advisor schema screen → "Code vs database" divergence view.
4. Read the divergence list.

## Expected Behavior

Zero divergences for these two classes, because there is no actual schema drift:

- DateTime columns: the Drift code uses the default storage (no `storeDateTimeAsText`), so the generated SQL column affinity is **INTEGER** — identical to the live DB. Code and database agree.
- Autoincrement `id` columns: Drift `autoIncrement()` generates `INTEGER PRIMARY KEY AUTOINCREMENT`. SQLite cannot store NULL in an `INTEGER PRIMARY KEY` (rowid alias), so there is no real nullability difference.

## Actual Behavior

107 divergences reported, all in two false-positive classes:

**Class A — type-mismatch on every DateTime column (~80 rows).** Example:

```
contacts.created_at — code TEXT vs database INTEGER
calendar_events.event_start — code TEXT vs database INTEGER
contact_groups.favorite_at — code TEXT vs database INTEGER
... (every *_at / created_at / updated_at / timestamp column, all tables)
```

**Class B — nullable-mismatch on every autoincrement PK (~25 rows).** Example:

```
affirmations.id — code not null vs database nullable
country_banks.id — code not null vs database nullable
star_trek_characters.id — code not null vs database nullable
... (every static-data table's id)
```

## Root Cause

### Class A — DateTime declared as TEXT instead of INTEGER

The declared-schema producer maps Drift's `dateTime` semantic type to `TEXT`:

`lib/src/start_drift_viewer_extension.dart:120-127`

```dart
String _declaredSqlType(dynamic column) {
  final String t = column.type.toString().toLowerCase();
  if (t.contains('int') || t.contains('bool')) return 'INTEGER';
  if (t.contains('double') || t.contains('real')) return 'REAL';
  if (t.contains('blob') || t.contains('uint8')) return 'BLOB';
  // string and dateTime (text/int storage) and anything else → TEXT.
  return 'TEXT';                           // <-- DateTime falls through to TEXT
}
```

Drift's **default** DateTime storage is INTEGER (unix seconds); TEXT (ISO-8601) is used only when the database sets `DriftDatabaseOptions(storeDateTimeAsText: true)`. The analyzed app does not set it, so the live column affinity is INTEGER. The declared side hard-codes TEXT regardless, so `typeAffinity('TEXT') !== typeAffinity('INTEGER')` fires for every DateTime column.

Note: the sibling TypeScript parser already maps this correctly — `extension/src/schema-diff/dart-schema.ts:61` has `DateTimeColumn: 'INTEGER'`. The Dart producer (`_declaredSqlType`) and the TS producer disagree; the Dart one feeds the divergence screen and is the one producing TEXT.

A correct fix maps `dateTime` → INTEGER by default, and only → TEXT when the database's `options.storeDateTimeAsText` is true (the producer duck-types a `GeneratedDatabase`, so the option is reachable). A label-only fix that flips the comment without flipping the return value will not help.

### Class B — autoincrement PK flagged nullable

The comparator compares declared nullability against the runtime `PRAGMA table_info.notnull` flag:

`assets/web/schema-divergence.ts:179-193`

```ts
// Runtime nullability is the inverse of PRAGMA's NOT NULL flag.
const dNullable = dc.nullable !== false; // declared
const rNullable = rc.notnull !== true;   // runtime
if (dNullable !== rNullable) {
  out.push({ ... kind: 'nullable-mismatch', ... });
}
```

For an `INTEGER PRIMARY KEY` (rowid alias), SQLite **always** reports `notnull = 0` in `pragma_table_info`, even though the column cannot store NULL (https://sqlite.org/lang_createtable.html §rowid, "INTEGER PRIMARY KEY"). The declared side correctly reports `nullable = false` (Drift `autoIncrement()` PK is NOT NULL), so declared(false) ≠ runtime(true) fires for every autoincrement PK.

The comparator already has primary-key information for the column (`dc.isPk`, checked a few lines later for the pk-mismatch finding at `schema-divergence.ts:194`). The nullable check should be suppressed (or special-cased) when the column is a single-column INTEGER primary key, since PRAGMA's notnull=0 for a rowid PK is a known SQLite quirk, not real drift.

## Emitter Attribution

This is a webview "Code vs database" divergence report, not a VS Code `Diagnostic`, so there is no `(owner, code)` pair. The two finding kinds and their producers:

**Finding kind `type-mismatch` (Class A)**
- Constructed at: `assets/web/schema-divergence.ts:171-178` (`detail: vt('viewer.schema.divergence.typeMismatch', dAff, rAff)`)
- Faulty input producer (declared sqlType): `lib/src/start_drift_viewer_extension.dart:120-127` (`_declaredSqlType`), used at `lib/src/start_drift_viewer_extension.dart:167`
- Sibling TS parser that is already correct (does NOT feed this screen): `extension/src/schema-diff/dart-schema.ts:61` (`DateTimeColumn: 'INTEGER'`)

**Finding kind `nullable-mismatch` (Class B)**
- Constructed at: `assets/web/schema-divergence.ts:182-193`
- Missing guard: same function does not skip the check for INTEGER PK columns despite `dc.isPk` being available (used at `schema-divergence.ts:194`)

Grep commands used (run from `D:\src\saropa_drift_advisor`):

```
grep -rn "return 'TEXT'" lib/src/start_drift_viewer_extension.dart
  -> lib/src/start_drift_viewer_extension.dart:126

grep -rn "DateTimeColumn" extension/src/schema-diff/dart-schema.ts
  -> extension/src/schema-diff/dart-schema.ts:61:  DateTimeColumn: 'INTEGER',

grep -rn "nullable-mismatch\|type-mismatch" assets/web/schema-divergence.ts
  -> assets/web/schema-divergence.ts:175 (type-mismatch)
  -> assets/web/schema-divergence.ts:186 (nullable-mismatch)

grep -rn "storeDateTimeAsText" lib/src/ extension/src/ assets/web/
  -> 0 matches (the producer never consults the DateTime-as-text option)
```

Both finding kinds are produced inside this repo (`saropa_drift_advisor`); no sibling-repo (`saropa_lints`, `saropa_dart_utils`) attribution applies. Negative grep:

```
grep -rn "schema-divergence\|_declaredSqlType" ../saropa_lints/lib/ ../saropa_dart_utils/lib/
  -> 0 matches
```

## Minimal Reproducible Example

Any Drift database with a DateTime column and an autoincrement PK, with default options:

```dart
class Things extends Table {
  IntColumn get id => integer().autoIncrement()();      // → flagged nullable FP
  DateTimeColumn get createdAt => dateTime()();          // → flagged TEXT-vs-INTEGER FP
}

@DriftDatabase(tables: [Things])
class AppDatabase extends _$AppDatabase {           // no storeDateTimeAsText override
  AppDatabase(super.e);
}
```

Open the Code-vs-database divergence view → both columns report a divergence; neither is real.

## What I Already Tried

- Confirmed the analyzed app sets no `storeDateTimeAsText`: `grep -rn storeDateTimeAsText d:\src\contacts\lib` → 0 matches, so Drift default INTEGER storage applies and the live DB matches the code.
- Confirmed the live DB types reported by the advisor are INTEGER for these columns (the "database INTEGER" side of every type row), consistent with Drift's default.
- Confirmed the divergences are inert at runtime: the app reads/writes these columns through Drift with no decode errors attributable to type/nullability drift.

## Regression Info

- Last working version: unknown / not bisected.
- The DateTime→TEXT mapping in `_declaredSqlType` and the missing INTEGER-PK guard in the divergence comparator appear to be original behavior, surfaced once both producers (declared + runtime) were wired into the Code-vs-database screen.

## Impact

- **Who is affected:** every Drift project that uses default DateTime storage (the common case) and autoincrement PKs (nearly universal) — i.e. essentially all users of the divergence screen.
- **What is blocked:** the divergence report is unusable for spotting real drift — ~107 false positives on this project bury any genuine finding. The signal-to-noise ratio defeats the feature's purpose.
- **Data risk:** none directly; the risk is indirect — real schema drift can hide among the false positives and be missed.
- **Frequency:** every run, every DateTime column and every autoincrement PK.

## Suggested Fix (for the extension maintainer — not applied here)

1. `lib/src/start_drift_viewer_extension.dart` `_declaredSqlType`: map `dateTime` → `INTEGER` by default; return `TEXT` only when the duck-typed database's `options.storeDateTimeAsText == true`. Align with the already-correct `extension/src/schema-diff/dart-schema.ts:61`.
2. `assets/web/schema-divergence.ts` `compareColumns`: skip the `nullable-mismatch` check when the column is a single-column INTEGER primary key (rowid alias), since `pragma_table_info.notnull` is always 0 for it regardless of real nullability.

## Finish Report (2026-06-26)

Both false-positive classes were eliminated at their producers; both suggested fixes were implemented as described.

### Class A — DateTime declared as TEXT (`lib/src/start_drift_viewer_extension.dart`)

The declared-schema producer `_declaredSqlType` hard-mapped every Drift `DateTime` column to `TEXT`, so the divergence screen compared declared `TEXT` against the live `INTEGER` affinity that Drift uses for its default unix-epoch DateTime storage, firing a `type-mismatch` on every DateTime column.

Changes:

- `_declaredSqlType` now takes a required `storeDateTimeAsText` flag and checks the `datetime` token before the generic `int` branch, returning `INTEGER` by default and `TEXT` only when the database opts into text storage.
- A new `_readStoreDateTimeAsText(dynamic driftDb)` duck-types `driftDb.options.storeDateTimeAsText`, defaulting to `false` for non-Drift databases (or older Drift without the getter). Its catch is intentionally non-logging — a missing `options` getter is the expected non-Drift path, and `false` is the correct default — with an inline `// ignore: require_catch_logging` rationale.
- The flag is read once in `_deriveDeclaredSchema` and threaded through `_declaredTableFrom` into `_declaredSqlType`, so it is computed per derivation rather than per column.

`driftType` is unaffected: `_declaredDriftType` still reports the `dateTime` semantic token, so the semantic distinction the INTEGER affinity hides is preserved.

### Class B — autoincrement PK flagged nullable (`assets/web/schema-divergence.ts`)

`compareColumns` compared declared nullability against `PRAGMA table_info.notnull`, which SQLite always reports as `0` for a single-column `INTEGER PRIMARY KEY` (rowid alias) even though the column cannot hold NULL — firing a `nullable-mismatch` on every autoincrement PK.

Changes:

- `compareColumns` computes `declaredPkCount` once per table.
- The nullable check is skipped when a column is a rowid alias: `dc.isPk === true && declaredPkCount === 1 && typeAffinity(dc.sqlType) === 'INTEGER'`. The single-column and INTEGER-affinity conditions confine the suppression to true rowid aliases, so composite PKs and non-integer single PKs still report genuine nullability drift.

### Tests

- `assets/web/test/schema-divergence.test.mjs`: added three cases — rowid INTEGER PK no longer flagged; non-INTEGER (TEXT) single PK still flagged; composite INTEGER PK member still flagged. Suite: 12 passing.
- `test/start_drift_viewer_extension_test.dart`: added a duck-typed fake Drift database (`allTables`/`$columns`/`$primaryKey`/`options`) and two cases asserting DateTime derives `INTEGER` under default storage and `TEXT` when `storeDateTimeAsText` is set, both keeping `driftType: dateTime`. Suite: 5 passing.

### Verification

- `node --test assets/web/test/schema-divergence.test.mjs` → 12 pass / 0 fail.
- `dart test test/start_drift_viewer_extension_test.dart` → 5 pass / 0 fail.
- IDE analyzer diagnostics clean on both changed source files after edits.

`CHANGELOG.md` gained an `[Unreleased]` section with two user-facing `Fixed` entries.
