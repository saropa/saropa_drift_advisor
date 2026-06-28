# Bug Report

Status: Fixed

> **RESOLVED** — Fixed in `[Unreleased]`. `formatBadge` is now total-safe to ≤2 characters and the `FileDecoration` call site clamps any over-length label to `undefined` (keeping the tooltip). See the Resolution section at the bottom.

## Title

`DriftFileDecorationProvider` sets `FileDecoration.badge` to 3–4-character strings (`formatBadge` returns `"500"`, `"10K"`, `"999K"`, …), which VS Code rejects — flooding the extension-host log with hundreds of `INVALID decoration … 'badge'-property must be undefined or a short character` warnings on every badge refresh.

## Environment

- OS: Windows 11 Pro 10.0.22631 x64
- VS Code version: 1.126.0
- Extension version: saropa_drift_advisor ext-v4.1.14 (pubspec 4.1.14)
- Dart-Code (Dart/Flutter) extension: 3.136.1
- Workspace: `saropa_contacts` (a Drift project with many static-data tables in the hundreds-to-thousands of rows — e.g. `contacts`, `public_figures`, `emergency_services`).
- Relevant non-default settings: `driftViewer.fileBadges.enabled` = true (default). Drift debug server reachable so `schemaMetadata()` returns non-zero `rowCount`s.
- Connection method: Drift debug server inside the running app, reached on `127.0.0.1:8642`. (Unstable wireless link in this session causes frequent reconnects, which re-fire `refreshBadges()` and multiply the warning volume — see Impact.)

## Steps to Reproduce

1. Open a Drift workspace whose tables have row counts that are NOT 1–2 significant digits — i.e. any table with **100–999 rows**, or **≥ 9 500 rows** (see Minimal Reproducible Example for why those bands).
2. Ensure `driftViewer.fileBadges.enabled` is true (default) and the Drift debug server is reachable so `schemaMetadata()` returns real row counts.
3. Let the file-badge decorations refresh — happens on connect and on each of the `refreshBadges()` wiring triggers (`extension-activation-event-wiring.ts:102, 155, 217, 254`).
4. Open the extension-host log: Output panel → "Log (Extension Host)", or `…\Code\logs\<session>\window1\exthost\exthost.log`.

## Expected Behavior

Each `.dart` file that defines Drift tables gets a valid 1–2-character file-decoration badge (or no badge when the count can't be represented in 2 chars), with the full count in the decoration tooltip. No `INVALID decoration` warnings are logged.

## Actual Behavior

For every decorated file whose badge string exceeds 2 characters, VS Code rejects the decoration and logs:

```
[warning] INVALID decoration from extension 'saropa.drift-viewer': Error: The 'badge'-property must be undefined or a short character
```

Observed **hundreds of consecutive identical lines** in a single refresh burst (one per offending file, repeated on each refresh). The affected files also show **no badge at all** (the decoration is dropped, not truncated).

### Root cause (traced)

`FileDecoration.badge` is documented to be **at most two characters** (`vscode.d.ts`: "The badge should be at most two characters long."). `formatBadge` violates this for whole bands of inputs:

```ts
// file-decoration-provider.ts:8-13
export function formatBadge(n: number): string {
  if (n >= 999_500) return `${Math.round(n / 1_000_000)}M`; // "10M", "100M" -> 3-4 chars
  if (n >= 1_000)   return `${Math.round(n / 1_000)}K`;     // "10K".."999K" -> 3-4 chars
  return String(n);                                          // "100".."999" -> 3 chars
}
```

The value is passed straight into the decoration at `file-decoration-provider.ts:96-100`:

```ts
new vscode.FileDecoration(
  formatBadge(data.totalRows),   // <-- may be 3-4 chars
  data.lines.join('\n'),
)
```

Bands that produce an **invalid (≥3-char)** badge:

| `totalRows` | `formatBadge` output | length | valid? |
|---|---|---|---|
| 0–99 | `"0"`–`"99"` | 1–2 | ✅ |
| 100–999 | `"100"`–`"999"` | 3 | ❌ |
| 1 000–9 499 | `"1K"`–`"9K"` | 2 | ✅ |
| 9 500–999 499 | `"10K"`–`"999K"` | 3–4 | ❌ |
| 1 000 000–9 999 999 | `"1M"`–`"10M"` | 2–3 | mostly ❌ |

So any Drift table file totalling 100–999 rows, or ≥ ~9 500 rows, emits the warning. A schema with several such tables emits the warning once per file, per refresh.

## Error Output

```
2026-06-27 21:47:30.510 [warning] INVALID decoration from extension 'saropa.drift-viewer': Error: The 'badge'-property must be undefined or a short character
2026-06-27 21:47:30.511 [warning] INVALID decoration from extension 'saropa.drift-viewer': Error: The 'badge'-property must be undefined or a short character
…  (hundreds of identical lines in the same millisecond window)
```

Source: `…\Code\logs\20260627T214302\window1\exthost\exthost.log`.

## Emitter Attribution

The warning string itself is emitted by **VS Code core** when it validates a decoration an extension supplied — it is not an extension-authored log line. The *offending value* originates in this repo:

- Invalid value produced: `extension/src/decorations/file-decoration-provider.ts:8-13` (`formatBadge`, returns 3–4-char strings).
- Invalid value handed to VS Code: `extension/src/decorations/file-decoration-provider.ts:96-100` (`new vscode.FileDecoration(formatBadge(...), …)`).
- Refresh triggers (why it repeats): `extension/src/extension-providers.ts:176-211` (`refreshBadges`), called from `extension/src/extension-activation-event-wiring.ts:102, 155, 217, 254`.
- VS Code core validator that emits the warning (not this repo): the `FileDecoration` length check in `vs/workbench/api/common/extHostTypes` / `mainThreadDecorations`.

Grep commands used (run from `D:\src\saropa_drift_advisor`):

```
grep -rn "new vscode.FileDecoration" extension/src/   -> file-decoration-provider.ts:96
grep -rn "formatBadge" extension/src/                 -> file-decoration-provider.ts:8 (def), :97 (use); extension-providers.ts (re-export)
grep -rn "INVALID decoration" extension/src/          -> 0 matches (string is VS Code core, not this repo)
grep -rn "INVALID decoration" lib/                    -> 0 matches (no Dart emit path)
```

Mixed-language note: this is a TypeScript-only defect (`extension/src/`). No Dart (`lib/src/`) path is involved — file decorations are a VS Code API, not part of the Dart debug server. `grep -rn "FileDecoration" lib/` → 0 matches.

## Screenshots / Recordings

Not attached. The verbatim warning text and the source lines are above; the affected files render with no badge.

## Minimal Reproducible Example

Pure-function repro, no VS Code needed:

```ts
import { formatBadge } from './file-decoration-provider';
for (const n of [99, 100, 999, 1000, 9499, 9500, 12345, 999499, 1_000_000, 10_000_000]) {
  const b = formatBadge(n);
  console.log(n, JSON.stringify(b), b.length, b.length <= 2 ? 'OK' : 'INVALID');
}
// 100 -> "100" INVALID ; 999 -> "999" INVALID ; 9500 -> "10K" INVALID ;
// 12345 -> "12K" INVALID ; 999499 -> "999K" INVALID ; 10_000_000 -> "10M" INVALID
```

A unit test should assert `formatBadge(n).length <= 2` for all `n >= 0`. It fails today for the bands in the root-cause table.

## What I Already Tried

- [x] Read `file-decoration-provider.ts` — confirmed `formatBadge` is the source of the >2-char value and that it is passed unguarded to `FileDecoration`.
- [x] Confirmed the warning string is VS Code core, not extension code (grep → 0 matches in this repo).
- [x] Confirmed no Dart emit path.
- [ ] Did not modify any `saropa_drift_advisor` code (cross-repo — filing this report).

## Regression Info

- Last working version: not bisected. The defect is structural in `formatBadge` (the `K`/`M` and 3-digit branches were never 2-char-safe), so it has likely existed since file badges were added.
- First broken version: not bisected.

## Impact

- Who is affected: any Drift workspace with tables outside the 1–2-significant-digit / `1K`–`9K` / `1M`–`9M` row bands — i.e. most real schemas.
- What is blocked: (1) the row-count badges silently DON'T render on the affected files (the feature is broken for exactly the large tables it's most useful for); (2) the extension-host log is flooded with hundreds of warnings per refresh, which obscures real diagnostics.
- Data risk: none.
- Frequency: every badge refresh; multiplied by every `refreshBadges()` trigger. On an unstable connection that reconnects frequently, refreshes fire repeatedly and the log volume compounds.

### Possible relationship to the extension-host crash loop (UNVERIFIED — flagged for the maintainer)

In the session that surfaced this, the VS Code **extension host was crash-looping** (~7 native crashes in one evening; `main.log`: `Extension host … crashed with code -1073741795 / 3221225501` = `0xC000001D` STATUS_ILLEGAL_INSTRUCTION; 7 minidumps in `Code\Crashpad\reports\` matching the exthost exit times 1:1). This `saropa.drift-viewer` badge-warning flood is the **last extension activity logged before each crash**, on a cadence matching the crash periodicity.

**This is correlation, not proven causation.** An invalid-decoration warning is a JS-level validation reject and cannot by itself produce a native illegal-instruction crash. The badge bug is filed here on its own merits (broken feature + log spam). Whether `saropa.drift-viewer` (or one of its native dependencies) is the faulting module in the host crash is **not established** — it requires resolving a minidump's exception record (`windbg -z <dump>` → `!analyze -v`) against symbols. Do not assume this badge bug is the crash root cause without that resolution; do not assume it isn't.

## Suggested Fix (for the maintainer — not applied here)

Make `formatBadge` total-safe to ≤2 characters; the full count already lives in the decoration tooltip (`data.lines.join('\n')`), so the badge only needs to signal magnitude. Options:

1. Single-char magnitude buckets that always fit 2 chars: `<1K → up to "99"` then `"k"`, `"M"`, `"B"` style — e.g. return `String(n)` only for `n < 100`; `"k"`/`"M"`/`"B"` (or `"+"`) for larger magnitudes; never a multi-digit + suffix combo. Keeps a glyph on every table file without ever exceeding 2 chars.
2. Cap multi-digit values with a single-character overflow marker (e.g. `n > 99 → "+"`), full number in the tooltip.
3. Defensive guard at the call site regardless of `formatBadge`: clamp/skip the badge when `badge.length > 2` so an out-of-band value can never reach `FileDecoration` again.

Recommend (1) + (3): (1) restores a meaningful badge on every table file; (3) makes a future regression in `formatBadge` impossible to leak into the log. Add the `formatBadge(n).length <= 2` unit test from the Minimal Reproducible Example to lock it.

## Resolution

Applied the recommended Option 1 + Option 3, plus the locking unit test.

**1. `formatBadge` rewritten to be total-safe (`file-decoration-provider.ts`).** The badge now signals magnitude within two characters; the full per-table counts already live in the tooltip. Rule:

| `totalRows` | badge | length |
|---|---|---|
| 0–99 | `"0"`–`"99"` (exact) | 1–2 |
| 100–999 | `"1H"`–`"9H"` | 2 |
| 1 000–9 999 | `"1K"`–`"9K"` | 2 |
| 10 000–999 999 | `"K"` | 1 |
| 1 000 000–9 999 999 | `"1M"`–`"9M"` | 2 |
| ≥ 10 000 000 | `"M"` / `"B"` | 1 |

Key points: `Math.floor` (not `Math.round`) is used so 9 500 stays `"9K"` instead of overflowing to the 3-char `"10K"`; a leading significant digit is shown when it is 1–9 of the unit, otherwise the bare unit letter; non-finite / non-positive inputs return `"0"`.

**2. Defensive call-site guard (`file-decoration-provider.ts` `refresh`).** The label is checked before construction; if it ever exceeds two characters the badge is set to `undefined` (the decoration and its tooltip are still emitted). A future regression in `formatBadge` can no longer leak an oversized badge into VS Code or the log.

**3. Test lock (`test/file-decoration-provider.test.ts`).** Added `it('never produces a badge longer than two characters')` asserting `formatBadge(n).length <= 2` across the full range of bands, plus updated the band-specific expectations. Scoped run: 17 passing.

Released in CHANGELOG `[Unreleased]`.

## Finish Report (2026-06-27)

- Root cause confirmed exactly as traced in the report: `formatBadge` produced 3–4-char strings for the 100–999 and ≥9 500 row bands, passed unguarded to `vscode.FileDecoration`, which VS Code rejects (≤2 chars) — dropping the decoration and logging one `INVALID decoration` warning per offending file per refresh.
- Fix: TypeScript-only, two files changed under `extension/src/` (`decorations/file-decoration-provider.ts` for the function + call-site guard; `test/file-decoration-provider.test.ts` for the tests). No Dart path involved, consistent with the report's mixed-language note.
- Verification: compiled clean (`tsc -p ./`, exit 0); scoped mocha on the single spec (`--no-config --require ./test/register-mock.js out/test/file-decoration-provider.test.js`) → 17 passing, including the new ≤2-char property test.
- The "possible relationship to the extension-host crash loop" remains UNVERIFIED and is out of scope for this fix — it requires resolving a minidump exception record, which this change does not address. This fix stands on its own merits (broken badge feature + log flood), as the report states.
