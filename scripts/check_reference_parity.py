#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reference-parity gate for the web viewer: design tokens and l10n placeholders.

Two defect classes, one script. Both are *dangling references* — a name is
written that nothing declares — and both are invisible to every existing gate
because both are syntactically valid and degrade silently at render time:

  1. DESIGN TOKENS. `var(--mono, ui-monospace, monospace)` is valid CSS even
     though no `--mono` token has ever existed. The browser takes the fallback
     and the element renders in the wrong face. Neither Sass nor the browser
     reports anything. That is bug 082 (`.nl-help-panel code`), which shipped
     for the entire life of the NL help panel.

  2. L10N PLACEHOLDERS. `vt()` substitutes a literal `{0}`. A translated value
     that lost its `{0}` — or carries machine-translation sentinel residue such
     as `_PH0__` where `{0}` belongs — is still a well-formed JSON string, still
     passes every key-coverage check, and renders literal garbage to the user.
     That is bug 085.

WHY ONE SCRIPT AND NOT TWO: the two halves share one rule ("every reference
must resolve to a declaration"), one source tree (`assets/web/`), one output
format, and one exit code, so the conductor wires one line instead of two.
`--only tokens` / `--only l10n` still runs either half alone, so a caller that
wants them separated is not blocked by the packaging choice.

--- HALF 1: DESIGN-TOKEN PARITY -------------------------------------------

Every `var(--token)` reference across `assets/web/*.scss` must resolve to a
`--token:` declaration somewhere in those same SCSS sources.

Deliberate handling of the known facts:

  * DECLARATIONS ARE NOT ONLY IN `_base.scss`/`_themes.scss`. `--tab-accent` is
    declared once per tab type in `_theme-midnight.scss` / `_theme-showcase.scss`
    as an inline `selector { --tab-accent: #5ec4c8; }`, and `--hb-read`,
    `--hb-warm`, `--read-heat`, `--write-heat`, `--tool-accent` are declared in
    their own component partials. Scanning only the two "token" partials, or
    anchoring the declaration pattern to the start of a line, would produce six
    false positives. So: all `*.scss` are scanned, and a declaration is any
    `--name:` whose preceding non-space character is `{`, `;`, `}`, `,` or the
    start of the file.

  * COMMENTS ARE STRIPPED FIRST, on both sides. `_sql-editor.scss` now carries a
    comment *quoting* the old `var(--mono, ...)` while explaining the bug 082
    fix. A naive scan re-reports the very defect the comment documents.

  * A FALLBACK IS IRRELEVANT TO THE CHECK. `var(--x, #fff)` with an undefined
    `--x` is exactly bug 082 — the fallback is what made it invisible. This
    gate treats a reference identically with or without a fallback.

  * RUNTIME-SET TOKENS ARE ALLOWLISTED WITH A REASON, NOT SPECIAL-CASED.
    `--app-sidebar-width` is legitimately never declared in SCSS:
    `sidebar-resize.ts` sets it on `#app-layout` at runtime. Silently skipping
    it would hide the day that assignment is deleted, so its allowlist entry
    carries `runtime_set_in`, and the gate FAILS if no `setProperty('--app-sidebar-width'`
    call can be found in `assets/web/*.ts`. The allowlist entry is therefore
    self-invalidating rather than a permanent blind spot.

  * THE SIX UNDECLARED COLOR TOKENS ARE DEBT, NOT DEFECTS TO GUESS AT.
    `--error`, `--warning`, `--accent`, `--bg-hover`, `--bg-secondary` and
    `--link-rgb` are referenced with literal fallbacks and never declared. They
    are a real design-system gap (bug 082's sweep; plan 82). Declaring them here
    would mean inventing color values and changing what renders, which is out of
    scope for a gate. They are allowlisted with a reason naming the tracking
    document, so the gate lands green and the debt is explicit and greppable
    (`grep -n "design-system gap" scripts/check_reference_parity.py`).

  * THE ALLOWLIST CAN ONLY SHRINK. An allowlisted token that has since been
    declared in SCSS is reported as a stale entry and FAILS the gate, so closing
    the design-system gap forces the allowlist to be trimmed rather than rot.

--- HALF 2: L10N PLACEHOLDER PARITY ---------------------------------------

Every value in the ten `assets/web/l10n/web.*.json` overlays must carry exactly
the same `{n}` index set as its English source.

  * THERE IS NO `web.en.json`. English lives in TypeScript:
    `assets/web/l10n/strings-web*.ts`, each exporting
    `Record<string, string>` object literals of `'key': 'value'` pairs with
    single-quoted, backslash-escapable strings, where a long value may sit on
    the line *after* its key. The parser strips comments, takes the text after
    `= {`, and matches a quoted key followed by `:` and a quoted value with a
    scanner that understands `\'`. It recovers 768 keys, exactly matching the
    768 keys in every JSON overlay — that 1:1 agreement is the parser's own
    correctness check and is printed on every run.

  * HOW THE GATE LANDS TODAY: GREEN, AGAINST A DATED BASELINE THAT CAN ONLY
    SHRINK. The current tree has 330 mismatched strings across all ten locales
    (bug 085 counted 108 because it grepped only for the `_PH0__` sentinel
    spellings; the wider damage is placeholders the MT engine *translated away*
    entirely, e.g. Italian `'{0} rows'` -> `'righe'`). A hard non-zero exit would
    make the gate un-wireable until bug 085 is fully repaired by hand — at which
    point it protects nothing in the meantime. Instead the 330 known-bad
    `locale::key` pairs are frozen in `l10n_placeholder_baseline.json` beside
    this script. Any NEW mismatch fails. Any baselined pair that has been fixed
    fails too, demanding its removal from the baseline. The baseline can only
    shrink, and `--update-baseline` never adds — it only prunes repaired entries.
    Deleting the file, or passing `--no-baseline`, gives the strict view.

  * THIS SCRIPT NEVER REPAIRS A TRANSLATION and never invokes a
    machine-translation tool. Bug 085 forbids another automated round-trip.

  * KEY-SET DRIFT IS REPORTED, NOT FAILED. A key present in English but not yet
    in an overlay is the normal state between adding a string and translating
    it; failing on it would block routine work. It is printed as an INFO line.

Usage:
    python scripts/check_reference_parity.py
    python scripts/check_reference_parity.py --only tokens
    python scripts/check_reference_parity.py --only l10n [--no-baseline]
    python scripts/check_reference_parity.py --only l10n --update-baseline
    python scripts/check_reference_parity.py --only l10n --budget 200
    python scripts/check_reference_parity.py --verbose

Exit code: 0 when every reference resolves (l10n judged against the baseline);
1 on any unresolved reference, stale allowlist/baseline entry, or parse failure.
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

# Repo root is one level up from this script's directory.
REPO_ROOT = Path(__file__).resolve().parent.parent

WEB_DIR = REPO_ROOT / "assets" / "web"
L10N_DIR = WEB_DIR / "l10n"
# Baseline of the bug-085 damage, kept beside this script so the pair is obvious.
BASELINE_FILE = Path(__file__).resolve().parent / "l10n_placeholder_baseline.json"

# ---------------------------------------------------------------------------
# Allowlist: tokens referenced by SCSS that are deliberately never declared
# there. Every entry MUST carry a reason — a bare name would be indistinguishable
# from the defect this gate exists to catch. `runtime_set_in` additionally makes
# the entry self-invalidating: the gate proves the runtime assignment still
# exists rather than trusting the comment.
# ---------------------------------------------------------------------------
TOKEN_ALLOWLIST: dict[str, dict[str, str]] = {
    "--app-sidebar-width": {
        "reason": (
            "Runtime-set, not a defect: sidebar-resize.ts assigns it on "
            "#app-layout as the user drags. _layout.scss documents the default "
            "in its var() fallback."
        ),
        # The gate greps assets/web/*.ts for setProperty on this token and fails
        # if the assignment is ever removed, so this is not a blind spot.
        "runtime_set_in": "assets/web/sidebar-resize.ts",
    },
    # --- design-system gap (bug 082 sweep; plan 82 "web-viewer-visual-system") ---
    # These six are referenced with deliberate literal fallbacks and have never
    # been declared. Substituting a guessed value would change rendered colors,
    # so they are recorded as debt rather than invented here. Each entry dies the
    # moment plan 82 declares the token — the stale-entry check enforces that.
    "--error": {
        "reason": (
            "design-system gap: referenced with literal fallbacks (#e53e3e / "
            "#e15759) in _history-sidebar.scss and _settings.scss; never "
            "declared. Declare in plans/82-web-viewer-visual-system.md, not here "
            "— guessing the value changes rendered colors."
        ),
    },
    "--warning": {
        "reason": (
            "design-system gap: referenced with the literal fallback #e67e22 in "
            "_masthead.scss and _heartbeat-screen.scss; never declared. "
            "Tracked by plans/82-web-viewer-visual-system.md."
        ),
    },
    "--accent": {
        "reason": (
            "design-system gap: _query-builder.scss falls back to var(--link); "
            "never declared. Tracked by plans/82-web-viewer-visual-system.md."
        ),
    },
    "--bg-hover": {
        "reason": (
            "design-system gap: _query-builder.scss and _schema-explorer.scss "
            "reference it with literal fallbacks; never declared. Tracked by "
            "plans/82-web-viewer-visual-system.md."
        ),
    },
    "--bg-secondary": {
        "reason": (
            "design-system gap: _data-table.scss references it with a literal "
            "fallback; never declared. Tracked by "
            "plans/82-web-viewer-visual-system.md."
        ),
    },
    "--link-rgb": {
        "reason": (
            "design-system gap: _settings.scss wants an RGB-triple companion to "
            "--link for rgba() composition; never declared. Tracked by "
            "plans/82-web-viewer-visual-system.md."
        ),
    },
}

# ---------------------------------------------------------------------------
# Shared lexical helpers
# ---------------------------------------------------------------------------

# `/* ... */` block comments, non-greedy, across lines.
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
# `//` line comments. Applied after block comments; SCSS and TS both use them.
LINE_COMMENT = re.compile(r"(?m)//[^\n]*")


def strip_comments(text: str) -> str:
    """Remove block and line comments, preserving line count for reporting.

    WHY line count is preserved: the token half reports file:line for every
    unresolved reference, and a comment-stripped copy with collapsed newlines
    would report the wrong line. Comment bodies are replaced by their own
    newlines rather than deleted.
    """

    def blank(match: re.Match[str]) -> str:
        return "\n" * match.group(0).count("\n")

    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub(blank, text))


# ---------------------------------------------------------------------------
# HALF 1 — design-token parity
# ---------------------------------------------------------------------------

# A reference: `var(--name` — the fallback, if any, is deliberately not captured
# because its presence is irrelevant to whether --name resolves (bug 082).
TOKEN_REF = re.compile(r"var\(\s*(--[A-Za-z0-9_-]+)")

# A declaration: `--name:` appearing where a property may start, i.e. right after
# a block open, a statement end, a block close, a comma, or the file start. This
# deliberately matches inline single-line rules such as
# `body.theme-midnight .tab-btn[data-tab-type="sql"] { --tab-accent: #b4c4ff; }`,
# which a line-anchored pattern would miss — six tokens are declared that way.
TOKEN_DECL = re.compile(r"(?:^|[{;},])\s*(--[A-Za-z0-9_-]+)\s*:")

# Runtime assignment from TypeScript: `style.setProperty('--app-sidebar-width', ...)`.
SET_PROPERTY = re.compile(r"setProperty\(\s*['\"](--[A-Za-z0-9_-]+)['\"]")


def scan_scss(verbose: bool) -> tuple[dict[str, list[str]], set[str], int]:
    """Return (references -> ["file:line", ...], declared tokens, files scanned)."""
    refs: dict[str, list[str]] = {}
    declared: set[str] = set()
    files = sorted(WEB_DIR.glob("*.scss"))

    for path in files:
        source = strip_comments(path.read_text(encoding="utf-8"))
        rel = path.name

        # Declarations are collected file-wide; a token declared in any partial
        # is defined for every other partial, because all partials compile into
        # one stylesheet.
        for match in TOKEN_DECL.finditer(source):
            declared.add(match.group(1))

        # References are collected with a line number so failures are actionable.
        for line_no, line in enumerate(source.splitlines(), start=1):
            for match in TOKEN_REF.finditer(line):
                refs.setdefault(match.group(1), []).append(f"{rel}:{line_no}")

    if verbose:
        print(f"  scanned {len(files)} SCSS files: "
              f"{len(refs)} distinct tokens referenced, {len(declared)} declared")
    return refs, declared, len(files)


def scan_runtime_set_tokens() -> set[str]:
    """Return tokens assigned at runtime via setProperty in assets/web/*.{ts,js}.

    Scans both .ts and .js because a setProperty call could live in either
    (e.g. app.js). Used to prove an allowlist entry that claims
    `runtime_set_in` is still true.
    """
    found: set[str] = set()
    for suffix in ("*.ts", "*.js"):
        for path in sorted(WEB_DIR.glob(suffix)):
            source = strip_comments(path.read_text(encoding="utf-8"))
            for match in SET_PROPERTY.finditer(source):
                found.add(match.group(1))
    return found


def check_tokens(verbose: bool) -> int:
    """Assert every var(--x) in the SCSS sources resolves. Returns 0 or 1."""
    print("== Design-token parity (assets/web/*.scss) ==")

    if not WEB_DIR.is_dir():
        print(f"ERROR: {WEB_DIR} not found", file=sys.stderr)
        return 1

    refs, declared, file_count = scan_scss(verbose)
    runtime_set = scan_runtime_set_tokens()

    ok = True

    # 1. Unresolved references that are not allowlisted — the bug-082 class.
    unresolved = sorted(set(refs) - declared - set(TOKEN_ALLOWLIST))
    if unresolved:
        ok = False
        print(f"\nFAIL: {len(unresolved)} token(s) referenced but never declared:",
              file=sys.stderr)
        for token in unresolved:
            sites = refs[token]
            print(f"  {token}", file=sys.stderr)
            for site in sites[:8]:
                print(f"      {site}", file=sys.stderr)
            if len(sites) > 8:
                print(f"      ... and {len(sites) - 8} more", file=sys.stderr)
        print("  A var() fallback does NOT make this safe — it is what hides it "
              "(bug 082).\n  Fix the name, declare the token, or allowlist it "
              "WITH A REASON in this script.", file=sys.stderr)

    # 2. Allowlist entries that are no longer needed — keeps the debt shrinking.
    stale = sorted(set(TOKEN_ALLOWLIST) & declared)
    if stale:
        ok = False
        print(f"\nFAIL: {len(stale)} allowlisted token(s) are now declared in "
              f"SCSS — remove them from TOKEN_ALLOWLIST:", file=sys.stderr)
        for token in stale:
            print(f"  {token}", file=sys.stderr)

    # 3. Allowlist entries nothing references any more — dead weight.
    unused = sorted(set(TOKEN_ALLOWLIST) - set(refs) - declared)
    if unused:
        ok = False
        print(f"\nFAIL: {len(unused)} allowlisted token(s) are no longer "
              f"referenced anywhere — remove them from TOKEN_ALLOWLIST:",
              file=sys.stderr)
        for token in unused:
            print(f"  {token}", file=sys.stderr)

    # 4. An entry claiming a runtime assignment must still have one. Without this
    #    the allowlist would silently outlive the code that justifies it.
    for token, entry in sorted(TOKEN_ALLOWLIST.items()):
        source_file = entry.get("runtime_set_in")
        if source_file and token not in runtime_set:
            ok = False
            print(f"\nFAIL: {token} is allowlisted as runtime-set by "
                  f"{source_file}, but no setProperty('{token}', ...) call "
                  f"exists in assets/web/*.ts. Either the assignment was "
                  f"removed (the token is now genuinely undefined) or it moved "
                  f"— update the allowlist.", file=sys.stderr)

    if verbose:
        print("\n  Allowlisted (referenced, intentionally undeclared):")
        for token, entry in sorted(TOKEN_ALLOWLIST.items()):
            print(f"    {token}: {entry['reason']}")

    if ok:
        print(f"OK: {len(refs)} tokens referenced across {file_count} SCSS files; "
              f"{len(refs) - len(TOKEN_ALLOWLIST)} resolve to a declaration, "
              f"{len(TOKEN_ALLOWLIST)} allowlisted with a reason "
              f"(1 runtime-set, {len(TOKEN_ALLOWLIST) - 1} design-system gap).")
    return 0 if ok else 1


# ---------------------------------------------------------------------------
# HALF 2 — l10n placeholder parity
# ---------------------------------------------------------------------------

# A quoted TypeScript string literal (single OR double), backslash escapes
# tolerated. Both the key and the value of a catalog entry use this form.
# Double-quote support prevents silently skipping entries that contain an
# apostrophe and were quoted with `"..."` instead of escaping it.
TS_STRING_SQ = r"'((?:[^'\\]|\\.)*)'"
TS_STRING_DQ = r'"((?:[^"\\]|\\.)*)"'
TS_STRING = rf"(?:{TS_STRING_SQ}|{TS_STRING_DQ})"
# `'key': 'value'` — arbitrary whitespace and newlines between them, because long
# values are wrapped onto the line after their key.
_TS_ENTRY = re.compile(TS_STRING + r"\s*:\s*" + TS_STRING)
# The interpolation token vt() understands. Only a literal `{n}` is substituted.
PLACEHOLDER = re.compile(r"\{(\d+)\}")
# Machine-translation sentinel residue, in every mangled spelling seen in the
# catalogs: `_PH0__`, `__PH0`, `ph0__`, `PH0`, `_ PH2__`, `__ PH3__`. Reported as
# a diagnostic breakdown only — the actual pass/fail rule is placeholder-set
# equality, which catches residue *and* placeholders translated away entirely.
# Word-boundary anchors prevent false positives on ordinary words that happen to
# contain "ph" followed by a digit (e.g. "paragraph1" → "aph1").
MT_RESIDUE = re.compile(r"(?<!\w)_{0,2}\s?[Pp][Hh]\s?\d_{0,2}(?!\w)")


def placeholder_set(value: str) -> frozenset[str]:
    """Return the set of `{n}` indices in a string.

    A SET, not a list: a locale may legitimately repeat or reorder a placeholder
    (`'{0} von {1}'` vs a language that needs `{0}` twice), but it may never
    introduce or lose one.
    """
    return frozenset(PLACEHOLDER.findall(value))


def load_english_catalog(verbose: bool) -> dict[str, str]:
    """Parse the English source strings out of the TypeScript catalogs.

    There is no web.en.json — English is authored as TypeScript
    `Record<string, string>` literals so the bundle carries an in-code fallback.
    Comments are stripped first (they quote example keys and `{0}` tokens), then
    everything after `= {` is scanned for quoted-key/quoted-value pairs.
    """
    catalog: dict[str, str] = {}
    files = sorted(L10N_DIR.glob("strings-web*.ts"))
    if not files:
        raise ValueError(f"No strings-web*.ts catalogs found in {L10N_DIR}")

    for path in files:
        source = strip_comments(path.read_text(encoding="utf-8"))
        # Everything before the object literal is imports and the export header.
        _, sep, body = source.partition("= {")
        if not sep:
            # A slice may legitimately be empty (`= {};`), which partitions away.
            continue
        count = 0
        # Each match has 4 groups: (sq_key, dq_key, sq_val, dq_val).
        # Exactly one of each pair is non-None depending on quote style.
        for match in _TS_ENTRY.finditer(body):
            key = match.group(1) or match.group(2)
            val = match.group(3) or match.group(4)
            catalog[key] = val
            count += 1
        if verbose:
            print(f"  {path.name}: {count} keys")

    return catalog


def load_baseline() -> dict:
    """Read the frozen bug-085 damage record, or an empty baseline if absent."""
    if not BASELINE_FILE.is_file():
        return {"_meta": {}, "known_bad": []}
    return json.loads(BASELINE_FILE.read_text(encoding="utf-8"))


def check_l10n(verbose: bool, use_baseline: bool, update_baseline: bool,
               strict: bool = False, budget: int | None = None) -> int:
    """Assert every locale value carries its English placeholder set.

    When strict=True, baselined mismatches also fail the gate — use in CI to
    enforce a "fix N baseline entries per sprint" policy.

    When budget is an integer, the gate fails if the number of baselined
    mismatches exceeds budget. This is a middle ground: the default ignores
    all baseline debt, --strict treats any debt as failure (budget=0), and
    --budget N lets CI enforce gradual shrinkage ("fix N per sprint").
    """
    print("== L10n placeholder parity (assets/web/l10n/) ==")

    if not L10N_DIR.is_dir():
        print(f"ERROR: {L10N_DIR} not found", file=sys.stderr)
        return 1

    try:
        english = load_english_catalog(verbose)
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    locale_files = sorted(L10N_DIR.glob("web.*.json"))
    if not locale_files:
        print(f"ERROR: no web.*.json catalogs in {L10N_DIR}", file=sys.stderr)
        return 1

    # `locale::key` pairs whose placeholder set differs from English.
    current_bad: set[str] = set()
    # Diagnostic detail keyed the same way, for the failure report.
    detail: dict[str, str] = {}
    per_locale: list[tuple[str, int, int, int]] = []
    info_lines: list[str] = []

    for path in locale_files:
        locale = path.name[len("web."):-len(".json")]
        try:
            values = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"ERROR: {path.name} is not valid JSON: {exc}", file=sys.stderr)
            return 1

        mismatched = 0
        residue = 0
        for key, value in values.items():
            english_value = english.get(key)
            if english_value is None:
                # Key-set drift is informational, not fatal — see module docstring.
                continue
            if placeholder_set(value) != placeholder_set(english_value):
                pair = f"{locale}::{key}"
                current_bad.add(pair)
                detail[pair] = (
                    f"EN {sorted(placeholder_set(english_value))} "
                    f"{english_value!r} -> {sorted(placeholder_set(value))} {value!r}"
                )
                mismatched += 1
            if MT_RESIDUE.search(value):
                residue += 1

        # Report key-set drift once per locale rather than once per key.
        missing = len(set(english) - set(values))
        extra = len(set(values) - set(english))
        if missing or extra:
            info_lines.append(
                f"  INFO {locale}: {missing} English key(s) not yet translated, "
                f"{extra} key(s) with no English source"
            )
        per_locale.append((locale, len(values), mismatched, residue))

    # --- per-locale table: the numbers bug 085's baseline needs ---
    print(f"\n  English source: {len(english)} keys from "
          f"{len(list(L10N_DIR.glob('strings-web*.ts')))} strings-web*.ts catalogs")
    print(f"  {'locale':<8} {'keys':>6} {'bad':>6} {'MT residue':>11}")
    for locale, total, mismatched, residue in per_locale:
        print(f"  {locale:<8} {total:>6} {mismatched:>6} {residue:>11}")
    print(f"  {'TOTAL':<8} {sum(p[1] for p in per_locale):>6} "
          f"{sum(p[2] for p in per_locale):>6} {sum(p[3] for p in per_locale):>11}")
    for line in info_lines:
        print(line)

    baseline = load_baseline()
    known_bad = set(baseline.get("known_bad", [])) if use_baseline else set()

    if update_baseline:
        # Prune only. A baseline that can grow is not a gate — new damage must
        # fail rather than be absorbed, so entries not already frozen are refused.
        added = sorted(current_bad - known_bad)
        if added:
            print(f"\nFAIL: --update-baseline refuses to ADD {len(added)} new "
                  f"mismatch(es). The baseline may only shrink. Fix these first:",
                  file=sys.stderr)
            for pair in added[:20]:
                print(f"  {pair}: {detail[pair]}", file=sys.stderr)
            return 1
        removed = sorted(known_bad - current_bad)
        baseline["known_bad"] = sorted(current_bad)
        baseline.setdefault("_meta", {})["last_pruned"] = date.today().isoformat()
        baseline["_meta"]["remaining"] = len(current_bad)
        BASELINE_FILE.write_text(
            json.dumps(baseline, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"\nOK: baseline pruned — {len(removed)} repaired entr(y/ies) "
              f"removed, {len(current_bad)} remaining.")
        return 0

    ok = True

    # 1. New damage: a mismatch that is not in the frozen bug-085 record.
    new_bad = sorted(current_bad - known_bad)
    if new_bad:
        ok = False
        print(f"\nFAIL: {len(new_bad)} translated string(s) do not carry their "
              f"English placeholder set:", file=sys.stderr)
        for pair in new_bad[:40]:
            print(f"  {pair}\n      {detail[pair]}", file=sys.stderr)
        if len(new_bad) > 40:
            print(f"  ... and {len(new_bad) - 40} more", file=sys.stderr)
        print("  vt() substitutes only a literal {n}; anything else renders "
              "verbatim to the user (bug 085).", file=sys.stderr)

    # 2. Repaired entries still frozen: force the baseline down as 085 is fixed.
    repaired = sorted(known_bad - current_bad)
    if repaired:
        ok = False
        print(f"\nFAIL: {len(repaired)} baselined string(s) are now correct. Run "
              f"`python scripts/check_reference_parity.py --only l10n "
              f"--update-baseline` to shrink the baseline:", file=sys.stderr)
        for pair in repaired[:20]:
            print(f"  {pair}", file=sys.stderr)
        if len(repaired) > 20:
            print(f"  ... and {len(repaired) - 20} more", file=sys.stderr)

    # 3. Compute surviving baseline debt only when a mode needs it.
    # --strict and --budget are mutually exclusive (argparse guards above),
    # but both inspect the same intersection, so compute it once here.
    if strict or budget is not None:
        still_bad = current_bad & known_bad
        still_bad_count = len(still_bad)

        # 4. Strict mode: baseline entries are also failures. This lets CI
        # enforce a "fix N entries per sprint" policy by failing when debt
        # remains.
        if strict and still_bad:
            ok = False
            still_bad_sorted = sorted(still_bad)
            print(f"\nFAIL (--strict): {still_bad_count} baselined mismatch(es) "
                  f"still present:", file=sys.stderr)
            for pair in still_bad_sorted[:20]:
                print(f"  {pair}", file=sys.stderr)
            if still_bad_count > 20:
                print(f"  ... and {still_bad_count - 20} more", file=sys.stderr)

        # 5. Budget mode: fail if baseline debt exceeds the allowed ceiling.
        # Unlike --strict (which is all-or-nothing), --budget N lets CI
        # ratchet down gradually — set N to (current - target_per_sprint)
        # each cycle.
        if budget is not None:
            if still_bad_count > budget:
                ok = False
                print(f"\nFAIL (--budget {budget}): {still_bad_count} baselined "
                      f"mismatch(es) remain (budget: {budget})", file=sys.stderr)
            else:
                # Budget satisfied — report the count so CI logs show progress.
                print(f"\n  {still_bad_count} baselined mismatch(es) remain "
                      f"(budget: {budget})")

    if ok:
        if known_bad:
            meta = baseline.get("_meta", {})
            print(f"\nOK: no new placeholder damage. {len(known_bad)} string(s) "
                  f"remain baselined against {meta.get('bug', 'bug 085')} "
                  f"(frozen {meta.get('frozen', 'unknown')}).")
        else:
            print("\nOK: every locale value carries its English placeholder set.")
    return 0 if ok else 1


# ---------------------------------------------------------------------------


def main() -> int:
    """CLI entry point — parse flags, reject invalid combos, run gate halves."""
    parser = argparse.ArgumentParser(
        description="Assert every var(--token) and every {n} placeholder in the "
                    "web viewer resolves to a real declaration."
    )
    parser.add_argument(
        "--only",
        choices=("tokens", "l10n"),
        help="Run only one half (default: both).",
    )
    parser.add_argument(
        "--no-baseline",
        action="store_true",
        help="Ignore the frozen bug-085 baseline and report every mismatch.",
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Prune repaired entries from the bug-085 baseline. Never adds.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail on baselined mismatches too, not just new ones. "
             "Use in CI to enforce baseline shrinkage.",
    )
    parser.add_argument(
        "--budget",
        type=int,
        metavar="N",
        default=None,
        help="Fail if baselined mismatch count exceeds N (exit 1), pass if "
             "<= N (exit 0). A middle ground between the permissive default "
             "(any baseline count passes) and --strict (budget=0). "
             "Equivalent to --strict when N is 0. "
             "Use in CI to enforce 'fix N entries per sprint' shrinkage.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-file counts and the full token allowlist.",
    )
    args = parser.parse_args()

    # --update-baseline prunes repaired entries from the l10n bug-085
    # baseline file; it has no meaning for the design-token half.
    if args.update_baseline and args.only == "tokens":
        parser.error("--update-baseline applies to the l10n half only.")
    # --no-baseline empties the known-bad set, so --update-baseline would
    # see every mismatch as "new" and unconditionally refuse to write.
    if args.update_baseline and args.no_baseline:
        parser.error("--update-baseline and --no-baseline are contradictory.")
    # --strict fails on baseline entries; --no-baseline ignores them — the
    # two together would fail on everything with no baseline context.
    if args.strict and args.no_baseline:
        parser.error("--strict and --no-baseline are contradictory.")
    # --strict reports remaining baseline entries as failures; --update-baseline
    # rewrites the baseline — combining them conflates two different actions.
    if args.strict and args.update_baseline:
        parser.error("--strict and --update-baseline are contradictory.")
    # --budget needs the baseline to count against; --no-baseline empties it,
    # so the count would always be zero and the budget meaningless.
    if args.budget is not None and args.no_baseline:
        parser.error("--budget and --no-baseline are contradictory — budget "
                     "counts baselined entries, but --no-baseline ignores them.")
    # --strict is equivalent to --budget 0; combining them is redundant and
    # ambiguous about which semantics the caller intended.
    if args.budget is not None and args.strict:
        parser.error("--budget and --strict are contradictory — --strict is "
                     "equivalent to --budget 0.")
    # --budget applies to the l10n baseline; it has no meaning for tokens.
    if args.budget is not None and args.only == "tokens":
        parser.error("--budget applies to the l10n half only.")
    # --budget sets a ceiling on allowed baseline debt; --update-baseline
    # rewrites the file — combining them conflates querying with mutating.
    if args.budget is not None and args.update_baseline:
        parser.error("--budget and --update-baseline are contradictory.")

    status = 0
    if args.only in (None, "tokens"):
        status |= check_tokens(args.verbose)
        if args.only is None:
            print()
    if args.only in (None, "l10n"):
        status |= check_l10n(
            args.verbose,
            use_baseline=not args.no_baseline,
            update_baseline=args.update_baseline,
            strict=args.strict,
            budget=args.budget,
        )
    return status


if __name__ == "__main__":
    sys.exit(main())
