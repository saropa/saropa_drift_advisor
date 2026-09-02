# PROPOSAL: Add Kykto as a second dogfooding consumer — a 12-migration, TTL-expiry Drift app that exercises paths Contacts does not

**Status: Open**

Created: 2026-09-02
Type: Infrastructure
Related diagnostics: anomaly detection (row-count / distribution over time), orphan-table detection, schema divergence

---

## Summary

`saropa_drift_advisor` currently has exactly one real consumer, Saropa Contacts. A second sibling on disk — Kykto — is a Drift 2.31 app at schema version 12 whose entire product concept is rows that expire and get purged every 24 hours. That is a workload profile Contacts does not have and that Advisor's time-series anomaly and orphan-table detectors have never been exercised against. Wiring it costs one call in `main.dart`.

---

## Motivation

### Kykto is a genuine Drift consumer and does not use Advisor

```bash
$ grep -n "drift\|sqlite" D:/src/saropa_kykto/pubspec.yaml | head -8
16:  # Database (drift 2.31 + sqlite3 2.x; analyzer 9–compatible until Flutter supports meta ^1.18).
17:  # Changelog: https://pub.dev/packages/drift/changelog
18:  drift: ^2.31.0
20:  # SQLite3 driver (2.x; drift 2.31 does not support sqlite3 3.x).
21:  # Changelog: https://pub.dev/packages/sqlite3/changelog
22:  sqlite3: ^2.4.6
164:  # Changelog: https://pub.dev/packages/drift_dev/changelog
165:  drift_dev: ^2.31.0

$ grep -rn "drift_advisor\|startDriftViewer" D:/src/saropa_kykto/pubspec.yaml D:/src/saropa_kykto/lib
# 0 matches
```

It already uses the sibling analyzer, so the suite relationship is established:

```bash
$ grep -n "saropa_lints" D:/src/saropa_kykto/pubspec.yaml | head -2
174:  # Custom lint rules and analysis. dart run saropa_lints:init --tier recommended
```

### The workload is materially different from Contacts

```bash
$ grep -rln "extends Table" D:/src/saropa_kykto/lib/
D:/src/saropa_kykto/lib/data/database/app_database.g.dart
D:/src/saropa_kykto/lib/data/tables/archive_items.dart
D:/src/saropa_kykto/lib/data/tables/kyktos.dart
D:/src/saropa_kykto/lib/data/tables/stream_entries.dart
D:/src/saropa_kykto/lib/data/tables/stream_entry_groups.dart

$ grep -n "schemaVersion" D:/src/saropa_kykto/lib/data/database/app_database.dart
37:  int get schemaVersion => 12;

$ grep -rn "expiresAt" D:/src/saropa_kykto/lib/data/tables/stream_entries.dart
23:  DateTimeColumn get expiresAt => dateTime()(); // When decay moves to archive
```

And from its own README:

```bash
$ sed -n '7,7p' D:/src/saropa_kykto/README.md
Every item you enter stays for exactly 24 hours. During that day, you can send it to your calendar, text it to someone, or just let it sit. If you don't take action, Kykto clears it away automatically — so you always wake up to a fresh, manageable screen.
```

Three properties Contacts does not offer:

| Property | Kykto | Why Advisor cares |
|---|---|---|
| Rows expire and are purged daily | yes | Row counts swing hard on a 24h cycle — the anomaly detector's distribution assumptions have never met this |
| Twelve migrations of accumulated history | `schemaVersion => 12` | Orphan physical tables from abandoned migrations are exactly the `orphan-table` detector's target, and it only produces findings when the declared table set is supplied |
| Small, comprehensible schema (4 tables) | yes | A false positive is diagnosable by eye in minutes, instead of being buried in a large contact graph |

The purge cycle is the interesting one. Advisor's anomaly detector flags outliers against a distribution; an application that deliberately empties a table every day produces a legitimate, extreme, recurring swing. Whether the detector calls that an anomaly is currently unknown, because no consumer produces it.

### The `example/` app does not cover this

The bundled example has a toy schema and no migration history, so it cannot exercise orphan-table detection (which requires a declared table set that diverges from the physical one) or time-varying row counts. Kykto is the smallest real app that does both.

---

## Detection / Behavior

### Should flag (problematic)

Nothing new is being detected. The proposal is to run the existing detectors against a workload that has never been tried, and to treat what comes back as evidence.

Concretely, the questions this answers:

1. Does the numeric-outlier scan fire on `stream_entries` immediately after a purge, when the table is near-empty and then refills? If yes, that is a false-positive class no one has filed because no one has produced it.
2. Does `orphan-table` detection find residue from 12 migrations? If yes, that is a real finding for Kykto and a validation for the detector.
3. Does the schema-divergence comparison stay quiet across a `DateTimeColumn` (`expiresAt`) — the column type with the most Drift/SQLite storage ambiguity?

### Should pass (correct)

Kykto's `main.dart` gains a debug-gated `startDriftViewer` call in the shape Contacts already uses, plus the `staticTables` and `writeQuery` arguments Contacts is missing (see `bugs/066_proposal_ux_contacts_startdriftviewer_wiring_gaps.md`) — so the second consumer is wired correctly from day one rather than inheriting the first consumer's gaps.

---

## Edge Cases

1. **Kykto is a different product with its own roadmap** — the decisive constraint. Adding a dev dependency and a startup call to another team's app is their call, not this repo's. See Decision.
2. **Version compatibility** — should pass, needs confirming. Kykto is on `drift: ^2.31.0` and `sqlite3: ^2.4.6`, with an analyzer-12 pin via `saropa_lints`. This package has zero runtime dependencies, so it adds no resolution pressure — but that should be verified with an actual `flutter pub get` in Kykto before anything is promised.
3. **Findings produced by dogfooding belong to whichever repo owns the defect** — a false positive on the purge cycle is a bug *here*; a genuine orphan table is a bug *there*. Worth stating up front so the exercise does not turn into cross-repo finger-pointing.
4. **`saropa_radiance_vector`** — not a candidate, checked and rejected. It is a separate project with no Drift dependency, so there is no second option to weigh.

---

## Alternatives Considered

- **Expand `example/` to simulate a purge cycle and 12 migrations.** Cheaper and entirely within this repo's control. Weaker evidence: a simulation reproduces the behavior the author already imagined, which is precisely the failure mode dogfooding exists to catch. Worth doing *as well*, not instead.
- **Stay with Contacts only.** The status quo. It leaves the time-varying-row-count and deep-migration paths untested by any real app indefinitely.
- **Synthetic load test against a generated database.** Useful for performance, useless here — the detectors are looking for patterns in real application behavior, and generated data has whatever distribution the generator was written to produce.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

**Scope note:** every code change described lands in `D:/src/saropa_kykto`, not here. This file records the diagnosis and the evidence so the ask can be made concretely. It does not authorize editing that repo, and no change should be made there without its owner agreeing.

The step that belongs to this repo is the ask itself: a short integration note (a `bugs/` or `plans/` entry filed **in Kykto**) proposing the wiring, citing the three questions above as the specific value on offer.

---

## Implementation Notes

<!-- Fill in when work begins -->

---

## Commits

<!-- Add commit hashes as implementation lands -->
