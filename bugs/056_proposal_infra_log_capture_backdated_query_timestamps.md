# PROPOSAL: Backdate Log Capture lines with the real query time so slow queries correlate with app logs

**Status: Open**

Created: 2026-09-02
Type: Infrastructure
Related diagnostics: none (integration surface — `extension/src/debug/log-capture-bridge.ts`)

---

## Summary

Drift Advisor writes slow-query and query lines into the Saropa Log Capture session, but stamps them with the wall-clock time of the *write*, not the time the query ran. Log Capture already accepts a `timestamp` override on `writeLine` for exactly this case, and Advisor already carries the query's real time in `QueryEntry.at`. Passing it through makes Advisor's DB events line up with the surrounding app logs instead of landing in a clump at flush time.

---

## Motivation

The Saropa Suite's headline cross-tool claim is temporal correlation — put the database event next to the log line that caused it:

```bash
$ sed -n '99,100p' ABOUT_SAROPA.md
- **[Saropa Suite](https://marketplace.visualstudio.com/items?itemName=saropa.saropa-suite)**
  - _One-click install_ for the full Saropa developer toolkit: Log Capture + Drift Advisor + Lints. Cross-extension integrations: bug reports embed lint findings, OWASP executive summaries, and project health scores; debug sessions carry query performance and schema context; right-click any SQL line in your logs to "Open in Drift Advisor."
```

That correlation is ordering-sensitive, and the ordering is currently wrong by however long Advisor's polling interval is.

### Advisor has the real timestamp

```bash
$ sed -n '64,76p' extension/src/api-types.ts
export interface QueryEntry {
  sql: string;
  durationMs: number;
  rowCount: number;
  at: string;
  /** Source file that issued this query (resolved from Dart stack trace). */
  callerFile?: string;
  /** Source line number that issued this query. */
  callerLine?: number;
  /** True when the query was issued by the extension itself (e.g.
   *  change-detection probes), not by the user's application code. */
  isInternal?: boolean;
}
```

`at` is the server-side query time.

### Advisor never passes it

```bash
$ grep -n "writeLine" extension/src/debug/log-capture-bridge.ts
97:    this._api.writeLine(
108:    this._api.writeLine(
117:    this._api.writeLine(`DRIFT LINK: ${msg}`, { category: 'drift-link' });
123:    this._api.writeLine(`DRIFT EDIT: ${msg}`, { category: 'drift-edit' });
131:    this._api.writeLine(`DRIFT: ${msg}`, { category: 'drift-perf' });
149:    this._api.writeLine(`DRIFT NL-QUERY ${payload}`, { category: 'drift-perf' });

$ sed -n '91,113p' extension/src/debug/log-capture-bridge.ts
  /** Write a slow-query alert line into the capture session. */
  writeSlowQuery(query: QueryEntry): void {
    if (!this._api) return;
    const mode = getLogMode();
    if (mode === 'off') return;

    this._api.writeLine(
      `\u26a0 DRIFT SLOW (${query.durationMs}ms): ${query.sql.slice(0, 200)}`,
      { category: 'drift-perf' },
    );
  }

  /** Write a query line (for 'all' mode). */
  writeQuery(query: QueryEntry): void {
    if (!this._api) return;
    if (getLogMode() !== 'all') return;

    this._api.writeLine(
      `DRIFT QUERY (${query.durationMs}ms): ${query.sql.slice(0, 200)}`,
      { category: 'drift-perf' },
    );
  }
```

`query.at` is in scope in both functions and is not used. Every option object carries `category` and nothing else.

### The reason it is never passed: Advisor's local type declaration omits the field

```bash
$ grep -n "writeLine" extension/src/debug/log-capture-api-types.ts
13:  writeLine(text: string, options?: { category?: string }): void;
```

Advisor keeps a local copy of Log Capture's API surface (correctly — it must not take a hard dependency on a sibling extension). That copy predates the `timestamp` option, so TypeScript would reject passing it today.

### Log Capture offers the field, and documents this exact scenario

```bash
$ sed -n '68,89p' D:/src/saropa-log-capture/src/api-types.ts
     * DAP-style category for the line.
     *
     * Standard categories: `'stdout'`, `'stderr'`, `'console'`.
     * Extensions may use custom categories (e.g. `'drift-perf'`).
     * Custom categories appear in the category filter dropdown.
     *
     * @default 'console'
     */
    readonly category?: string;

    /**
     * Override the timestamp for this line.
     *
     * Useful when the event occurred earlier than the write call
     * (e.g. the query finished 200ms ago but was batched).
     *
     * @default new Date()
     */
    readonly timestamp?: Date;
```

The doc comment's example — "the query finished 200ms ago but was batched" — is Advisor's exact situation, and even names Advisor's own category (`'drift-perf'`) two fields above it. The field appears to have been added for this consumer and has never been used by it.

---

## Detection / Behavior

### Should flag (problematic)

Current behavior. Advisor polls performance data, finds three slow queries that ran at `T+1.10s`, `T+1.40s`, and `T+1.95s`, and writes all three at `T+3.00s`. In the Log Capture viewer they appear as a contiguous block at `T+3.00s`, after the app log lines that describe what happened at `T+2.5s`. A developer reading the session sees the database work *after* the code that came later.

### Should pass (correct)

```ts
this._api.writeLine(
  `\u26a0 DRIFT SLOW (${query.durationMs}ms): ${query.sql.slice(0, 200)}`,
  { category: 'drift-perf', timestamp: new Date(query.at) },
);
```

Each line lands at the moment the query actually ran, interleaved with the app's own log lines.

---

## Edge Cases

1. **Older Log Capture without the `timestamp` option** — should pass. The field is optional and unknown extra properties on an options object are ignored at runtime by any reasonable implementation; the line still writes, just at flush time. No feature detection needed, but see Implementation Notes for the type-safe form.
2. **Unparseable or absent `query.at`** — should pass. `new Date(undefined)` and `new Date('garbage')` both yield an Invalid Date; guard with an `isNaN(d.getTime())` check and omit the option so the current behavior is the fallback, never a corrupt timestamp.
3. **Clock skew between the device and the host** — needs discussion. `at` is stamped by the Dart server, which may run on a phone whose clock differs from the developer's machine. A large skew would place lines outside the session window. Worth measuring before shipping; a sanity clamp to the session's own start/end bounds is the obvious mitigation.
4. **`writeConnectionEvent` / `writeDataEdit` / `writeTerminalLinkEvent`** — should pass unchanged. These are genuinely "now" events with no earlier origin time, so they should keep defaulting to the write time. Only the two query paths carry a real earlier timestamp.
5. **NL-to-SQL line (`log-capture-bridge.ts:149`)** — needs discussion. Whether the meaningful time is the generation or the execution depends on what that payload records; leave it alone until decided.

---

## Alternatives Considered

- **Embed the timestamp in the message text** (`DRIFT SLOW at 12:00:01.100 (…)`). Rejected: it renders but does not sort, filter, or align, which is the entire point. Log Capture's viewer orders by the line's timestamp, not by text.
- **Have the Dart server push lines directly into Log Capture.** Rejected: the server has no knowledge of the editor and this repo's architecture contract keeps it that way.
- **Do nothing and document the skew.** Rejected: the fix is a two-line change per call site against an API the sibling already ships.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

<!-- Fill in when work begins -->

1. Extend the local type in `extension/src/debug/log-capture-api-types.ts:13` to `writeLine(text: string, options?: { category?: string; timestamp?: Date }): void;`. This is a local declaration of a sibling's surface, not a dependency — no `package.json` change and no blast-radius approval needed.
2. In `writeSlowQuery` and `writeQuery`, build the option object from `query.at` with an Invalid-Date guard, falling back to omitting `timestamp`.
3. Leave the four non-query `writeLine` call sites unchanged.
4. Test in `extension/src/test/`: a fake `_api` capturing the options object, asserting `timestamp` equals `new Date(entry.at)` for a valid `at` and is absent for `at: 'garbage'`.
5. `CHANGELOG.md` under `[Unreleased]`.

---

## Commits

<!-- Add commit hashes as implementation lands -->
