# PROPOSAL: Demonstrate and document `onClassifiedError` — the 4.2.5 headline API appears in no README, no doc/, and not in the example app

**Status: Open**

Created: 2026-09-02
Type: Infrastructure / Documentation / Example app
Related diagnostics: none

---

## Summary

`onClassifiedError` and `DriftDebugErrorLogger.classifiedErrorCallback()` are the headline addition of 4.2.5, and the API doc comments in `lib/` are thorough. But the two places a host developer actually looks — `README.md` and `example/lib/main.dart` — still show only the older `onError`, and neither `README.md` nor anything under `doc/` mentions the new callback at all. The example app is the reference wiring for `startDriftViewer`; leaving it on the superseded callback means the recommended pattern shipped in 4.2.5 has no worked example anywhere in the repo.

---

## Motivation

The feature is real and complete in the library:

```bash
grep -rn "onClassifiedError\|classifiedErrorCallback" lib/ | head
```

```
lib/saropa_drift_advisor.dart:41:///   Pass as `onClassifiedError`; when set, `onError`
lib/src/drift_debug_server_io.dart:175:    DriftDebugOnClassifiedError? onClassifiedError,
lib/src/drift_debug_server_io.dart:214:        onClassifiedError: onClassifiedError,
lib/src/drift_debug_server_io.dart:248:    DriftDebugOnClassifiedError? onClassifiedError,
lib/src/drift_debug_server_io.dart:412:      onClassifiedError: onClassifiedError,
lib/src/drift_debug_server_io.dart:914:    DriftDebugOnClassifiedError? onClassifiedError,
lib/src/drift_debug_server_io.dart:1009:    onClassifiedError: onClassifiedError,
lib/src/error_logger.dart:142:  static DriftDebugOnClassifiedError classifiedErrorCallback({
lib/src/server/server_context.dart:48:    this.onClassifiedError,
lib/src/server/server_context.dart:152:  final DriftDebugOnClassifiedError? onClassifiedError,
lib/src/start_drift_viewer_extension.dart:319:    DriftDebugOnClassifiedError? onClassifiedError,
```

The changelog leads 4.2.5 with it:

> **Error classification for the `onError` callback.** New `DriftDebugErrorKind` enum (`userQuery`, `server`) and `DriftDebugOnClassifiedError` callback let host apps distinguish expected user-input errors … Pass `onClassifiedError:` to `startDriftViewer` or `DriftDebugServer.start` …

And `bugs/ISSUE_REPORT_GUIDE.md` lists it as a house pattern in its Common Pitfalls table:

| Pitfall | Correct Pattern |
|---|---|
| Missing `onError` classification | Use `onClassifiedError` with error type discrimination |

Yet the user-facing surfaces do not mention it:

```bash
grep -rn "onClassifiedError\|classifiedErrorCallback" README.md doc/ example/
# Expected: 0 matches — and that is what is returned
```

The README's callback table still lists only the old pair:

```bash
grep -n "onLog\|onError" README.md
```

```
467:| **`onLog`**, **`onError`**                    | Optional; for your logger or `debugPrint` / `print`.                                                                 |
```

The example app — the reference wiring, and the thing `scripts/run_example.py` launches — uses the superseded callback:

```bash
sed -n '140,148p' example/lib/main.dart
```

```
    await db.startDriftViewer(
      enabled: kDebugMode,
      getDatabaseBytes: () => File(db.dbPath).readAsBytes(),
      // Enables Import (CSV/JSON/SQL) in the web UI; executes each statement via Drift.
      writeQuery: (String sql) => db.customStatement(sql),
      authToken: _kExampleAuthToken,
      onLog: DriftDebugErrorLogger.logCallback(prefix: 'DriftViewer'),
      onError: DriftDebugErrorLogger.errorCallback(prefix: 'DriftViewer'),
    );
```

and its README documents that older choice:

```bash
grep -n "onError" example/README.md
```

```
42:- **`onLog` / `onError`** — uses `DriftDebugErrorLogger` for startup and errors.
```

This matters more than a normal doc gap because the classification exists precisely to stop noise: without it, every bad ad-hoc SQL a developer types in the viewer surfaces to the host app's error handler at the same severity as a genuine server fault. The example demonstrates the noisy configuration.

---

## Detection / Behavior

### Should flag (problematic)

The current example wiring — every user-typed SQL mistake reaches the host's `onError` at the same level as a server bug:

```dart
await db.startDriftViewer(
  enabled: kDebugMode,
  onLog: DriftDebugErrorLogger.logCallback(prefix: 'DriftViewer'),
  onError: DriftDebugErrorLogger.errorCallback(prefix: 'DriftViewer'),
);
```

### Should pass (correct)

The 4.2.5 pattern, using the ready-made implementation the library already provides:

```dart
await db.startDriftViewer(
  enabled: kDebugMode,
  getDatabaseBytes: () => File(db.dbPath).readAsBytes(),
  writeQuery: (String sql) => db.customStatement(sql),
  authToken: _kExampleAuthToken,
  onLog: DriftDebugErrorLogger.logCallback(prefix: 'DriftViewer'),
  // Classified errors separate the two failure kinds that reach a host app:
  // a developer typing bad SQL into the viewer (userQuery -> info) and a real
  // fault in the debug server (server -> SEVERE with a stack trace). Passing
  // onClassifiedError supersedes onError, which cannot tell them apart and so
  // reports every mistyped query at fault severity.
  onClassifiedError:
      DriftDebugErrorLogger.classifiedErrorCallback(prefix: 'DriftViewer'),
);
```

`classifiedErrorCallback` already routes exactly this way (`lib/src/error_logger.dart:142-160`), so the example needs no bespoke handler.

---

## Edge Cases

1. **`onError` and `onClassifiedError` both passed** — `lib/saropa_drift_advisor.dart:41` states that when `onClassifiedError` is set, `onError` is not called. The example should pass only one, and the surrounding comment should say why, so nobody copies both. Should pass.
2. **Backward compatibility** — the changelog is explicit that existing `onError` callers are unchanged. The README table should therefore list both rows rather than replacing the old one, so 4.2.4-and-earlier users are not left thinking their wiring broke. Should pass.
3. **Example test coverage** — `example/test/` already contains `advisor_timing_interceptor_test.dart` and `viewer_status_test.dart`, so the example has a test harness. A test asserting the classified callback routes a `userQuery` kind away from the severe path would be cheap. Should pass.
4. **`doc/EXTENSION_API.md` vs `doc/API.md`** — the callback is host-side Dart, not an HTTP endpoint, so it belongs in the README callback table and in a short section beside the existing `startDriftViewer` guidance, not in `doc/API.md`. Needs no new file.

---

## Alternatives Considered

- **Leave the example on `onError` and document `onClassifiedError` in the README only.** Rejected: the example is what `scripts/run_example.py` runs and what a new user reads first; a documented-but-undemonstrated API gets copied in its old form.
- **Add a second example app showing the classified path.** Rejected on blast radius — a second Flutter app is a large maintenance surface for a one-parameter difference.
- **Show a hand-written `DriftDebugOnClassifiedError` closure in the example** rather than `classifiedErrorCallback()`. Worth doing as a commented alternative next to the one-liner, since the whole point of the enum is that hosts route the two kinds differently; but the ready-made helper should be the primary form.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

1. `example/lib/main.dart:147` — replace `onError:` with `onClassifiedError:` using `DriftDebugErrorLogger.classifiedErrorCallback(prefix: 'DriftViewer')`, with the explanatory comment above. Keep the existing commented "Alternative (callback style)" block at lines 131-139 in sync so both documented paths show the current API.
2. `example/README.md:42` — update the bullet to name `onLog` / `onClassifiedError`, and say in one line what the classification buys.
3. `README.md:467` — add an `onClassifiedError` row to the callback table, noting it supersedes `onError` when both are supplied.
4. Add a short README subsection next to the `startDriftViewer` guidance showing the two-kind routing, since the `DriftDebugErrorKind` enum values (`userQuery`, `server`) appear nowhere outside `lib/`.
5. Add an `example/test/` case asserting a `userQuery` kind does not reach the severe branch.
6. Note that `CHANGELOG.md` must be updated for the doc/example change per the repo's change-control rules, and that `README.md` has no automated version/content sync — see `bugs/063_infra_readme_documents_nonexistent_app_js_route.md`, which proposes adding one.

---

## Commits

<!-- Add commit hashes as implementation lands -->
