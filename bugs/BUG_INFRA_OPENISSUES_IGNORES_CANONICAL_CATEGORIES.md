# BUG: `driftViewer.openIssues` ignores 6 of the 8 canonical suite categories, including the only one Saropa Lints sends

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/suite/suite-commands.ts` (line ~117)
Severity: Wrong fix / UX (dead cross-tool deep link)

---

## Summary

`driftViewer.openIssues` is one of the five public deep-link command ids Drift Advisor commits to keeping stable for the suite. It accepts `{ category }` from the shared taxonomy, but its `switch` handles only `performance` and `data`. Every other canonical category — including `drift`, the **only** category the Saropa Lints extension ever passes — falls through to `default:` and opens the generic dashboard instead of the runtime issues surface the caller asked for. The user clicks "Show Drift issues" in a Lints finding and lands on an unrelated panel.

---

## Attribution Evidence

The command lives in this repo, and this repo owns the canonical taxonomy.

```bash
# Positive — the command IS registered here
$ grep -rn "openIssues" extension/src extension/package.json | grep -v test
extension/src/suite/suite-commands.ts:112:  // openIssues: open the runtime issues surface, routed to the closest
extension/src/suite/suite-commands.ts:117:      'driftViewer.openIssues',
extension/package.json:463:        "command": "driftViewer.openIssues",

# Nothing in lib/src registers it (TypeScript-only surface)
$ grep -rn "openIssues" lib/src/
# 0 matches
```

**Emit site(s) — list ALL:** `extension/src/suite/suite-commands.ts:117`
**Public-API status:** listed as a committed-stable deep-link id in `plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md` Section 3 and in `.claude/skills/drift-advisor-ecosystem-and-positioning/SKILL.md`.

### The canonical taxonomy this repo owns

`plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md` is the canonical schema owner (per the ecosystem skill, §2 table).

```bash
$ grep -n "category.: .drift | security" plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md
74:  "category": "drift | security | performance | crash | schema | data | a11y | other",

$ grep -n "openIssues" plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md
142:| `driftViewer.openIssues` | `{ category? }` | The runtime issues list, optionally filtered |
```

Eight categories are contractual. Log Capture mirrors the same eight verbatim:

```bash
$ sed -n '30,39p' D:/src/saropa-log-capture/src/modules/diagnostics/saropa-diagnostic-envelope.ts
/** Problem domain. `drift` = Drift/SQLite data or schema; the rest are self-describing. */
export type DiagnosticCategory =
  | 'drift'
  | 'security'
  | 'performance'
  | 'crash'
  | 'schema'
  | 'data'
  | 'a11y'
  | 'other';
```

Log Capture's parser hard-rejects any diagnostic whose `category` is outside that set:

```bash
$ sed -n '23,25p' D:/src/saropa-log-capture/src/modules/diagnostics/envelope-parse.ts
const CATEGORIES: ReadonlySet<string> = new Set<DiagnosticCategory>([
  'drift', 'security', 'performance', 'crash', 'schema', 'data', 'a11y', 'other',
]);
```

### What Advisor actually implements

```bash
$ sed -n '111,128p' extension/src/suite/suite-commands.ts
  // openIssues: open the runtime issues surface, routed to the closest
  // existing view for the requested shared-taxonomy category (plan 67 §2.1).
  // Anything else opens the consolidated dashboard.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openIssues',
      (args?: { category?: string }) => {
        switch (args?.category) {
          case 'performance':
            return vscode.commands.executeCommand('driftViewer.showIndexSuggestions');
          case 'data':
            return vscode.commands.executeCommand('driftViewer.showAnomalies');
          default:
            return vscode.commands.executeCommand('driftViewer.openDashboard');
        }
      },
    ),
  );
```

Handled: `performance`, `data`. Unhandled: `drift`, `security`, `crash`, `schema`, `a11y`, `other`.

Note that `schema` is not some exotic sibling-only value — **this repo emits it itself** on every orphan-table and soft-relationship issue:

```bash
$ grep -n "categorySchema" lib/src/server/analytics_handler.dart lib/src/server/server_constants.dart
lib/src/server/analytics_handler.dart:428:      'orphan-table' || 'soft-relationship' => ServerConstants.categorySchema,
lib/src/server/server_constants.dart:668:  static const String categorySchema = 'schema';
```

So a consumer that reads `category: "schema"` off `/api/issues` and passes it straight back to `openIssues` — the obvious round-trip — gets the dashboard.

### Cross-repo proof that this breaks a real caller

Saropa Lints' single reciprocal deep-link into Advisor passes `category: 'drift'`:

```bash
$ grep -n -A6 "return \[" D:/src/saropa_lints/extension/src/suite/siblingDeepLinkTargets.ts
  return [
    {
      title: l10n('suite.deepLink.showDriftIssues'),
      command: 'driftViewer.openIssues',
      args: [{ category: 'drift' }],
    },
  ];

$ grep -n "ADVISOR_EXTENSION_ID = " D:/src/saropa_lints/extension/src/suite/siblingDeepLinkTargets.ts
18:export const ADVISOR_EXTENSION_ID = 'saropa.drift-viewer';
```

That id is correct (`extension/package.json:2 "name": "drift-viewer"`, `:6 "publisher": "saropa"`), the command id is correct, and the argument shape is correct. The category is the canonical one for "Drift/SQLite data or schema". Advisor still routes it to the dashboard.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5 (`extension/package.json:5`)
- Saropa Lints extension version: 15.2.8 (`D:/src/saropa_lints/extension/package.json:5`)
- Relevant non-default settings: none required — the Lints code action appears whenever a `drift`-matching rule fires and `saropa.drift-viewer` is installed.

---

## Steps to Reproduce

1. Open a Flutter/Dart workspace that has both `saropa.drift-viewer` (4.2.5) and `saropa.saropa-lints` (15.2.8) installed and a `saropa_lints` finding whose rule id contains `drift` (the test is `ruleId.includes('drift')`, `siblingDeepLinkTargets.ts:39`).
2. Put the caret on that finding and open the lightbulb / Quick Fix menu (Ctrl+.).
3. Click the "Show Drift issues" code action.

Alternatively, without Lints installed, from the Command Palette is not enough — the arg must be supplied programmatically. Use the Developer console:

```js
vscode.commands.executeCommand('driftViewer.openIssues', { category: 'drift' })
```

---

## Expected Behavior

The runtime issues surface opens — the panel that lists the `/api/issues` findings (anomalies + index suggestions + orphan tables + soft relationships), which is what a `drift`-category request means.

---

## Actual Behavior

`driftViewer.openDashboard` runs. The user gets the consolidated dashboard, not the issues list. Same for `category: 'schema'`, which Advisor itself stamps on its own orphan-table issues.

---

## Error Output

None — there is no error. The `default:` branch is a silent, plausible-looking fallback, which is why this has gone unnoticed: the command "works", it just does the wrong thing.

### Extension Output Channel

Nothing is logged. `openIssues` neither logs the requested category nor warns on an unhandled one.

---

## Duplicate-Emission Check

Not applicable — this is a command-routing bug, not a diagnostic. The command has exactly one registration (`extension/src/suite/suite-commands.ts:117`); there is no Dart emit path (`grep -rn "openIssues" lib/src/` → 0 matches).

---

## Minimal Reproducible Example

```js
// In the Extension Development Host, with the Advisor extension active:
await vscode.commands.executeCommand('driftViewer.openIssues', { category: 'drift' });
// Observed: the dashboard opens.
// Expected: the runtime issues list opens.
```

---

## What I Already Tried

- [x] Read all five registered suite deep-link commands in `extension/src/suite/suite-commands.ts` — `openIssues` is the only one with a lossy `switch`; the other four (`openExplainForSql`, `openTable`, `openSchemaForTable`, `goToDefinitionForTable`) either forward their argument or fall back deliberately with a user-visible warning.
- [x] Grepped the canonical plan and Log Capture's mirror of the taxonomy — both agree on eight categories.
- [x] Confirmed the Lints caller's extension id, command id, and argument shape are all correct, so the fix is unambiguously on this side.

---

## Regression Info

- Last working version: never worked. The `switch` has covered only two categories since plan 67 R5 shipped.
- First broken version: the release that introduced `extension/src/suite/suite-commands.ts`.
- What changed: the taxonomy (plan 67 §2.1) was written with eight values; the router was written against Advisor's own four (`performance`/`data`/`schema`/`other`) and then implemented only two of those four.

---

## Root Cause

<!-- Fill in during investigation. -->

Hypothesis, not yet confirmed by the owner: the `switch` was written to map categories onto *existing panels*, and only two panels (`showIndexSuggestions`, `showAnomalies`) were obvious one-to-one matches. `schema`, `drift`, and the sibling-only categories had no obvious panel, so they were left to the `default:` arm rather than routed to a general issues list — turning "no perfect panel" into "wrong panel", silently.

---

## Changes Made

<!-- Fill in when a fix is written. -->

Suggested shape (not yet implemented, listed so the fix agent does not have to re-derive it):

1. Route `drift`, `schema`, and `other` to the runtime-issues surface (whatever command currently renders the merged `/api/issues` list) rather than the dashboard.
2. Route the sibling-only categories (`security`, `crash`, `a11y`) explicitly to the dashboard **and** log the passthrough, so a future taxonomy addition is visible instead of silent.
3. Add a regression test asserting each of the eight canonical values maps to a non-`openDashboard` command where one exists — the test is what stops the taxonomy and the router drifting apart again.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every user with both Drift Advisor and Saropa Lints installed who uses the cross-tool code action; also any script or sibling that round-trips a `category` value read off `/api/issues`.
- What is blocked: the Lints → Advisor half of the suite deep-link protocol. It is the only reciprocal link Lints offers, so the whole Lints→Advisor navigation surface is dead.
- Data risk: none.
- Frequency: 100% of `{category:'drift'}` invocations, and 100% of `{category:'schema'}` round-trips.
