## Title

Outlier detector flags dimensional columns (byte_size, width, height) and physical measurement columns (weight_kilograms) as false positives

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: current
- Extension version: current
- Dart SDK version: current
- Database type and version: SQLite (Drift)
- Connection method: local (Drift debug server at 127.0.0.1:8642)
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

## Steps to Reproduce

1. Open the contacts project in VS Code with the Drift Advisor connected.
2. Run the anomaly scan (or open the web viewer).
3. Observe four INFO-level outlier findings in the server output.

## Expected Behavior

These columns should be skipped by the outlier detector because their wide ranges are expected by nature:

- `image_blur_metas.byte_size` — records the remote source image's byte length. Most rows are small thumbnails (~4 KB); a few are full-resolution source images (~148 KB). The bimodal distribution is by design (thumbnails vs originals), not a defect.
- `image_blur_metas.width` / `height` — same cause. Thumbnails are ~114 px; originals are up to 1200x683 px.
- `star_trek_characters.weight_kilograms` — a physical measurement of fictional characters. 110 kg (Worf) is canon; the 3.2-sigma flag is an artifact of a small, non-Gaussian population (n=149).

## Actual Behavior

Four `potential_outlier` anomalies are emitted:

```
[i] INFO Potential outlier in image_blur_metas.byte_size: max value 147776.0 is 13.6σ from mean 3797.21 (range [195.0, 147776.0], n=226)
[i] INFO Potential outlier in image_blur_metas.width: max value 1200.0 is 12.5σ from mean 114.21 (range [16.0, 1200.0], n=226)
[i] INFO Potential outlier in image_blur_metas.height: max value 683.0 is 9.2σ from mean 113.50 (range [16.0, 683.0], n=226)
[i] INFO Potential outlier in star_trek_characters.weight_kilograms: max value 110.0 is 3.2σ from mean 70.84 (range [40.0, 110.0], n=149)
```

The inline `// drift-advisor:ignore anomaly` directives in the Dart table files suppress these in the VS Code extension diagnostic panel, but the server-side detector (`anomaly_detector.dart`) has no knowledge of Dart source files and emits them unconditionally.

## Emitter Attribution

- owner: drift-advisor (server)
- code: `potential_outlier` (server-side type) / `anomaly` (extension-side diagnostic code)
- source: Drift Advisor server anomaly detector
- Registered at: `lib/src/server/anomaly_detector.dart:554` (the `anomalies.add` call)
- Emit site(s): `lib/src/server/anomaly_detector.dart:554` (single site for `potential_outlier` type)
- Extension mapping: `extension/src/diagnostics/checkers/anomaly-checker.ts:62` maps server `potential_outlier` to extension code `anomaly`
- Grep command used: `grep -rn "potential_outlier" lib/src/`
- Sibling-repo negative grep: N/A (server-only emit path)

## Minimal Reproducible Example

Any database with:
- A table containing `byte_size`, `width`, or `height` integer columns where values span more than one order of magnitude (e.g., thumbnails + full-resolution images).
- A table containing `weight_kilograms` (or similar physical measurement) where a small population has natural variance.

## Root Cause

The server-side `_detectNumericOutliers` in `anomaly_detector.dart` already skips many column-name patterns (identifiers, coordinates, timestamps, ratings, years, sort order, versions) but has no pattern for:

1. **Dimensional / size columns** — `byte_size`, `width`, `height`, `length`, `size`, `depth`, `area`, `volume`, `duration`, `count`, `pixel_*`, `num_*`. These record physical or digital measurements that naturally span orders of magnitude (a 16 px thumbnail vs a 1200 px photo). The existing log-scale fallback does not catch these because the distributions are often bimodal (clustered at two scales), not log-normal.

2. **Physical measurement columns** — `weight_*`, `mass_*`, `height_*` (when measuring a person/object, not a pixel dimension). These are bounded real-world measurements where the population is small and non-Gaussian. The existing `_boundedScales` check does not cover them because the observed range (40–110 kg) does not fit a predefined scale like 0–100.

## Proposed Fix

Add two new skip patterns to `anomaly_detector.dart`, following the existing pattern style:

1. A `_dimensionPattern` matching columns like `byte_size`, `width`, `height`, `size`, `length` (when not already caught by `_coordinatePattern`), `depth`, `area`, `pixel_width`, `pixel_height`, `num_pixels`, `file_size`, `content_length`.

2. A `_physicalMeasurementPattern` matching columns like `weight_*`, `mass_*`, `height_meters`, `length_meters`, `distance_*`, `speed_*`, `temperature_*`, `pressure_*`, `volume_*`, `capacity_*`. These are real-world quantities where sigma-based detection is unreliable on small, naturally-varied populations.

Add both patterns to the skip guard in `_detectNumericOutliers` alongside the existing coordinate/timestamp/rating checks, and update the method's doc comment skip-guard list.

Care points:
- `height` and `length` overlap with coordinate-adjacent meanings (person height vs pixel height vs geographic altitude). The pattern should match the column names as they appear in practice (`height`, `height_meters`, `pixel_height`, `image_height`), not just bare `^height$`.
- `width` is unambiguous — it is never a coordinate or identifier.
- `byte_size` / `file_size` / `content_length` are always dimensional.
- The `weight_kilograms` case could alternatively be handled by widening `_boundedScales` to include a human-weight range, but that is fragile (animal weights span 0.003–150,000 kg). A column-name pattern is more robust.

## What I Already Tried

- [x] Inline `// drift-advisor:ignore anomaly` directives in the Dart table files — suppresses in VS Code extension but not in the server output
- [ ] Restarted VS Code
- [ ] Disabled other extensions
- [ ] Tested on a different database
- [ ] Tested on a previous extension version

## Regression Info

- Last working version: N/A (these columns have always been flagged)
- First broken version: N/A (not a regression; a missing skip pattern)
- What changed: N/A

## Impact

- Who is affected: any host with image-metadata or character/person tables
- What is blocked: nothing blocked; noise in the anomaly report obscures real findings
- Data risk: none (INFO severity, no false corruption claim)
- Frequency: every anomaly scan

## Status: Fixed

## Finish Report (2026-07-20)

The server-side anomaly detector's `_detectNumericOutliers` method in `anomaly_detector.dart` lacked skip patterns for two categories of columns that produce false-positive `potential_outlier` findings: dimensional/size columns (byte sizes, pixel dimensions, durations, counts) and physical measurement columns (weight, mass, distance, speed, temperature, pressure, capacity).

### Changes

**`lib/src/server/anomaly_detector.dart`**
- Added `_dimensionPattern` — a `RegExp` matching snake_case segments: `width`, `height`, `depth`, `area`, `volume`, `size`, `length`, `duration`, plus `pixel_*`, `num_*`, `*_count`, and bare `count`. Uses `(?:^|_)term(?:$|_)` boundaries to prevent over-matching (e.g., `sized_box` or `heightened` are not matched).
- Added `_physicalMeasurementPattern` — a `RegExp` matching snake_case segments: `weight`, `mass`, `distance`, `speed`, `velocity`, `temperature`, `pressure`, `capacity`. Same boundary constraints.
- Both patterns wired into the existing skip guard alongside coordinate/timestamp/rating checks. Order: new patterns checked last, after the six existing domain patterns.
- Updated doc comments on the method and the call site to list the new skip categories.

**`test/anomaly_detector_test.dart`**
- Added regression test with 14 dimension column name variants (byte_size, width, height, file_size, content_length, image_width, pixel_height, depth, area, volume, duration, item_count, num_pixels, count).
- Added regression test with 12 physical measurement column name variants (weight_kilograms, mass, distance, speed, velocity, temperature, pressure, capacity, body_weight, net_weight, top_speed, max_distance).

**`CHANGELOG.md`** — Added entry under `[Unreleased] > Fixed`.

### Test results

45/45 anomaly detector tests pass, including the 2 new tests. No existing tests broken — no existing test column names collide with the new patterns.
