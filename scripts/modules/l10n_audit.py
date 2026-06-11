# -*- coding: utf-8 -*-
"""Publish-time localization audit for the VS Code manifest (System A, plan 75 §5.5).

Measures the manifest NLS bundles (``extension/package.nls*.json``) at publish time:
for every shipped locale, how many of the English keys are MISSING and how many are
present-but-UNTRANSLATED (value still equals English). Writes a timestamped JSON
report under ``reports/<YYYYMMDD>/`` (the same convention as the publish summary), and
— when gaps exist — lets the maintainer choose [I]gnore / [R]etry / [A]bort.

Why non-fatal: untranslated strings simply ship in English, which is acceptable for an
English-first release. Translating them is a SEPARATE, deliberate, operator-run step
(``translate_l10n.py``, plan §5.4) and is NEVER run at publish. This audit only reports
and gates on the maintainer's choice; it does not translate.

Scope: the MANIFEST (System A) only. The runtime l10n bundles (host/web) get their own
audit once that toolchain lands (plan Phase 4); this module covers what ships today.
"""

import json
import os
import re
import time
from datetime import datetime

from modules.constants import C, EXTENSION_DIR, REPO_ROOT
from modules.display import ask_choice, heading, info, ok, warn

# Matches a per-locale bundle (package.nls.<locale>.json) but NOT the English base
# (package.nls.json), which has no locale segment.
_LOCALE_FILE_RE = re.compile(r"^package\.nls\.([\w-]+)\.json$")

_STEP_NAME = "L10n manifest audit"


def audit_manifest_nls() -> dict:
    """Reads the manifest NLS bundles and classifies each locale.

    Returns a dict::

        {
          "total_keys": int,                # keys in the English base
          "locale_count": int,
          "locales": {                      # one entry per package.nls.<locale>.json
            "<locale>": {
              "translated": int, "missing": int, "untranslated": int, "pct": int,
            },
          },
          "has_gaps": bool,                 # any locale with missing or untranslated keys
        }
    """
    base_path = os.path.join(EXTENSION_DIR, "package.nls.json")
    with open(base_path, encoding="utf-8") as handle:
        base = json.load(handle)
    base_keys = list(base.keys())
    total = len(base_keys)

    locales: dict[str, dict] = {}
    for name in sorted(os.listdir(EXTENSION_DIR)):
        match = _LOCALE_FILE_RE.match(name)
        if not match:
            continue
        locale = match.group(1)
        with open(os.path.join(EXTENSION_DIR, name), encoding="utf-8") as handle:
            bundle = json.load(handle)
        # Missing: key absent entirely (verify-nls fails the build on this separately).
        # Untranslated: present but value still equals the English source.
        missing = sum(1 for key in base_keys if key not in bundle)
        untranslated = sum(
            1 for key in base_keys if key in bundle and bundle[key] == base[key]
        )
        translated = total - missing - untranslated
        pct = 100 if total == 0 else round(translated / total * 100)
        locales[locale] = {
            "translated": translated,
            "missing": missing,
            "untranslated": untranslated,
            "pct": pct,
        }

    has_gaps = any(d["missing"] or d["untranslated"] for d in locales.values())
    return {
        "total_keys": total,
        "locale_count": len(locales),
        "locales": locales,
        "has_gaps": has_gaps,
    }


def write_audit_report(audit: dict, now: datetime | None = None) -> str:
    """Persists the audit to ``reports/<YYYYMMDD>/<ts>_l10n_manifest_audit.json``.

    Colocated with the publish summary report (same date folder) so a maintainer
    finds both in one place. Returns the absolute report path.
    """
    now = now or datetime.now()
    date_str = now.strftime("%Y%m%d")
    ts = now.strftime("%Y%m%d_%H%M%S")
    reports_dir = os.path.join(REPO_ROOT, "reports", date_str)
    os.makedirs(reports_dir, exist_ok=True)
    path = os.path.join(reports_dir, f"{ts}_l10n_manifest_audit.json")

    payload = {
        "kind": "manifest-nls-audit",
        "total_keys": audit["total_keys"],
        "locale_count": audit["locale_count"],
        "locales": audit["locales"],
        "has_gaps": audit["has_gaps"],
        # State what the numbers do and do NOT prove, so the report cannot be read as
        # a translation-quality certificate (it only measures value-differs-English).
        "note": (
            "Counts manifest values that differ from English as 'translated'. "
            "A legitimate cognate identical to English reads as untranslated, so "
            "pct is a floor on remaining work, not a quality guarantee. Translating "
            "is a separate operator-run step (translate_l10n.py); publish never "
            "translates."
        ),
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    return path


def _print_summary(audit: dict, report_path: str) -> None:
    """Prints the per-locale coverage lines and where the full report lives."""
    if audit["locale_count"] == 0:
        info(
            f"  {audit['total_keys']} manifest strings; no locale bundles yet "
            f"(English-only) — nothing to translate."
        )
    else:
        info(f"  {audit['total_keys']} manifest strings across {audit['locale_count']} locale(s):")
        for locale, d in audit["locales"].items():
            flags = []
            if d["missing"]:
                flags.append(f"{d['missing']} missing")
            if d["untranslated"]:
                flags.append(f"{d['untranslated']} untranslated")
            suffix = f"  ({', '.join(flags)})" if flags else "  (complete)"
            info(f"    {locale:<7} {d['translated']:>4}/{audit['total_keys']}  {d['pct']:>3}%{suffix}")
    info(f"  Audit report: {C.WHITE}{report_path}{C.RESET}")


def step_l10n_audit(results: list[tuple[str, bool, float]]) -> bool:
    """Run the manifest l10n audit; on gaps, prompt [I]gnore / [R]etry / [A]bort.

    Returns True to proceed with the publish, False to abort. Always writes a report.
    With no locale bundles (today's English-only state) there are no gaps, so this
    runs silently and proceeds — the prompt only appears once locale files exist and
    are incomplete.
    """
    while True:
        start = time.time()
        audit = audit_manifest_nls()
        report_path = write_audit_report(audit)
        _print_summary(audit, report_path)

        if not audit["has_gaps"]:
            results.append((_STEP_NAME, True, time.time() - start))
            return True

        # Gaps exist: untranslated and/or missing keys in at least one shipped locale.
        warn("Localization gaps found in the VS Code manifest (package.nls.<locale>.json).")
        info("  These are non-fatal — untranslated strings ship in English.")
        info(f"  {C.BOLD}[I]gnore{C.RESET} — ship as-is; untranslated strings appear in English (safe for an English-first release)")
        info(f"  {C.BOLD}[R]etry{C.RESET}  — re-run this audit after updating package.nls.<locale>.json in another terminal")
        info(f"  {C.BOLD}[A]bort{C.RESET}  — stop the publish so you can close the gaps first")
        info(f"  (Translating is a separate operator-run step — translate_l10n.py — never run at publish.)")

        # Default 'ignore': Enter / EOF (non-interactive CI) proceeds rather than
        # hanging, and English-for-untranslated is the expected English-first outcome.
        choice = ask_choice(
            "How do you want to handle the localization gaps?",
            choices=("ignore", "retry", "abort"),
            default="ignore",
        )
        if choice == "ignore":
            warn("Ignoring l10n gaps; untranslated manifest strings ship as English.")
            results.append((_STEP_NAME, True, time.time() - start))
            return True
        if choice == "retry":
            warn("Re-running the localization audit...")
            continue
        # abort
        warn("Aborting publish to address localization gaps first.")
        results.append((_STEP_NAME, False, time.time() - start))
        return False


def main(argv: list[str] | None = None) -> int:
    """CLI for the standalone localization entry point (``scripts/l10n.py``).

    Runs the manifest l10n audit on its own, outside the publish pipeline. Unlike
    the publish step there is nothing to gate, so there is NO ignore/retry/abort
    prompt — this just reports and (in ``check`` mode) sets an exit code.

    Modes::

        audit  (default)  write the report + print the per-locale coverage summary; exit 0.
        check             same, but exit 1 when any shipped locale has gaps (pre-publish / CI gate).

    This entry NEVER translates. Translating is a separate, deliberate, operator-run
    step (plan 75 Phase 4) that is intentionally not wired here.
    """
    import argparse

    parser = argparse.ArgumentParser(
        prog="l10n",
        description="Saropa Drift Advisor — manifest localization audit (audits, never translates).",
    )
    parser.add_argument(
        "mode",
        nargs="?",
        default="audit",
        choices=("audit", "check"),
        help="audit: report only (default). check: exit non-zero when gaps exist.",
    )
    args = parser.parse_args(argv)

    heading("Manifest localization audit")
    audit = audit_manifest_nls()
    report_path = write_audit_report(audit)
    _print_summary(audit, report_path)

    if not audit["has_gaps"]:
        if audit["locale_count"] == 0:
            ok("English-only — no locale bundles to audit yet (nothing to translate).")
        else:
            ok("All shipped locales are fully translated.")
        return 0

    # Gaps exist. In 'audit' mode they are informational; in 'check' mode they fail.
    if args.mode == "check":
        warn("Localization gaps present (missing or untranslated manifest keys).")
        return 1
    info("  Gaps are non-fatal; translating is a separate operator-run step (never automatic).")
    return 0
