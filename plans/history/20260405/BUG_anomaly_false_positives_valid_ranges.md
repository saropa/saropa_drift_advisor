# BUG: Anomaly detector flags valid real-world data ranges as outliers

**Date:** 2026-04-05
**Severity:** Medium
**Component:** Diagnostics / Anomaly detection
**Code:** `anomaly`
**Affects:** Any table with columns whose valid domain spans a wide numeric range

---

## Summary

The anomaly checker flags columns as having "potential outliers" when the data range is wide, without accounting for the domain semantics of the data. This produces false positives on columns where a wide range is expected and correct.

## Observed false positives

### 1. Currency exchange rates

| Code | Message |
|------|---------|
| `anomaly` | Potential outlier in currency_rates.exchange_rate: range [0.70581, 16801.0], avg 581.30 |

**Why this is valid:** Exchange rates between world currencies legitimately span several orders of magnitude. For example, 1 USD = 0.92 EUR (~0.7 at the low end) while 1 USD = 16,000+ IDR (Indonesian Rupiah) or VND (Vietnamese Dong). The range [0.7, 16801] is entirely normal for a table caching multi-currency exchange rates from an API like Frankfurter.

### 2. City longitude coordinates

| Code | Message |
|------|---------|
| `anomaly` | Potential outlier in country_cities.longitude: range [-175.2, 179.216667], avg 13.20 |

**Why this is valid:** Valid longitude values on Earth range from -180.0 to +180.0. A cities table covering the full globe will naturally span nearly this entire range. Cities in the Pacific Islands (e.g., Apia, Samoa at -171.8) and eastern Russia/Fiji (e.g., Suva at 178.4) are real places, not outliers. The average of ~13 (roughly Central Europe) simply reflects the geographic distribution of populated cities, not a problem with the data.

### 3. Contact version field

| Code | Message |
|------|---------|
| `anomaly` | Potential outlier in contacts.version: range [1.0, 26010901.0], avg 74744.97 |

**Why this is valid:** The `version` column uses date-based versioning in YYYYMMDD format (e.g., 26010901 = 2026-01-09 revision 01). Records created before this convention was adopted have version = 1 (the default). Both extremes are intentional and correct.

## Root cause

The anomaly detector appears to use a simple statistical approach (likely based on standard deviations from mean, or IQR-based outlier detection) without any domain awareness. It treats every numeric column identically, regardless of whether the column represents:

- Geographic coordinates (fixed domain: lat -90..90, lon -180..180)
- Currency rates (legitimately span 4+ orders of magnitude across world currencies)
- Date-encoded integers (YYYYMMDD format creates large values by design)

## Expected behavior

No `anomaly` diagnostic should fire when the data falls within the column's valid domain. At minimum:

1. **Column name heuristics:** Columns named `latitude`, `longitude`, `lat`, `lng`, `lon` should not be flagged for ranges within [-180, 180] / [-90, 90]
2. **Column type awareness:** `REAL` columns with a defined range (e.g., exchange rates) naturally have wide distributions — a high range-to-mean ratio is not inherently suspicious
3. **Suppression option:** Allow users to annotate columns or configure known-valid ranges per table to suppress false positives

## Suggested fixes

### Option A: Domain-aware heuristics

```typescript
// Skip anomaly checks on coordinate columns
const COORDINATE_PATTERNS = /^(lat|lng|lon|latitude|longitude)$/i;
if (COORDINATE_PATTERNS.test(columnName)) {
  return; // Geographic data — wide range is expected
}
```

### Option B: Configurable thresholds per column

Allow a configuration file or inline annotation to declare expected ranges:

```yaml
# .saropa/drift_advisor.yaml
anomaly_suppression:
  currency_rates.exchange_rate: skip  # Multi-currency rates
  country_cities.longitude: skip      # Global coordinates
  contacts.version: skip              # Date-based versioning
```

### Option C: Order-of-magnitude guard

Only flag anomalies when outlier values are truly unexpected relative to the data distribution, not merely because the range is wide. A column with 1000+ rows spanning a smooth distribution across [0.7, 16801] is not anomalous — it just has high variance.

## Reproduction steps

1. Open a Drift project with a currency exchange rate table containing rates for multiple currency pairs (e.g., EUR/USD, USD/VND, USD/IDR)
2. Open a table with global city coordinates spanning all continents
3. Open a table with date-based version integers (YYYYMMDD format)
4. Observe `anomaly` warnings on all three columns despite valid data

## Impact

- **Noise:** Three false positives in the Problems panel per project, training developers to ignore anomaly warnings
- **Cry-wolf effect:** If real anomalies are ever detected, they will be lost among the false positives
- **No actionable fix:** The developer cannot "fix" valid data, so the warnings persist indefinitely

## Files likely involved

| File | Role |
|------|------|
| `extension/src/diagnostics/checkers/anomaly-checker.ts` (or equivalent) | Statistical outlier detection logic |
| `extension/src/diagnostics/codes/` | Defines the `anomaly` diagnostic code |
