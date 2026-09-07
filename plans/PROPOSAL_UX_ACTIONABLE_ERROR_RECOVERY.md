# PROPOSAL: Classified, Actionable Failures — 125 Error Toasts, One Offers a Button

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

`extension/src/` contains 125 `vscode.window.showErrorMessage` calls. Exactly one passes an action
button. Every other failure — no server, wrong port, auth token mismatch, Android with no
`adb forward`, writes disabled, table dropped — lands as a dead-end string, even though the
extension already ships a command for each of those recoveries. Route failures through one
classifier that attaches the matching buttons.

**Wow: 6/10, Effort: Medium**

---

## Motivation

```bash
grep -rn "showErrorMessage" extension/src/ | grep -v /test/ | wc -l
# 125

grep -rn -A3 "showErrorMessage(" extension/src/ | grep -v /test/ \
  | grep -E "'(Open|Retry|Show|Fix|Diagnose|Connect|Help|Learn|Copy|Configure|Install|Add)[^']*'"
# extension/src/nl-sql/nl-sql-generation.ts-108-      'Retry',
```

One button, in NL-to-SQL. By contrast, `showWarningMessage` carries an action in 12 places — so the
codebase knows the pattern and just did not apply it to errors.

The typical shape (`extension/src/health/health-commands.ts`) is:

```ts
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  vscode.window.showErrorMessage(`Failed to fetch index suggestions: ${msg}`);
}
```

On a fresh install with no app running, the user reaches this from the palette and reads
`Failed to fetch index suggestions: connect ECONNREFUSED 127.0.0.1:8642`. Nothing tells them the
app must be running, and nothing offers the four commands that exist for exactly this:
`driftViewer.diagnoseConnection`, `driftViewer.showTroubleshooting`, `driftViewer.forwardPortAndroid`,
`driftViewer.showConnectionLog`. Those buttons *are* present in the empty-state welcome views
(`package.nls.json` → `viewsWelcome.2.contents`, `viewsWelcome.3.contents`) — so the guidance exists,
it just never reaches anyone who entered through a command instead of the sidebar.

The Android case is the sharpest: an emulator with no port forward produces the same `ECONNREFUSED`,
and `driftViewer.forwardPortAndroid` is one click away, but the toast does not mention it.

---

## Detection / Behavior

### Should flag (problematic)

Any command-level `catch` that formats an error into `showErrorMessage` with no action.

### Should pass (correct)

A single `reportFailure(err, context)` helper in, say, `extension/src/shared-utils.ts`, that
classifies and attaches buttons:

| Signal in the error / health state | Message | Buttons |
| --- | --- | --- |
| `ECONNREFUSED` / `ETIMEDOUT` / no discovery result | "No Drift debug server is running on 127.0.0.1:8642." | Diagnose Connection · Forward Port (Android) · Troubleshooting · Select Server |
| HTTP 401 / 403 | "The debug server rejected the request — auth token mismatch." | Open Settings (`driftViewer.authToken`) · Connection Log |
| `writeEnabled === false` | "This server started without a `writeQuery` callback." | Show wiring snippet · API docs |
| HTTP 429 | "Rate limited by the debug server." | Retry · Open Settings (`maxRequestsPerSecond`) |
| "Only read-only SQL is allowed" | "The server rejects non-SELECT SQL on `/api/sql`." | Open Explain · API docs |
| HTTP 404 on a route | "This server build predates the endpoint (server v{x}, extension v{y})." | Update package · Release notes |
| everything else | current text | Show Connection Log · Report Issue |

Version skew (last row) is available today: `GET /api/health` returns `version`, and
`extension/src/workspace-setup/add-package.ts` pins `PACKAGE_VERSION = '^4.2.5'` — the extension can
say "your app is on an older `saropa_drift_advisor`" instead of showing a 404.

---

## Edge Cases

1. **Do not spam.** Discovery already backs off and debounces "lost" events
   (`extension/src/server-discovery-lost-debounce.ts`); the classifier must dedupe by
   (class, command) within a short window so one bad poll cannot produce a toast storm — a symptom
   this repo has hit before with detected/lost notifications.
2. **Non-command call sites** (background pollers, watchers) must route to the output channel, not a
   toast; the helper needs a `surface: 'toast' | 'log'` argument.
3. **Never lose the raw error.** The classified message is the headline; the original string goes to
   the "Saropa Drift Advisor" output channel, which the bug-report template asks users to paste.
4. **Localization.** The new strings must go through `extension/src/l10n/` like the rest, not be
   inlined.
5. **Android detection.** Offer the forward-port button when a Flutter Android device is attached or
   when a previous forward was recorded (`extension/src/adb-forward-supervisor.ts`), not on every
   `ECONNREFUSED` on a desktop-only workspace.
6. **Do not classify by string matching alone** where a status code is available — prefer the HTTP
   status from the client layer over regexes on the message.

---

## Alternatives Considered

- **Add buttons ad hoc at the worst 10 call sites.** Leaves 115 dead ends and no invariant.
- **Rely on the welcome views.** They only render in the sidebar's empty state; a user who ran a
  command, opened a webview, or used a keybinding never sees them.
- **A "Diagnose" status-bar item instead of buttons.** Extra surface for the same information, and
  it does not appear at the moment of failure.

---

## Decision

---

## Implementation Notes

---

## Commits
