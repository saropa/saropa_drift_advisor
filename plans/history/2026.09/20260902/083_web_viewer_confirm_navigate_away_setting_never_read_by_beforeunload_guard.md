# BUG: Settings toggle "Confirm before navigating away" has no effect — `PREF_CONFIRM_NAVIGATE_AWAY` is imported but never read by the `beforeunload` guard

**Status: Fixed**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Server (web viewer, `assets/web/`)
File: `assets/web/app.js` (lines 52, 90-99); `assets/web/settings.ts` (lines 123, 145, 312, 358)
Severity: UX — Medium (a visible, persisted user setting is a dead control)

---

## Summary

The Settings panel exposes a "Confirm before navigating away" toggle. It persists to `localStorage` and renders its stored state on every visit. The only `beforeunload` guard in the app ignores it: it prompts whenever an inline cell edit is unsaved and never otherwise, regardless of the toggle. `app.js` even imports the preference key and `getPref`, then uses neither. A user who turns the toggle off still gets the prompt; a user who leaves it on gets no prompt for anything except an open cell edit.

---

## Attribution Evidence

Positive — the setting and the guard are both in this repo:

```bash
grep -n "PREF_CONFIRM_NAVIGATE_AWAY\|getPref" assets/web/app.js
```

```
assets/web/app.js:52:    import { applyStoredPrefs, getPref, PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS } from './settings.ts';
```

That is the only occurrence — imported, never used. The guard:

```bash
sed -n '90,99p' assets/web/app.js
```

```
    function setupNavigateAwayConfirmation() {
      window.addEventListener('beforeunload', function (e) {
        // In web inline-edit mode, only prompt when there is an unsaved active edit.
        if (!hasUnsavedWebEdit()) return;
        e.preventDefault();
        e.returnValue = '';
        return '';
      });
    }
    setupNavigateAwayConfirmation();
```

The setting's full lifecycle in `settings.ts` — defined, defaulted, rendered, bound — with no consumer:

```bash
grep -n "PREF_CONFIRM_NAVIGATE_AWAY" assets/web/settings.ts
```

```
assets/web/settings.ts:123:export const PREF_CONFIRM_NAVIGATE_AWAY = 'confirmNavigateAway';
assets/web/settings.ts:145:  [PREF_CONFIRM_NAVIGATE_AWAY]: true,
assets/web/settings.ts:312:  setToggle('pref-confirmNavigateAway', getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY]));
assets/web/settings.ts:358:  bindToggleInput('pref-confirmNavigateAway', PREF_CONFIRM_NAVIGATE_AWAY);
```

No other module reads it:

```bash
grep -rn "PREF_CONFIRM_NAVIGATE_AWAY\|confirmNavigateAway" assets/web/*.ts assets/web/app.js | grep -v settings.ts | grep -v "app.js:52"
# Expected: 0 matches
```

Negative attribution — not a sibling package:

```bash
grep -rn "confirmNavigateAway" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `assets/web/app.js:90-99` (guard), `assets/web/settings.ts:312,358` (toggle).

---

## Environment

- OS: any
- Browser: any
- VS Code version: n/a (panel webviews do not fire `beforeunload` prompts)
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: n/a
- Connection method: browser at `http://127.0.0.1:8642`
- Relevant non-default settings: "Confirm before navigating away" toggled **off**
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Open the viewer, click the **Settings** toolbar icon (mouse).
2. Toggle **Confirm before navigating away** to off. Reload; confirm it is still off.
3. Start the app with write access enabled, open a table, double-click a cell to begin an inline edit, change the value, do not save.
4. Press F5.

Reproduces on every attempt.

---

## Expected Behavior

With the toggle off, step 4 reloads without a prompt. With it on, the prompt appears.

---

## Actual Behavior

The browser's leave-page prompt appears in step 4 regardless of the toggle.

---

## Error Output

### VS Code Developer Tools Console

Nothing.

### Extension Output Channel

Nothing.

### Terminal / Command Output

n/a.

### Stack Traces

None.

---

## Duplicate-Emission Check

One guard, one toggle. `heartbeat-capture.ts:195` also binds `beforeunload` but only to fire a best-effort disarm POST; it does not prompt and is unrelated.

---

## Screenshots / Recordings

Not attached.

---

## Minimal Reproducible Example

```js
// Viewer console:
localStorage.getItem('drift-viewer-pref-confirmNavigateAway')   // "false" after step 2
// The handler at app.js:91 contains no reference to that key.
```

---

## What I Already Tried

- [x] Read the guard — the only condition is `hasUnsavedWebEdit()`.
- [x] Confirmed the import at `app.js:52` is otherwise unused (`getPref` and `PREF_CONFIRM_NAVIGATE_AWAY` have no other references in the file).

---

## Regression Info

- Last working version: never — the setting appears to have been added to the Settings panel with its wiring left as a follow-up that did not happen. The unused import is the evidence.
- First broken version: the release that introduced the Settings panel.
- What changed: nothing since.

---

## Root Cause

The preference was defined and surfaced but the consumer was never written. The `beforeunload` guard predates the setting and was not updated to consult it.

---

## Changes Made

- `assets/web/app.js`, `setupNavigateAwayConfirmation()`: the `beforeunload` handler now consults the preference before anything else:

  ```js
  if (!getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY])) return;
  if (!hasUnsavedWebEdit()) return;
  ```

  `getPref` is called inside the handler, at unload time, rather than captured at startup, so toggling the setting takes effect immediately without a reload. This also resolves the unused-import lint at `app.js:52` — `getPref`, `PREF_CONFIRM_NAVIGATE_AWAY` and `DEFAULTS` are now all read.
- A doc comment above the function states the chosen semantics and the reasoning (see below), and an inline comment explains why the pref is read late.

### Semantics chosen (stated in the code comment)

- **Pref OFF -> never prompt**, even with an unsaved inline cell edit. Off means off; the user has explicitly opted out of the interruption.
- **Pref ON (the default) -> prompt only when there is something to lose.** The only at-risk client state the app tracks is an open, unsaved inline cell edit (`cell-edit.ts` `hasUnsavedWebEdit()`). A survey of `state.ts` found no other unsaved work: every other flag is either in-flight-request bookkeeping (`refreshInFlight`, `heartbeatInFlight`) or server-backed/re-fetchable state, so there is nothing else to guard.

Justification for not making pref-ON unconditional despite the sub-label's wording: the default is ON, so an unconditional prompt would interrupt *every* refresh for *every* user of a debug tool that is reloaded constantly — a hostile default and a behavior change far beyond the bug. Browsers also suppress `beforeunload` dialogs when the page has had no user interaction, so "always prompt" cannot be delivered reliably in the first place.

### Follow-up left open (deliberately not done here)

`viewer.settings.format.confirmNavigateSub` ("Show a browser confirmation dialog when navigating away or closing the tab") over-promises against the semantics above; it should read "...when an inline edit is unsaved". The English source lives at `assets/web/l10n/strings-web-settings.ts:69` but the key is already translated into all ten locale files (`assets/web/l10n/web.*.json`), so editing the English alone would silently desync every translation. Left untouched: the string change plus its ten retranslations should land as one deliberate l10n pass.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** anyone who touches the toggle.
- **What is blocked:** nothing, but a persisted setting that does nothing erodes trust in the whole Settings panel.
- **Data risk:** none.
- **Frequency:** every navigation with an open edit.

---

## Fix Sketch

Decide the semantics first — the label says "confirm before navigating away", not "confirm when an edit is open". Recommended: the toggle gates the prompt; the prompt still fires only when there is something to lose (an unsaved edit), because unconditional `beforeunload` prompts are hostile and browsers throttle them.

```js
// The Settings toggle gates the leave-page prompt. It was rendered and
// persisted but never consulted here, so turning it off had no effect.
// Still prompt only when there is an unsaved edit: an unconditional
// beforeunload prompt is a nuisance and browsers suppress it anyway.
window.addEventListener('beforeunload', function (e) {
  if (!getPref(PREF_CONFIRM_NAVIGATE_AWAY, DEFAULTS[PREF_CONFIRM_NAVIGATE_AWAY])) return;
  if (!hasUnsavedWebEdit()) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
});
```

Update the toggle's description string in `assets/web/l10n/strings-web-settings.ts` to say when the prompt fires ("…when an inline edit is unsaved"). Rebuild `bundle.js`, commit it, and add a CHANGELOG `### Fixed` entry.


---

## Finish Report (2026-09-02)

Closed as part of a five-bug web-viewer batch (080-084). Consolidated record, including the
cross-cutting verification and the code-review round that followed the first pass:
`plans/history/2026.09/20260902/080-084-web-viewer-batch-report.md`.

### Verification applied to this fix

- `npm run build` — `bundle.js` and `style.css` regenerated from source; no generated file was
  hand-edited at any point.
- `npm run typecheck:web` — exit 0.
- `npm run test:web` — 338 tests, 338 pass, 0 fail.
- Extension mocha, full suite — 3151 passing, 0 failing. An earlier revision of this report
  described this run as "scoped to the 14 specs that assert on the changed sources". It was not
  scoped. `extension/.mocharc.yml` sets `spec: out/test/**/*.test.js`, and mocha *merges* CLI file
  arguments (and `--spec`) with that key rather than overriding it, so naming files on the command
  line ran the whole suite. The full suite passing is a stronger result than a scoped run, only a
  differently-described one.
- Extension mocha, genuinely scoped to the 15 specs that reference the changed web sources
  (`--no-config --no-package --require test/register-mock.js --timeout 5000`) — 303 passing,
  0 failing.
- `dart test test/html_content_test.dart test/web_viewer_nl_modal_contract_test.dart` — 41 passing.

### Defect and resolution

The "Confirm before navigating away" toggle persisted and re-rendered its state, but nothing read
it: the `beforeunload` guard prompted whenever an inline cell edit was unsaved and never
otherwise. The preference key and `getPref` were imported and unused.

The guard now reads the preference inside the handler rather than capturing it at startup, so a
change takes effect without a reload. Semantics, stated in the code: off means never prompt, even
with an unsaved edit; on prompts only when at-risk state exists. A survey of client state
established that the only unsaved work is an inline cell edit — everything else is in-flight
request bookkeeping or server-backed and re-fetchable.

Follow-up not taken here: the setting's sub-label promises broader behavior than the guard
delivers. The key is already translated across ten locale catalogs, so correcting the English
alone would desync them; it needs a deliberate localization pass.
