# Numeric outlier detection: stable variance + correct log-scale check (audit M2)

The numeric-outlier anomaly check computed column variance in SQL as `AVG(x*x) - AVG(x)*AVG(x)` (the naive one-pass form). For a large-magnitude, low-spread column those two terms are enormous and nearly equal, so their difference loses most significant bits to floating-point cancellation — yielding a meaningless σ that either rounded to zero (suppressing real outliers) or came out tiny (flagging normal values). Separately, the log-scale fallback that suppressed flags on wide log-normal columns was circular: with only `min`, `max`, and the arithmetic mean it derived a log σ from the range itself and centered on `log(mean)`, so the extremes — which *are* the range — almost always passed, suppressing nearly everything.

## Finish Report (2026-06-13)

This work will be reviewed by another AI. — (chat-time note; not part of the durable record.)

### Scope

(A) Dart package code (`lib/`) + Dart test. No extension/Flutter/docs beyond the changelog.

### What changed

- **`lib/src/server/anomaly_detector.dart`** (`_detectNumericOutliers`) —
  - The single combined stats query now returns only mean/min/max/count. A SECOND query computes the population variance as `AVG((x - mean)*(x - mean))`, with the first-pass mean interpolated as a numeric literal. This two-pass form is numerically stable where the one-pass form cancelled.
  - The circular range-based log fallback is replaced by `_passesLogScaleCheck`, which computes the real mean and variance of `LN(x)` in SQL and applies the 3σ test in log space around the geometric mean. SQLite exposes `LN` only when built with math functions; the helper is wrapped in try/catch and returns `false` (do not suppress — report the outlier) when `LN` is unavailable, rather than swallowing the gap silently.

### Design notes

- The variance mean is interpolated as a Dart `double` literal — a number, so no injection surface; SQLite accepts the scientific-notation form `double.toString()` can emit.
- The naive `E[Y²]-E[Y]²` form is retained INSIDE the log helper because log-transformed values are small-magnitude, where cancellation is not a concern — only the raw column suffered it.
- Identifiers are quoted once into locals (`col`, `tbl`) via `ServerUtils.quoteIdent` and reused across the three queries.

### Verification

- `dart analyze lib/` — no issues (two intentional lint ignores carry rationales: squaring the mean; the expected no-`LN` capability gap).
- `test/anomaly_detector_test.dart` updated: the mock now answers the second-pass variance query and the `LN` log-stats query (returning supplied `log_mean`/`log_sqmean`, or no row to simulate a build without math functions). The log-normal suppression test now exercises the corrected log computation; the linear outlier-detection and zero-σ tests pass unchanged. Full anomaly suite (43) plus report/issues suites pass.

### Outstanding

None. End-to-end numerical validation of the cancellation fix is inherently a SQL-engine concern (the mock supplies variance directly); the fix is the query shape, which the suite now exercises.
