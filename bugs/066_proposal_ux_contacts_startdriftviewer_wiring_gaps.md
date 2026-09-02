# PROPOSAL: Close the wiring gaps in the primary consumer — the Contacts app enables 3 of 16 `startDriftViewer` parameters

**Status: Open**

Created: 2026-09-02
Type: UX improvement / Infrastructure
Related diagnostics: anomaly detection (`staticTables`), all write-path capabilities (`writeQuery`)

---

## Summary

Saropa Contacts is the primary consumer of `saropa_drift_advisor` and is pinned to the current version, but its `startDriftViewer` call passes only `enabled`, `onLog`, and `onError`. Thirteen parameters are left at their defaults, including the three that gate the extension's most-used write features, the anomaly detector's main false-positive suppression, and this repo's own documented error-classification pattern. Features that ship and are documented are simply not switched on in the app they were built for.

---

## Motivation

Dogfooding is how this repo's diagnostics get exercised. If the flagship consumer runs a read-only server with unsuppressed seed tables, the write path and the static-table suppression are never exercised outside tests — and the repo's own bug guide already lists one of these gaps as a known pitfall.

### The consumer is current, not stale

```bash
$ grep -n "saropa_drift_advisor\|saropa_dart_utils\|saropa_lints" D:/src/contacts/pubspec.yaml
515:  saropa_dart_utils: ^1.6.3
519:  saropa_drift_advisor: ^4.2.5
688:  saropa_lints: ^15.2.8

$ grep -n "^version" pubspec.yaml
# saropa_drift_advisor 4.2.5 — the consumer is on the current release
```

So this is not a version-lag problem. Every parameter below is available to the app today.

### What the call site actually passes

```bash
$ sed -n '638,658p' D:/src/contacts/lib/main.dart
    if (MainSettings.isDebugMode &&
        DriftConfig.isInitialized &&
        EnvType.DriftAdvisorEnabled.boolValue) {
      await StartupTaskRunner.run(
        task: () => DriftConfig.db.startDriftViewer(
          enabled: true,
          onLog: (String message) => debug(message),
          // Warning-level log, not debugExceptionWithoutLog — ad-hoc SQL
          // errors (bad column names, syntax) are user-input failures, not
          // app bugs, and must not halt the debugger. Stack is attached
          // (default) so genuine server errors retain diagnostic context.
          onError: (Object error, StackTrace stack) => debug(
            () => 'Drift Advisor error: $error',
            level: DebugLevels.Warning,
            stackTrace: stack,
            doSaveToDb: false,
          ),
        ),
```

Three named arguments: `enabled`, `onLog`, `onError`.

### What is available

```bash
$ sed -n '300,328p' lib/src/start_drift_viewer_extension.dart
  Future<void> startDriftViewer({
    bool enabled = true,
    int port = 8_642,
    bool loopbackOnly = true,
    String? corsOrigin,
    String? authToken,
    String? basicAuthUser,
    String? basicAuthPassword,
    DriftDebugGetDatabaseBytes? getDatabaseBytes,
    Object? compareDatabase,
    DriftDebugWriteQuery? writeQuery,
    DriftDebugWriteQueryWithBindings? writeQueryWithBindings,
    DriftDebugOnLog? onLog,
    DriftDebugOnError? onError,
    DriftDebugOnClassifiedError? onClassifiedError,
    List<String> staticTables = const <String>[],
    bool monitoringEnabled = true,
  }) async {
```

Sixteen parameters; three are passed.

---

## Detection / Behavior

The three gaps that matter, in order of value.

### 1. `writeQuery` — three server capabilities are off

The capability advertisement is a direct function of this one argument:

```bash
$ sed -n '114,121p' lib/src/server/generation_handler.dart
        ServerConstants.jsonKeyCapabilities: _ctx.writeQuery != null
            ? <String>[
                ServerConstants.capabilityIssues,
                ServerConstants.capabilityCellUpdate,
                ServerConstants.capabilityEditsApply,
              ]
            : <String>[ServerConstants.capabilityIssues],
```

```bash
$ grep -n "capabilityCellUpdate\|capabilityEditsApply" lib/src/server/server_constants.dart
616:  /// Advertises POST /api/cell/update for browser inline edits.
617:  static const String capabilityCellUpdate = 'cellUpdate';
619:  /// Advertises POST /api/edits/apply for extension bulk data edits.
620:  static const String capabilityEditsApply = 'editsApply';
```

**Should flag (problematic).** Contacts today: `capabilities: ["issues"]`. Inline cell editing in the browser viewer and bulk data edits from the extension are both unavailable, and the extension correctly hides them — so the entire write half of the product is untested against the flagship app.

**Should pass (correct).** Contacts passes a `writeQuery` guarded by the same `isDebugMode` + env-override gate that already guards the server itself, so the write path is enabled in debug and impossible in release. The existing gate at `main.dart:638` is exactly the right guard and is already in place.

### 2. `staticTables` — anomaly false positives on seed data

```bash
$ sed -n '320,323p' lib/src/start_drift_viewer_extension.dart
    // Tables holding static/seed/bundled content: the numeric-outlier scan is
    // suppressed on them (an outlier in immutable seed data can never be a
    // defect). Other anomaly kinds still run. See [DriftDebugServer.start].
    List<String> staticTables = const <String>[],
```

**Should flag (problematic).** A contacts application is close to the worst case for this: it ships bundled reference data (country and dialing codes, relationship types, and similar lookup tables) whose numeric columns are immutable by construction. Every outlier the detector finds in them is a guaranteed false positive.

**Should pass (correct).** The app names its bundled lookup tables in `staticTables`. Note this needs the app owner to enumerate them — this proposal does not assume which tables qualify, and the list should be derived from the app's own seed-loading code rather than guessed.

### 3. `onClassifiedError` — the repo's own documented pitfall

```bash
$ grep -n "onClassifiedError" bugs/ISSUE_REPORT_GUIDE.md
450:| Missing `onError` classification | Error callback lacks context to distinguish user-query vs server errors | Use `onClassifiedError` with error type discrimination |
```

**Should flag (problematic).** Contacts uses plain `onError` and hand-writes the classification as a *comment* explaining that ad-hoc SQL errors are user-input failures rather than app bugs — the exact distinction `onClassifiedError` exists to make available programmatically. The comment is right; it just cannot be acted on, so both kinds of failure log identically at `Warning`.

**Should pass (correct).** `onClassifiedError` supplies the error type, and the app routes user-query errors to `Warning` and genuine server errors to its normal exception path.

---

## Edge Cases

1. **`writeQuery` in a release build** — must never be reachable. The existing triple gate (`MainSettings.isDebugMode && DriftConfig.isInitialized && EnvType.DriftAdvisorEnabled.boolValue`) already handles this; the write callback must be constructed inside that branch, not at the top level.
2. **`writeQuery` against a database with a live UI bound to it** — needs discussion in the consumer. Writing rows out from under Drift's stream queries is the app's problem to reason about, not this package's; the package only forwards the callback.
3. **`staticTables` naming drift** — should pass with care. The names are SQL table names, not Dart class names. A rename in the app silently un-suppresses the table, so the list belongs next to the seed-loading code, not in `main.dart`.
4. **`compareDatabase`, `getDatabaseBytes`, `authToken`, `port`, `loopbackOnly`** — should pass as-is. Snapshot comparison and DB download are opt-in conveniences, and the secure loopback defaults are correct for a desktop-attached debug session. No change proposed.
5. **`monitoringEnabled`** — should pass as-is. Contacts already has an env-override kill switch one level up, which is the better place for it.

---

## Alternatives Considered

- **Change the package defaults so these are on without wiring.** Rejected outright. `writeQuery` defaulting to non-null would make every consumer's database writable from a debug endpoint; the loopback/secure-default comment at `start_drift_viewer_extension.dart:303-307` documents a prior security regression from exactly this kind of convenience default.
- **Detect seed tables automatically instead of requiring `staticTables`.** Interesting but out of scope here — it is a detector-design question, and a wrong guess suppresses real anomalies. Should be its own proposal if pursued.
- **Leave Contacts as-is and rely on `example/` for dogfooding.** Rejected: the example app has a toy schema. The false positives that matter (seed-data outliers, large-table sweeps) only appear at real scale, which is precisely what Contacts provides.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

**Scope note, important:** every code change described here lands in `D:/src/contacts`, not in this repo. This file exists to record the diagnosis, the evidence, and the parameter inventory so the Contacts work can be planned from it. Nothing here authorizes editing the Contacts tree — that repo owns its own change.

The actionable items *for this repo* are smaller and worth separating:

1. `doc/` currently documents the parameters individually but has no "recommended production wiring" example showing a realistic guarded `writeQuery` plus `staticTables` plus `onClassifiedError`. A worked example is what would have prevented this gap.
2. Consider a one-line startup log when `writeQuery` is null — "read-only: write capabilities disabled (pass writeQuery to enable)" — so the gap is visible to the app developer at runtime instead of only by reading the capability array.

---

## Implementation Notes

<!-- Fill in when work begins -->

---

## Commits

<!-- Add commit hashes as implementation lands -->
