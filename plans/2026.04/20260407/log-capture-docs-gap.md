# Log Capture Integration — Documentation Gap

**Status:** Done  
**Complexity:** Low  
**Risk:** None — documentation only, no code changes  
**Ref:** `saropa-log-capture/plans/SAROPA_DRIFT_ADVISOR_INTEGRATION.md` §2.3, §12  
**Last reviewed:** 2026-04-07 — all code references verified present

---

## Problem

The Log Capture integration code shipped in **ext-v0.3.0** and evolved through
later releases, but the changelog and README still describe only the original
bridge (headers, parallel fetch, shared helpers). Several user-facing features
are undocumented:

| Feature | Code location | Documented? |
|---------|--------------|-------------|
| `driftViewer.integrations.includeInLogCaptureSession` setting (`none` / `header` / `full`) | `extension/package.json`, `log-capture-utils.ts` | Setting exists in VS Code UI — not in changelog or README |
| Structured meta + sidecar at session end | `log-capture-bridge.ts` `_onSessionEnd` | No |
| Diagnostic issues in session export | `log-capture-bridge.ts`, `diagnostic-manager.ts` `getLastCollectedIssues()` | No |
| `getSessionSnapshot()` extension API on `context.exports` | `log-capture-api.ts`, `extension.ts` | No |
| `.saropa/drift-advisor-session.json` file contract | `log-capture-session-serialization.ts` | No |

Users who want to control what Drift Advisor contributes to Log Capture sessions
have no guidance beyond the setting's `markdownDescription` in `package.json`.

---

## Plan

### 1. CHANGELOG.md — add missing bullets to next release

Under the next release heading (currently `[3.0.0] - Unreleased` or a new
patch), add an **Improved** section (or append to existing) with:

```markdown
• **Log Capture session export** — When both extensions are installed and
  `driftViewer.integrations.includeInLogCaptureSession` is `full` (the default),
  session end now writes structured metadata (query stats, anomalies, schema
  summary, health, diagnostic issues) into the Log Capture session and a
  `{session}.drift-advisor.json` sidecar file. Set to `header` for lightweight
  headers only, or `none` to opt out entirely.

• **Log Capture extension API** — `getSessionSnapshot()` is now available on
  `context.exports` so Log Capture's built-in provider can request a snapshot
  directly without the file fallback.

• **Session file fallback** — `.saropa/drift-advisor-session.json` is written at
  session end for tools and scenarios where the extension API is unavailable.
```

### 2. README.md — expand Integrations section

Replace the current Log Capture bridge bullet (line 252):

```markdown
- **Saropa Log Capture bridge** — unified timeline, session headers/summaries,
  three verbosity modes (off / slow-only / all)
```

With:

```markdown
- **Saropa Log Capture bridge** — unified timeline with session
  headers/summaries and three verbosity modes (`off` / `slow-only` / `all`).
  When `driftViewer.integrations.includeInLogCaptureSession` is `full`
  (default), session end exports structured metadata (query performance,
  anomalies, schema, health, diagnostic issues) and a JSON sidecar file.
  Set to `header` for lightweight headers only, or `none` to disable.
```

### 3. Add setting to `extension/README.md` settings table

The settings table in `extension/README.md` (lines 73–92) is manually
maintained and does **not** include `driftViewer.integrations.includeInLogCaptureSession`.
Add a row:

```markdown
| `driftViewer.integrations.includeInLogCaptureSession` | `full` | Controls what Drift Advisor contributes to Log Capture sessions: `none` (opt out), `header` (lightweight headers only), `full` (structured metadata + sidecar file) |
```

---

## Acceptance

- [x] CHANGELOG entry covers meta/sidecar, `includeInLogCaptureSession`, issues, API, and session file
- [x] README Integrations section mentions the setting and structured export
- [x] `extension/README.md` settings table includes the setting (table is manual — row must be added)
- [x] No code changes
