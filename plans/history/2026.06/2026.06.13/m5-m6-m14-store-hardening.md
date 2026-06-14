# Store hardening: import guards, corrupt-state tolerance, key collisions (audit M5/M6/M14)

Several persistence paths trusted their inputs. The snippet importer ran `JSON.parse` with no try/catch and iterated `data.snippets` without an array check, so a truncated or wrong-shaped import file threw a raw `SyntaxError` or "not iterable". The performance-baseline store transformed its persisted value in the constructor with no guard, so a corrupted/version-mismatched value broke store construction (and the panel) on load. The annotation store's persist wrote to the Memento with an unmarked floating promise. And `pkKey` (snapshot/branch/changelog row diffing) coerced every key component via `String(v ?? '')`, collapsing `null` vs `''` and `1` vs `'1'` to the same key, mis-pairing added/removed rows as matched.

## Finish Report (2026-06-13)

### Scope

(B) VS Code extension (TypeScript). No Dart, no Flutter, no docs beyond the changelog.

### What changed

- **`extension/src/snippets/snippet-store.ts`** (M5) — `importFrom` wraps `JSON.parse` in try/catch (clear "not valid JSON" error) and validates `Array.isArray(data.snippets)` before iterating.
- **`extension/src/debug/perf-baseline-store.ts`** (M5) — the constructor tolerates a non-array persisted value and filters out entries lacking a string `normalizedSql`, so corrupted state yields an empty store instead of throwing.
- **`extension/src/annotations/annotation-store.ts`** (M6) — `_persist` now wraps the Memento write in `void Promise.resolve(...).catch(() => {})` so a failed write can't become an unhandled rejection (the previously-unmarked floating promise).
- **`extension/src/timeline/snapshot-diff.ts`** (M14) — `pkKey` builds each component with `JSON.stringify(row[c] ?? null)` instead of `String(row[c] ?? '')`, so type and null-ness are preserved in the key.

### Scope note

The broader M6 item ("await every `Memento.update`") was deliberately NOT pursued as a global async ripple: the other stores already `void`-mark their writes, VS Code `Memento.update` is reliable and order-preserving within a single store, and making every store method async would change many signatures and call sites for marginal benefit. The one genuine floating-promise (annotation-store) is fixed; the rest remain intentional fire-and-forget. The snippet-store's per-op full-array read-modify-write (a theoretical race under concurrent edits) is also left as-is — annotations/snippets are user-driven single-actor edits.

### Verification

- `tsc --noEmit -p ./` — clean.
- Added: snippet import rejects non-JSON and non-array `snippets`; perf-baseline survives a non-array persisted value and drops entries missing `normalizedSql`; `pkKey` distinguishes `null`/`''` and `1`/`'1'`, is stable for equal keys, and treats missing == null. Existing store suites pass unchanged. Full extension suite passes (2747).

### Outstanding

The global await-Memento ripple and the snippet RMW race are noted above as intentionally out of scope.
