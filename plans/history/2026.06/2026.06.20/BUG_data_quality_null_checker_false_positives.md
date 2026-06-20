# Bug Report: data-quality null checker fires `high-null-rate` / `unused-column` on unrepresentative live data and on null-by-design columns

## Title

The data-quality null checker (`high-null-rate`, `unused-column`) emits two large classes of false positives when run against a Flutter app's **live debug database**: (1) tables that are only partially populated in the debug session (demo/user data, or static tables not yet fully loaded), and (2) columns that are null-by-design (event timestamps, phonetic helpers, pre-generated linking columns, default-bearing columns).

In one real run against Saropa Contacts this produced **221 findings (86 `high-null-rate` + 134 `unused-column` + 1 `anomaly`)**, of which roughly **210 are false positives** and only ~11 point at genuine missing content.

---

## Environment

| Field | Value |
|---|---|
| OS | Windows 11 Pro 10.0.22631 x64 |
| VS Code version | not captured (engine requirement: `^1.115.0`) |
| Extension | `drift-viewer` **4.1.3** |
| Extension commit (report `commitSha`) | `16b9d157204b47e69b68b22de5b42ffd433b47f0` |
| Target project under analysis | Saropa Contacts (`D:\src\contacts`) — Flutter / Drift |
| Database | SQLite (Drift), **live debug VM connection** at `http://127.0.0.1:8642` |
| Report generatedAt | 2026-06-18T18:22:21Z |
| Relevant settings | defaults — no `tableExclusions` / `columnExclusions` configured |

---

## Steps to Reproduce

1. Launch Saropa Contacts in debug mode (its DB seeds demo/user rows and lazily loads static reference tables on demand).
2. Let the drift-viewer data-quality diagnostics run against the live debug connection.
3. Inspect the emitted `high-null-rate` and `unused-column` diagnostics (or the exported `*_contacts.drift-advisor.json` report / the `bugs/issues_drift_advisor.log` of flagged columns).

---

## Expected Behavior

A null-rate / unused-column rule should only fire where a high null rate reflects the **source data**, i.e. against a representative, fully-populated dataset, and should not fire on columns that are null-by-design.

---

## Actual Behavior

The checker fires on every column over the 50% null threshold regardless of whether the measured table is representative, because it reads the live debug DB (`data-quality-provider.ts:160` comment: "the live debug connection"). The only guards are `MIN_ROWS_FOR_ANALYSIS = 10` (too low — a 339-row demo table passes) and `MAX_ROWS_FOR_NULL_SCAN = 100_000`. There is no representativeness check and no null-by-design exclusion.

### Evidence — two distinct FP classes

**FP-1: Measured dataset is not representative (~120 of 221 findings).**

The live debug DB is partial. Verified row counts (live DB vs full source):

| Table | Live rows | Full source rows | Note |
|---|---|---|---|
| `you_tube_api_cache` | 1 | runtime cache | every column flagged 100% null — meaningless on 1 row |
| `contacts` | 339 | user/demo only | dozens of optional columns flagged 100% null |
| `contact_groups`, `organizations`, `family_groups`, `calendar_events` | 46 / 103 / 223 / 188 | user/demo only | sparse by nature in a debug session |
| `emergency_services` | **61** | **899** | static table only partially loaded → null rates computed on 7% of rows |
| `country_cities` | 246 | (full source larger) | partially loaded |

Null rates computed on a partially-loaded table say nothing about the source data. ~94 findings are on user-data tables alone; the partially-loaded static tables add the rest.

**FP-2: Null-by-design columns (~13 findings).**

These columns are *correct* to be mostly/entirely null:

- **Event** timestamps `favorite_at`, `emergency_at`, `hidden_at`, `blocked_at`, `follow_up_at` — null means "the event has not happened." (NOTE: `created_at` / `updated_at` are NOT in this set — see below.)
- `*_phonetic` search-helper columns — populated only when a phonetic variant exists.
- Pre-generated static linking columns (`relationships_json`, `contact_saropa_uuid`) — set only when a static character is materialized as a companion contact.
- Default-bearing columns (`version`, `sort_order`) declared with `withDefault(...)`.

**NOT a false positive — `created_at` / `updated_at` nulls are a real consumer-side bug.**
A null `created_at` is never correct. In Saropa Contacts these columns are `dateTime().nullable()` with no DB default, and the insert path (`_toCompanionInsert`) passes `Value<DateTime?>(model.createdAt)` straight through — for a newly-created row the model's `createdAt` is null, so the row persists with null. The checker is *correctly* surfacing this (`contact_groups.created_at` 100% null, `calendar_events.created_at` 81% null). It is a consumer bug to fix in Saropa Contacts, not an advisor FP — do not suppress it. Any exclusion rule shipped for FP-2 must match on the *event* timestamp names only, never a blanket `*_at`.

### The checker IS correct when the data is representative

This is important so the fix stays targeted: against fully-loaded static tables the rule surfaced **genuine** content gaps and should keep doing so. Verified examples (live count == full source count):

- `public_figures` (746/746): `birth_date_json` 99% null, `description` 99% null, `keywords` 88% null — real, source genuinely lacks the data.
- `harry_potter_characters.urls` 97% null — real source gap.

So the fix must suppress FP-1/FP-2 **without** silencing these true positives.

---

## Error Output

No exception — diagnostics are emitted as designed; the defect is over-emission. Sample messages:

```
[drift_advisor] Column "you_tube_api_cache.contact_saropa_u_u_i_d" has 100% NULL values        (high-null-rate)
[drift_advisor] Column "contacts.blocked_at" is 100% NULL — no row sets a value (unused column) (unused-column)
[drift_advisor] Column "emergency_services.phones" has 79% NULL values                          (high-null-rate)
```

---

## Emitter Attribution

Both codes are TypeScript-only. No Dart (`lib/src/`) emit path exists.

**(owner, code) = (drift-advisor, high-null-rate)**
- owner: `drift-advisor`
- code: `high-null-rate`
- source: `Drift Advisor`
- Registered at: `extension/src/diagnostics/codes/data-quality-codes.ts:9-10`
- Emit site: `extension/src/diagnostics/providers/data-quality-provider.ts:204` (inside `_checkHighNullRates`, threshold `HIGH_NULL_RATE_THRESHOLD = 50` at `:13`; row guards `MIN_ROWS_FOR_ANALYSIS = 10` at `:19`, `MAX_ROWS_FOR_NULL_SCAN = 100_000` at `:30`)
- Grep used: `grep -rn "high-null-rate" lib/src/ extension/src/`
- Dart-tree negative grep: `grep -rn "high-null-rate|unused-column" lib/src/` → **0 matches**

**(owner, code) = (drift-advisor, unused-column)**
- owner: `drift-advisor`
- code: `unused-column`
- source: `Drift Advisor`
- Registered at: `extension/src/diagnostics/codes/data-quality-codes.ts:20-21`
- Emit site: `extension/src/diagnostics/providers/data-quality-provider.ts:196` (same `_checkHighNullRates` loop; split from `high-null-rate` when `nullCount >= table.rowCount`, `:191`)
- Grep used: `grep -rn "unused-column" lib/src/ extension/src/`
- Dart-tree negative grep: included above → **0 matches in `lib/src/`**

Both codes emit from the single method `_checkHighNullRates` in `data-quality-provider.ts`; one fix site covers both.

---

## Minimal Reproducible Example

Any Drift schema where a nullable column is null-by-design, measured on a small live table:

```sql
CREATE TABLE contacts (id INTEGER PRIMARY KEY, blocked_at INTEGER NULL);
-- Insert 50 demo rows, none blocked (blocked_at NULL by design).
-- Result: unused-column fires on contacts.blocked_at, though 100% NULL is correct.
```

---

## What I Already Tried

- Inline `// drift-advisor:ignore high-null-rate` markers (the supported suppression) — works per column but does **not scale** to ~210 FPs; it also permanently buries the signal if the table later loads fully.
- File-level `// drift-advisor:ignore-file high-null-rate` (already used on `contact_table.dart`) — blunt; silences true positives on the same table.
- Confirmed the existing config knobs `tableExclusions` and `columnExclusions` (`diagnostic-config.ts:53-72`) can suppress these, but require hand-maintaining a large per-column list in every consuming project.

---

## Proposed Fix (maintainer's call)

Both fixes live in `_checkHighNullRates` (`data-quality-provider.ts`) and/or its config, extending the existing `tableExclusions` / `columnExclusions` mechanism rather than adding a new one.

**For FP-1 (representativeness):** add a guard before computing null rates so the rule only runs on a representative dataset. Options:
1. Classify tables as "reference/static" vs "runtime/user" (e.g. via a configurable `userDataTables` list, or by detecting Drift tables seeded from the static bundle) and skip null-rate on runtime/user tables.
2. Compare the live `rowCount` against the table's expected/full population and skip when the live table is far below full load (catches partially-loaded static tables like `emergency_services` 61/899). `MIN_ROWS_FOR_ANALYSIS = 10` is far too low to act as this guard.

**For FP-2 (null-by-design):** ship a default exclusion for null-by-design columns, by name pattern and/or declaration:
- name patterns: `*_at`, `*_phonetic`, and the linking columns `relationships_json` / `contact_saropa_uuid`;
- declaration: columns declared `withDefault(...)` or `autoIncrement()` (their null/default is intentional).

Keeping the rule active on fully-loaded static reference tables preserves the true positives (`public_figures`, `harry_potter.urls`) the checker correctly surfaced.

---

## Impact

- **Who:** every project running drift-viewer data-quality diagnostics against a live debug app DB.
- **What is blocked:** signal-to-noise. ~210 of 221 findings were noise, burying the ~11 real content gaps; consumers are pushed toward blanket file-level ignores that then hide real regressions.
- **Data risk:** none directly, but the noise indirectly risks real data-quality gaps going unnoticed.
- **Frequency:** every run, deterministic.
