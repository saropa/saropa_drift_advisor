# Modularize three over-cap extension source files

The publish pipeline's quality gate (300-line file cap) flagged three TypeScript
files in the VS Code extension as over the limit. Each was split along a genuine
internal seam so every resulting file is under the cap with no behavior change.

## Finish Report (2026-06-24)

### Trigger
`scripts/publish.py` Step 7 (Quality Checks) reported three files exceeding the
300-line limit:
- `extension/src/server-discovery-core.ts` — 346 lines
- `extension/src/diagnostics/rules-config-html.ts` — 317 lines
- `extension/src/diagnostics/checkers/raw-sql-parser.ts` — 321 lines

### Changes

**server-discovery-core.ts (346 → 290).** Two cohesive units were extracted from
the `ServerDiscovery` class:
- `server-discovery-lost-debounce.ts` — new `ServerLostDebouncer` class owning the
  per-port grace-window timers (`_pendingLostTimers`) and the once-per-session
  warning latch (`_lostNotifiedThisSession`). Exposes `scheduleLost`,
  `cancelPending` (returns whether a timer was pending so the caller can stay
  silent on a flap recovery), `clearAll`, `reset`, and `hasNotified`. The host
  supplies `isRunning`, `graceMs`, and a `notifyLost` callback. Latch-before-notify
  ordering and the throttle-bypass (pass 0) are preserved.
- `server-discovery-state-machine.ts` — pure `nextDiscoveryState(prev, serverCount,
  aliveCount)` and `pollIntervalForState(state)`. Replaces the inline
  searching/backoff/connected transition block and the `_getInterval` switch.
  Pure and independently unit-testable (no timers/IO).

**diagnostics/rules-config-html.ts (317 → 164).** The inline panel CSS moved to
`rules-config-styles.ts` (`RULES_CONFIG_STYLES`) and the client `postMessage`
script moved to `rules-config-client.ts` (`RULES_CONFIG_CLIENT_SCRIPT`). The
builder now interpolates both constants into its `<style>` / `<script>` elements,
matching the pure-builder pattern of the other `*-html.ts` panels. The exported
builder `buildRulesConfigHtml` and its model types are unchanged.

**diagnostics/checkers/raw-sql-parser.ts (321 → 249).** The lexer — literal/comment
masking (`blankLiteralsAndComments`), the token regex, the `IToken` interface, and
`tokenize` — moved to `raw-sql-tokenizer.ts`. The parser imports them and retains
only table/column resolution. The exported `extractRawSqlColumnRefs` and
`IRawSqlColumnRef` are unchanged.

### Verification
- `tsc --noEmit -p ./` — exit 0.
- Full mocha suite — 2964 passing, 0 failing.
- All three target files plus the five new modules are under the 300-line cap
  (290 / 98 / 76 / 164 / 88 ... resulting files all < 300).
- No test imports the relocated internal symbols; public exports are unchanged, so
  existing tests required no edits.

### Risk
Low. Mechanical extraction of contiguous, cohesive blocks. The behavioral seams
(flap debounce ordering, backoff state transitions, found/lost notification gating)
were checked line-for-line against the originals.
