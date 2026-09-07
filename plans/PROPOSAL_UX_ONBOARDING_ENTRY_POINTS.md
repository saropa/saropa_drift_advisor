# PROPOSAL: Surface the Getting Started Walkthrough from the Empty States (and Fix the Dead `#getting-started` Link)

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

The extension ships a five-step Getting Started walkthrough with custom SVG art, and the two
"no server connected" welcome views never link to it. They link instead to
`https://github.com/saropa/saropa_drift_advisor#getting-started`, an anchor that does not exist in
`README.md`. The best onboarding asset in the repo is reachable only from a Hub tile and a palette
search for "Getting Started".

**Wow: 4/10, Effort: Low**

---

## Motivation

What exists (`extension/package.json` → `contributes.walkthroughs`):

```
driftViewer.gettingStarted
  1 addPackage        media/walkthrough/step-add-package.svg
  2 connectServer     media/walkthrough/step-connect.svg
  3 exploreDatabase   media/walkthrough/step-explore.svg
  4 runHealthCheck    media/walkthrough/step-health.svg
  5 generateMigration media/walkthrough/step-migration.svg
```

Where it is linked from:

- `extension/src/hub/hub-tiles.ts:44` — one tile inside the Tools Hub webview, which is itself
  behind the Toolbox tree or a palette command.
- `driftViewer.openWalkthrough`, title "Getting Started", in the palette.

Where it is **not** linked from — the exact screens a user stares at when nothing works
(`extension/package.nls.json`):

- `viewsWelcome.2.contents` (`!serverConnected && !packageInstalled`)
- `viewsWelcome.3.contents` (`!serverConnected && packageInstalled`)

Both end with:

```
RESOURCES

[Getting Started Guide](https://github.com/saropa/saropa_drift_advisor#getting-started) · [Report Issue](...)
```

Broken-link proof — `README.md` has no heading that renders to `#getting-started`:

```bash
grep -n "^#\{1,3\} " README.md
# ... 343:## Quick start   (the intended target; anchor is #quick-start)
grep -rn "getting-started" README.md extension/README.md
# 0 matches
```

GitHub silently ignores an unknown fragment, so the button lands the user at the top of a
~530-line README with a banner image and five badges — the least useful possible landing for someone
whose sidebar just said "No Drift debug server connected."

Note also that walkthrough step 1 completes on `onCommand:driftViewer.addPackageToProject`, which
only edits `pubspec.yaml` — the user still has no server. See
`019_proposal_ux_wire_start_drift_viewer_code_action.md` for that half.

---

## Detection / Behavior

### Should flag (problematic)

- A welcome-view link whose URL fragment does not match any `README.md` heading anchor.
- A contributed walkthrough with no link from any `viewsWelcome` block.

### Should pass (correct)

Both no-server welcome views lead with the walkthrough, before the troubleshooting wall:

```
No Drift debug server connected.

[Open Getting Started]      ← command:driftViewer.openWalkthrough
[Add Saropa Drift Advisor]  ← command:driftViewer.addPackageToProject   (view .2 only)

Already running your app? Try:
[Diagnose connection] [Forward Port (Android Emulator)] [Troubleshooting] [Connection log]
...
RESOURCES
[Quick start](https://github.com/saropa/saropa_drift_advisor#quick-start) · [Report Issue](...)
```

Two behavioural changes, both small:

1. `viewsWelcome.2/3.contents` gain a `command:driftViewer.openWalkthrough` button, placed first.
2. The `#getting-started` fragment becomes `#quick-start` — or `README.md` gains a
   `## Getting started` heading and the link stays. Pick one; do not leave both broken.

Optionally, on first activation in a Dart/Flutter workspace with no prior state, open the walkthrough
once (VS Code's standard `walkthroughs` first-run behaviour), never again.

---

## Edge Cases

1. **Non-Drift workspaces** — `activationEvents` includes `workspaceContains:**/pubspec.yaml`, and
   the views are gated on `driftViewer.isDriftProject`; the walkthrough button inherits that gating,
   so a plain Dart CLI project is unaffected.
2. **Returning users** — the walkthrough tracks its own completion; do not re-open it for someone
   who finished it. Do not add a second "have you seen this" toast.
3. **Button order matters.** Eight troubleshooting buttons above a walkthrough link reads as "you
   have a problem"; the walkthrough first reads as "here is the path". Keep the troubleshooting
   buttons — they are correct for the user who *is* running the app.
4. **Anchor drift.** README headings are renamed regularly (`## Quick start` today). A link-check
   over `package.nls.json` fragments against `README.md` headings belongs in the same test pass that
   already checks NLS coverage.
5. **Localization** — the new button label is a new NLS key, not an inline string.

---

## Alternatives Considered

- **Fix the anchor only.** One-character change, but the walkthrough stays invisible from the
  screen where it is most needed.
- **Auto-open the walkthrough whenever no server is found.** Intrusive for the many sessions where
  the user simply has not started the app yet.
- **Delete the walkthrough.** It is the strongest first-run asset present; the problem is routing,
  not content.

---

## Decision

---

## Implementation Notes

---

## Commits
