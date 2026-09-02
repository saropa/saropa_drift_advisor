# PROPOSAL: Quick Fix and CodeLens That Wire `startDriftViewer` into the Drift Database Class

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

**Add Saropa Drift Advisor** adds the pubspec dependency, runs `pub get`, and then tells the user
"Run your app with the Drift debug server to connect" — but nothing in the extension ever writes the
`startDriftViewer` call, and the string `startDriftViewer` does not appear anywhere in
`extension/src/`. Close the loop with a CodeLens / quick fix on the user's `@DriftDatabase` class
that inserts the wiring.

**Wow: 8/10, Effort: Medium**

---

## Motivation

The onboarding path ends one step short of working. Concretely:

- `extension/src/workspace-setup/add-package.ts` — `addPackageToPubspec()` inserts
  `saropa_drift_advisor: ^4.2.5` into `dependencies`, applies a `WorkspaceEdit` to `pubspec.yaml`,
  runs `flutter pub get` / `dart pub get`, and returns
  `"Added saropa_drift_advisor 4.2.5 to dependencies. Run your app with the Drift debug server to connect."`
- Grep proof that no wiring exists:

```bash
grep -rn "startDriftViewer" extension/src/
# 0 matches
```

- The walkthrough (`contributes.walkthroughs` step `addPackage`) marks itself complete on
  `onCommand:driftViewer.addPackageToProject` — i.e. the walkthrough calls the step done at exactly
  the point the user still has a non-functional setup. Step 2 (`connectServer`) then waits on
  `onContext:driftViewer.serverConnected`, which will never fire, and the user is left in a
  walkthrough that cannot advance with no indication why.
- Both "no server" welcome views (`package.nls.json` keys `viewsWelcome.2.contents`,
  `viewsWelcome.3.contents`) offer eight troubleshooting buttons — connection log, diagnose, forward
  port, select server — none of which help, because the cause is that the app never started a server.

The extension already has every ingredient: a Dart table/database locator
(`extension/src/definition/`, used by Go to Definition and by
`driftViewer.goToDriftTableDefinition`), a Drift-class CodeLens provider
(`extension/src/codelens/drift-codelens-provider.ts`, which already attaches lenses to
`class ... extends Table`), and a code-action provider
(`extension/src/diagnostics/code-action-provider.ts`).

---

## Detection / Behavior

### Should flag (problematic)

A workspace where `pubspec.yaml` contains `saropa_drift_advisor` **and** a Dart file declares a
Drift database class, but no call to `startDriftViewer` / `DriftDebugServer.start` exists anywhere
in the workspace:

```dart
@DriftDatabase(tables: [Users, Orders])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());
  @override
  int get schemaVersion => 3;
}
```

CodeLens above the class: **`$(plug) Wire Drift Advisor debug server`**. Diagnostic-free — a lens
and a code action, not a squiggle, so it cannot become a false positive in the Problems panel.

Invoking it inserts, immediately after the constructor:

```dart
  /// Starts the Saropa Drift Advisor debug server in debug builds only.
  /// Tree-shaken out of release builds because `enabled` is `kDebugMode`.
  Future<void> startDebugViewer() async {
    await startDriftViewer(enabled: kDebugMode);
  }
```

plus the two imports (`package:saropa_drift_advisor/saropa_drift_advisor.dart`,
`package:flutter/foundation.dart`) if absent, and shows a follow-up:
`Call startDebugViewer() after your database is open. [Show me where]`.

A second lens variant offers the **callback API** form (with `writeQuery`, per
`018_proposal_ux_write_capability_gating.md`) for users who want writes.

### Should pass (correct)

- Workspace already calls `startDriftViewer` or `DriftDebugServer.start` anywhere — no lens.
- `saropa_drift_advisor` not in pubspec — no lens (offer **Add Saropa Drift Advisor** instead).
- Non-Drift classes, generated `.g.dart` files — no lens.

---

## Edge Cases

1. **`drift_sqlite_async` users** — the README warns that `startDriftViewer` may not work and the
   callback API is required; when the database class does not expose `customSelect`, offer the
   callback form only.
2. **Multiple database classes** in one workspace — offer the lens on each; do not auto-pick.
3. **Pure Dart (no Flutter)** — `kDebugMode` is Flutter-only; insert
   `enabled: !const bool.fromEnvironment('dart.vm.product')` when `pubspec.yaml` has no `flutter`
   dependency (`isFlutterProject()` already exists in `add-package.ts`).
4. **User declines / dismisses** — never re-insert; a workspace-state flag suppresses the lens after
   an explicit dismiss, the way `package-status-monitor.ts` already tracks package state.
5. **Formatting** — insert with a `WorkspaceEdit` and let `dart format` own the result; do not
   hand-align.
6. **Walkthrough step** — `addPackage`'s completion event should move to "package present AND
   wiring present", otherwise the step still lies.

---

## Alternatives Considered

- **A `.dart` snippet contribution.** Discoverable only if the user already knows to type a prefix,
  and cannot add imports or pick the Flutter/pure-Dart variant.
- **Extend `addPackageToProject` to also edit Dart.** Rejected: at that moment the extension does
  not know which class is the database, and silently editing source from a "add dependency" command
  is surprising. The lens puts the edit where the user can see the target.
- **Documentation only.** The README already documents it; the gap is that the extension knows the
  wiring is missing and says nothing.

---

## Decision

---

## Implementation Notes

---

## Commits
