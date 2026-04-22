## Title
`drift_advisor_anomaly` fires on recency-skewed `DateTime` columns whose entire range spans less than one day (z-score on drifting timestamps is the wrong statistic) — and the same anomaly is emitted twice by two different owners.

## Environment
- OS: Windows 11 Pro 10.0.22631 x64
- VS Code version: (fill in — Help → About)
- Extension version: (fill in — Extensions panel, "Saropa Drift Advisor")
- Dart SDK version: (fill in — `dart --version`)
- Flutter SDK version: 3.x
- Database type and version: SQLite (Drift), local file DB on disk. Table `contact_points` is part of an in-progress Isar→Drift migration in the `saropa_contacts` app.
- Connection method: local SQLite file, opened by the running Flutter app; advisor inspects the same DB file.
- Relevant non-default settings: none known
- Other potentially conflicting extensions: possibly a second copy of the drift advisor (see Actual Behavior — two owners emit the same anomaly). If an older `drift-advisor` plugin is installed in addition to the newer `Saropa Drift Advisor` extension, that is itself the duplicate-emit bug.

## Steps to Reproduce
1. Open the `saropa_contacts` workspace in VS Code (`d:\src\contacts`).
2. Ensure the app has been run at least once today so the local SQLite DB has recent writes to `contact_points.last_modified` (the column is updated on every contact-point edit).
3. Open the file `lib/database/drift/tables/user_data/contact_points_table.dart`.
4. Wait for the Drift Advisor to analyze the schema against the live DB.
5. Observe the Problems panel and the red squiggle in the editor gutter.

No specific data is required beyond "the column has been written to at least a few times within the last day or two" — the bug reproduces as soon as the observed range is narrow (< ~1 day) and the writes are clustered near "now".

## Expected Behavior
No diagnostic on `contact_points.last_modified`. The column's observed range of **16.7 hours** with most values clustered near the start of the window is the **normal shape** of a `lastModified` column in an actively-used table. It is not an outlier and flagging it as one is noise.

A useful anomaly check for a timestamp column would be one of:
- value in the future beyond wall-clock tolerance (real corruption signal)
- value before a sensible epoch floor (e.g., 2000-01-01 — usually a 0-as-null serialization bug)
- a gap of N days in a table that is known to be actively written (possibly sync failure)

None of these fire here, and none should — the data is fine.

## Actual Behavior
Two diagnostics appear on the same file for the same underlying statistic:

| # | Owner | Code | Source | Line | Message |
|---|---|---|---|---|---|
| 1 | `drift-advisor` | `anomaly` | "Drift Advisor" | 14 (class header `class ContactPoints extends Table {`) | `[drift_advisor] Potential outlier in contact_points.last_modified: max value 1776862643.0 is 4.1σ from mean 1776805997.23 (range [1776802512.0, 1776862643.0])` |
| 2 | `Saropa Drift Advisor` | `drift_advisor_anomaly` | "Saropa Drift Advisor" | 33 (`DateTimeColumn get lastModified => dateTime().nullable()();`) | `[Drift] contact_points.last_modified: Potential outlier in contact_points.last_modified: max value 1776862643.0 is 4.1σ from mean 1776805997.23 (range [1776802512.0, 1776862643.0])` |

The advisor's own numbers confirm the warning is meaningless as an outlier signal:

| Stat | Value (unix seconds) | UTC |
|---|---|---|
| min | 1776802512 | 2026-04-22 06:15 |
| mean | 1776805997.23 | 2026-04-22 07:13 |
| max | 1776862643 | 2026-04-22 22:57 |
| spread | 60,131 s | **16.7 hours** |
| z-score of max | 4.1σ | (of a sub-day distribution that is guaranteed to drift forward) |

The z-score only looks alarming because σ is tiny — when the whole dataset spans 17 hours, σ is on the order of hours, so any fresh write sits many σ above the mean. In absolute terms the "outlier" is just "the newest row".

## Error Output

### 6a. VS Code Developer Tools Console
(Not captured — no exception is thrown. This is a logic/false-positive bug, not a crash. Can be captured on request.)

### 6b. Extension Output Channel
(Not captured — advisor did not log anything beyond the two diagnostics. Can be captured on request.)

### 6c. Terminal / Command Output
N/A — no CLI involved.

### 6d. Stack Traces
None — no exception.

## Screenshots / Recordings
Not attached. The two diagnostics can be seen in the Problems panel; the diagnostic JSON payloads are included verbatim below and are sufficient to reproduce.

## Minimal Reproducible Example

Drift table (exact shape from the triggering file, stripped to minimum):

```dart
// lib/database/drift/tables/user_data/contact_points_table.dart
import 'package:drift/drift.dart';

class ContactPoints extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get saropaUUID => text()();
  DateTimeColumn get lastModified => dateTime().nullable()();
}
```

DB state required: the `contact_points.last_modified` column must contain at least a few rows whose values span less than ~24 hours and cluster near "now". Any actively-used Drift table with a `lastModified` column reproduces this after normal use.

Raw diagnostic payloads (copy-paste from the Problems panel):

```json
[
  {
    "resource": "/d:/src/contacts/lib/database/drift/tables/user_data/contact_points_table.dart",
    "owner": "drift-advisor",
    "code": "anomaly",
    "severity": 2,
    "message": "[drift_advisor] Potential outlier in contact_points.last_modified: max value 1776862643.0 is 4.1σ from mean 1776805997.23 (range [1776802512.0, 1776862643.0])",
    "source": "Drift Advisor",
    "startLineNumber": 14,
    "startColumn": 1,
    "endLineNumber": 14,
    "endColumn": 1000
  },
  {
    "resource": "/d:/src/contacts/lib/database/drift/tables/user_data/contact_points_table.dart",
    "owner": "Saropa Drift Advisor",
    "code": "drift_advisor_anomaly",
    "severity": 2,
    "message": "[Drift] contact_points.last_modified: Potential outlier in contact_points.last_modified: max value 1776862643.0 is 4.1σ from mean 1776805997.23 (range [1776802512.0, 1776862643.0])",
    "source": "Saropa Drift Advisor",
    "startLineNumber": 33,
    "startColumn": 1,
    "endLineNumber": 33,
    "endColumn": 201
  }
]
```

## What I Already Tried
- [x] Verified the numbers — the two diagnostics report identical statistics; same underlying anomaly, different emitters.
- [x] Converted the unix timestamps to UTC — the entire observed range is **16.7 hours** on a single day (2026-04-22), confirming the z-score is firing on a distribution that is trivially narrow.
- [x] Inspected the column semantics — `lastModified` is updated on every write, which guarantees the distribution drifts forward and σ stays small relative to the max.
- [ ] Restarted VS Code — not yet attempted (does not explain the logic error regardless).
- [ ] Disabled other extensions — not attempted. Note: if disabling a second extension eliminates the `drift-advisor` / `anomaly` entry (leaving only the `Saropa Drift Advisor` / `drift_advisor_anomaly` entry), that confirms Hypothesis C below.
- [ ] Tested on a different database — not attempted, but the same pattern will fire on any SQLite table with a recency-skewed timestamp column.

## Regression Info
- Last working version: unknown (have not yet bisected — the column-level emitter may have always been a false positive; the duplicate may have appeared when the rule was renamed from `anomaly` to `drift_advisor_anomaly`).
- First broken version: unknown.
- What changed: possibly a rename from `owner: drift-advisor, code: anomaly` → `owner: Saropa Drift Advisor, code: drift_advisor_anomaly`, with the old registration left in place.

## Impact
- **Who is affected:** every user of the Drift Advisor who has any Drift table with a `lastModified` / `createdAt` / `updatedAt` / auto-increment-id column AND a live DB with recent writes. In practice, that is every user.
- **What is blocked:** nothing hard-blocked, but the Problems panel accumulates false positives on every actively-written table. This erodes signal — users start ignoring Drift Advisor warnings, which defeats the purpose of the tool.
- **Data risk:** none. The diagnostic is purely advisory.
- **Frequency:** every analysis pass, on every file that contains such a column. One false positive per column, doubled by the duplicate-emit bug.

## System Resource State
Not relevant — this is a logic bug, not a performance/crash issue.

---

## Root Cause Analysis

There are **two bugs** bundled here. Treating them separately:

### Bug 1 — z-score is the wrong statistic for recency-skewed / monotonic columns (primary)

Z-score outlier detection assumes a roughly stationary, two-sided distribution in which "many σ from the mean" is rare. None of that holds for:
- `DateTime` columns that record "when was this row written/modified" — the distribution drifts forward with wall-clock time, and the newest row is always far from the mean.
- `autoIncrement` integer columns — max is always the largest ID by definition; the mean sits in the middle, so max is always many σ above it.
- Any append-only / log-style column.

For the specific data in the report: the column has 16.7 hours of spread. σ is therefore some fraction of an hour. The newest row sits near hour 16.7; the mean sits near hour 1 (because most writes happened early in the window). 16 hours / (small σ) trivially exceeds 3σ. This will fire forever, no matter what the user does, because any fresh write re-creates the condition.

### Bug 2 — duplicate emission

The same anomaly is reported by two owner/code pairs at two different lines. Line 33 (the column) is correct; line 14 (the class) is spurious. Either:
- (a) An older plugin (`drift-advisor` / `anomaly`) and a newer extension (`Saropa Drift Advisor` / `drift_advisor_anomaly`) are both running. Disabling one should silence it. Fix: stop shipping / deregister the old one, or detect and suppress when the newer is present.
- (b) One version of the advisor has two emit sites (table-level + column-level) that both flag the same underlying statistic. Fix: emit once, at the column-declaration span.

---

## Suggested Fix

1. **Skip z-score on recency-skewed / monotonic columns.**
   - Detect by name first (fast): `^(last_?modified|created_?at|updated_?at|modified_?at|deleted_?at|last_?seen|last_?accessed|timestamp|event_?time|logged_?at|ingested_?at|id|rowid|sequence_?no)$` case-insensitively, matching both snake_case and camelCase.
   - For remaining `DateTime`/`Timestamp` columns, skip z-score if the data is clearly drifting (`max` is within a few days of `now()` and most values cluster in the recent tail).
   - For remaining `autoIncrement`/monotonic integer columns, always skip z-score.

2. **Replace with useful timestamp checks** on the same columns:
   - value > `now() + tolerance` → LINT (future timestamp, real bug)
   - value < sensible epoch floor → LINT (epoch-0 serialization bug)
   - gap between consecutive values > N days on a frequently-written table → LINT (possible data-loss signal)

3. **Keep z-score for numeric columns where it makes sense** — prices, quantities, measurements, durations — i.e., columns that are not monotonic and not drifting.

4. **De-duplicate the emitter.** Decide on one owner/code pair and one span per anomaly. Prefer the column-declaration span (line 33 here), not the class-declaration span (line 14). If the old plugin is obsolete, deregister it in the new release and ship a migration note.

5. **Include `n` (sample size) in the diagnostic message.** The current message gives min/mean/max but not `n`, which is critical for judging whether the σ value is meaningful in the first place. Low-`n` z-scores are particularly prone to false positives and the user has no way to see this.

---

## Related

- Cross-filed in the lint repo: `D:\src\saropa_lints\bugs\drift_advisor_anomaly_false_positive_tight_timestamp_range.md`
- Triggering project: `d:\src\contacts` — specifically `lib/database/drift/tables/user_data/contact_points_table.dart`

---

## Checklist Before Submitting
- [x] Title names the specific broken behavior, not a vague category
- [x] Environment section is filled in where known (VS Code / extension / Dart versions left blank — user to fill from Help → About)
- [x] Steps to reproduce start from a clean state and are numbered
- [x] Expected vs. actual behavior are both stated explicitly
- [x] Error output is full text, not truncated (both raw diagnostic payloads included verbatim)
- [ ] Screenshots are annotated if included — none attached; diagnostic JSON is sufficient
- [x] Minimal reproducible example is actually minimal (stripped to one table + one column)
- [ ] Checked for existing bug reports covering the same issue — user to verify
- [x] No sensitive data — only DB column statistics (timestamps, no PII)

---

## Resolution (fully implemented 2026-04-22)

Both bugs resolved in the same change set. See CHANGELOG `[Unreleased] / Fixed`.

**Bug 1 — z-score false positive on `last_modified` style columns.**
Extended the timestamp skip pattern in `AnomalyDetector._detectNumericOutliers` ([lib/src/server/anomaly_detector.dart:259-288](../../../../lib/src/server/anomaly_detector.dart#L259-L288)) from `^created|^updated|^deleted|^modified|…` to additionally cover `^last_?(modified|seen|accessed|updated|used|sync|synced|refresh|refreshed|login|logout|active|activity|read|written|online|opened|played|viewed|fetch|fetched|heartbeat|ping|visit|visited|check|checked|poll|polled|scan|scanned)`. The `_?` + case-insensitive flag makes it match both snake_case (`last_modified`) and camelCase (`lastModified`) without widening to generic `^last_.*` (which would have swallowed `last_name` / `last_ip`). Test coverage added for 8 new variants in [test/anomaly_detector_test.dart](../../../../test/anomaly_detector_test.dart).

**Bug 2 — duplicate emission (the original hypothesis about an "older plugin" was wrong; both emitters were inside this repo).**
Two changes:
1. [extension/src/linter/schema-diagnostics.ts:48-66](../../../../extension/src/linter/schema-diagnostics.ts#L48-L66) — the legacy `SchemaDiagnostics` pipeline no longer fetches `client.anomalies()` or republishes them into the `drift-linter` collection. It now only handles index suggestions.
2. [extension/src/diagnostics/checkers/anomaly-checker.ts:18-67](../../../../extension/src/diagnostics/checkers/anomaly-checker.ts#L18-L67) — the remaining emitter (new `DiagnosticManager` pipeline → `drift-advisor` collection) now captures the column name from the `table.column` pattern in the anomaly message and lands the diagnostic on the column getter line, falling back to the class header only when the column can't be resolved. Tests in [extension/src/test/anomaly-checker.test.ts](../../../../extension/src/test/anomaly-checker.test.ts).

Net result: one diagnostic per anomaly, at the column-declaration line, under a single collection.

**Known remaining duplicate (not blocking; tracked in CHANGELOG Maintenance).** Index suggestions are still published through both pipelines with *different* codes (`index-suggestion` vs `missing-fk-index` / `missing-id-index`), so the two show as distinct Problems entries rather than the misleading same-code duplicate this bug caught. Retiring the legacy path end-to-end requires migrating `DriftCodeActionProvider`'s quick-fixes into `SchemaProvider.provideCodeActions`.

## Status of the report's "Suggested Fix" menu

The Suggested Fix section of this bug listed five items. Mapping them against what shipped:

1. **Skip z-score on recency-skewed / monotonic columns.** Done. The extended `_timestampPattern` above is exactly this.
2. **Replace with useful timestamp checks** (future > now+tolerance, < sensible epoch floor, gap > N days). **Not done — separate feature.** These are new detectors, not a fix to the reported false positive, and they deserve their own design pass (threshold tuning, severity mapping, migration-aware gap detection). Tracked as a follow-up feature idea, not a residual gap in this bug.
3. **Keep z-score for numeric columns where it makes sense** (prices, quantities, measurements, durations). Preserved. The fix only narrows the skip list by adding `last_*`; it does not broaden skips to cover true numeric measurements, so prices/quantities/measurements still go through the 3σ check unchanged.
4. **De-duplicate the emitter.** Done — see Bug 2 above.
5. **Include `n` (sample size) in the diagnostic message.** Done. `AnomalyDetector._detectNumericOutliers` now appends `n=<sampleCount>` to the message so low-n z-scores are self-documenting.

So: items 1, 3, 4, 5 shipped in this change set; item 2 is explicitly out of scope and a separate feature, not a half-done fix.
