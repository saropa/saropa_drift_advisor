# False Positive: Anomaly Detections on Valid Real-World Data

**Created**: 2026-04-05
**Status**: FIXED
**Severity**: Low (informational noise)
**Diagnostic code**: `anomaly`

## Summary

The anomaly detector flags statistical outliers in numeric columns, but produces false positives on real-world data where wide value ranges are expected. Seven of seven anomaly warnings reviewed were false positives.

## Fix Applied

All seven false positives are now prevented by three changes in `anomaly_detector.dart`:

1. **Name-based heuristics** — new column name patterns skip outlier detection for:
   - Timestamp columns (`created_at`, `updated_at`, `*_date`, `*_time`, `*_timestamp`) → fixes cases 5, 7
   - Sort/order columns (`sort_order`, `position`, `rank`, `*_order`, `*_position`) → fixes case 3
   - Year/founded columns (`year`, `*_year`, `founded*`) → fixes cases 1, 2

2. **Log-scale fallback** — for all-positive columns that fail the linear 3σ check, a log-transformed 3σ check is applied. Distributions spanning orders of magnitude (exchange rates, engagement scores) pass on the log scale → fixes cases 4, 6

3. **Improved messages** — outlier messages now identify which end (min/max) is the outlier and by how many σ, instead of just showing the range

## Affected Tables and Why They Are False Positives

### 1. `country_banks.founded` — range [1472, 2019], avg 1956.01

**Why it's valid**: Banca Monte dei Paschi di Siena (Italy) was founded in 1472 and is the oldest surviving bank in the world. The `founded` column legitimately spans 500+ years.

### 2. `country_news_media.founded_year` — range [1749, 2020], avg 1964.44

**Why it's valid**: Berlingske (Denmark, 1749) and other centuries-old newspapers exist. A 270-year range is expected for a dataset of international news media organizations.

### 3. `emergency_services.sort_order` — range [0, 1251], avg 14.12

**Why it's valid**: Sort order columns routinely use large values to push items to the end of a list or reserve gaps for future insertion. A max of 1251 with most values clustered low is a normal distribution for display ordering.

### 4. `currency_rates.exchange_rate` — range [0.706, 16801.0], avg 581.30

**Why it's valid**: Currency exchange rates against a base currency (e.g., USD) naturally span several orders of magnitude. The Vietnamese Dong (~25,000 VND/USD), Indonesian Rupiah (~15,500 IDR/USD), and similar currencies produce rates in the thousands, while GBP/EUR are below 1.0. This is fundamental to how currency works.

### 5. `calendar_events.created_at` — range [1735691375, 1767237956], avg 1738480941.76

**Why it's valid**: These are Unix timestamps. The range translates to approximately Jan 2025 to Jan 2026 — a normal span for user-created calendar events over a year of app usage.

### 6. `contact_points.points` — range [4, 337], avg 80.61

**Why it's valid**: Contact engagement points accumulate over time. Power users or frequently-contacted entries naturally score much higher than newly-added contacts. A long-tail distribution is expected.

### 7. `organizations.created_at` — range [1772125900, 1774707629], avg 1772368534.61

**Why it's valid**: Unix timestamps spanning roughly 2 months (late 2026). Normal for a batch of organization records created during active app usage.

## Root Cause

The anomaly detector used a simple 3σ threshold without domain awareness. It had no way to know that:

- Historical `founded` years legitimately span centuries
- Currency exchange rates span 5 orders of magnitude
- Sort-order columns use intentional large gaps
- Unix timestamps within a year are not outliers
- Engagement scores follow power-law distributions

## Future Improvement

**Per-column anomaly suppression** via annotation or config is not yet implemented. If additional false positives arise that cannot be addressed by name patterns or log-scale detection, consider adding:
```yaml
drift_advisor:
  suppress_anomaly:
    - table_name.column_name
```
