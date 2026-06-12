# -*- coding: utf-8 -*-
"""CLI for the runtime l10n toolchain (plan 75 §4–§5). Dispatches the run-modes.

Usage (via `scripts/translate_l10n.py`):
  --run-mode audit                 classify + write a report (default)
  --run-mode audit --check         exit 1 when any shipped locale has gaps
  --run-mode sync [--dry-run]      build/align the English baselines (never MT)
  --run-mode import --import F --locales de [--web]   merge a hand-filled gaps file
  --run-mode translate --locales de,fr --scope gaps --confirm-translate
                                   the deliberate, operator-gated MT pass (refuses
                                   without confirmation; never runs MT from here)

`audit` and `sync` are always safe (no translation). `translate` is hard-gated
(plan 75 §7). The wall-clock timestamp is read here and passed down, so the audit
module itself stays deterministic.
"""

import argparse
from pathlib import Path
from typing import Callable, Sequence

from modules.l10n import actions, audit, scopes, sync

_MODULE_DIR = Path(__file__).resolve().parent
REPO_ROOT = _MODULE_DIR.parents[2]

# The ten translated locales (plan 75 §1.2) — the "all locales" preset so the
# interactive menu never makes the operator type the long list. English is the
# source and never a target.
TRANSLATED_LOCALES = [
    "de", "es", "fr", "it", "ja", "ko", "pt-br", "ru", "zh-cn", "zh-tw",
]


def _parse_locales(raw: str | None) -> list[str]:
    """Split a `de,fr,pt-br` argument into a clean lowercased tag list."""
    if not raw:
        return []
    return [tag.strip().lower() for tag in raw.split(",") if tag.strip()]


def build_parser() -> argparse.ArgumentParser:
    """Construct the argument parser (separated for unit testing)."""
    p = argparse.ArgumentParser(
        prog="translate_l10n.py",
        description="Runtime (System B) localization toolchain — audit, sync, "
                    "import, and the gated translate pass. Audit/sync never "
                    "translate; translate is operator-gated (plan 75 §7).",
    )
    p.add_argument("--run-mode", choices=["audit", "sync", "import", "translate"],
                   default="audit", help="which action to run (default: audit)")
    p.add_argument("--locales", default=None,
                   help="comma-separated locale tags (e.g. de,fr,pt-br)")
    p.add_argument("--scope", choices=list(scopes.ALL_SCOPES),
                   default=scopes.SCOPE_GAPS,
                   help="translate scope (default: gaps)")
    p.add_argument("--check", action="store_true",
                   help="audit only: exit 1 when any locale has gaps")
    p.add_argument("--dry-run", action="store_true",
                   help="sync only: report what would change, write nothing")
    p.add_argument("--import", dest="import_file", default=None,
                   help="import mode: path to a hand-filled gaps JSON")
    p.add_argument("--web", action="store_true",
                   help="import mode: target the web (symbolic-key) bundle")
    p.add_argument("--confirm-translate", action="store_true",
                   help="translate mode: explicit confirmation (still never runs "
                        "MT from this repo)")
    return p


# ── Interactive menu (no args, TTY) ───────────────────────────────────────────


def _resolve_menu_default(report: dict) -> tuple[str, str]:
    """Pick the menu default + a short hint from what the audit + sync state imply.

    Stale English baseline → sync; else gaps in any locale → translate gaps; else
    weak translations → upgrade; else (English-only / all clean) → audit only.
    """
    if not sync.base_bundle_is_current()["current"]:
        return "2", "sync the English baseline"
    if audit.has_gaps(report):
        return "3", "translate gaps, all locales"
    if any(loc["low_quality"] for loc in report["locales"]):
        return "5", "upgrade low-quality, all locales"
    return "1", "nothing outstanding"


def _print_menu(emit: Callable[[str], None]) -> None:
    """Print the numbered action menu."""
    from modules.display import heading

    heading("Localization actions")
    emit("  1  Audit only (write the coverage report)")
    emit("  2  Sync the English baseline (build host bundle, prune orphans)")
    emit("  3  Translate GAPS — all 10 locales")
    emit("  4  Translate GAPS — specific locales")
    emit("  5  Upgrade LOW-QUALITY → NLLB — all 10 locales")
    emit("  6  Upgrade LOW-QUALITY → NLLB — specific locales")
    emit("  0  Exit")


def _prompt_locales(emit: Callable[[str], None]) -> list[str]:
    """Ask for comma-separated locale tags; validate against the translated set."""
    from modules.display import C

    emit(f"  Available: {', '.join(TRANSLATED_LOCALES)}")
    try:
        raw = input(f"  {C.YELLOW}Locales (comma-separated): {C.RESET}").strip()
    except (EOFError, KeyboardInterrupt):
        return []
    codes = [c.strip().lower() for c in raw.split(",") if c.strip()]
    unknown = [c for c in codes if c not in TRANSLATED_LOCALES]
    if unknown:
        emit(f"  Unknown locale(s): {', '.join(unknown)}")
        return []
    return codes


def interactive_menu(
    emit: Callable[[str], None] = print,
    reports_dir: Path | None = None,
    timestamp: str = "interactive",
) -> int:
    """Show the audit summary, present the action menu, dispatch the choice.

    The deliberate translate options (3–6) prompt a y/N confirmation first
    (operator-gated, plan 75 §7) and still perform no machine translation until an
    engine is wired — they report what would be sent and stop. Audit (1) and sync
    (2) are always safe.
    """
    from modules.display import ask_choice, ask_yn

    reports_dir = reports_dir or (REPO_ROOT / "reports" / "interactive")

    report = audit.run_audit()
    emit(f"Runtime l10n — {report['source_keys']} source keys "
         f"({report['host_keys']} host + {report['web_keys']} web).")
    if report["english_only"]:
        emit("  English-only — no locale bundles on disk yet.")
    else:
        for loc in report["locales"]:
            emit(f"  {loc['locale']:>6}: {loc['coverage_pct']:5.1f}%  "
                 f"missing={loc['missing']} untranslated={loc['untranslated']} "
                 f"low={loc['low_quality']}")

    _print_menu(emit)
    default, hint = _resolve_menu_default(report)
    # ask_choice already renders "[1] (default), [2], …", so the question text
    # carries only the human hint — not a second "(default N)" that would double up.
    choice = ask_choice(
        f"Choice — {hint}",
        ("1", "2", "3", "4", "5", "6", "0"),
        default,
    )

    if choice == "0":
        return 0
    if choice == "1":
        return actions.run_audit_action(emit, reports_dir, timestamp)
    if choice == "2":
        return actions.run_sync_action(emit)

    # Translate / upgrade — deliberate, confirmed, gated.
    scope = scopes.SCOPE_GAPS if choice in ("3", "4") else scopes.SCOPE_LOW_QUALITY
    locales = TRANSLATED_LOCALES if choice in ("3", "5") else _prompt_locales(emit)
    if not locales:
        emit("Cancelled — no locales selected.")
        return 2
    if not ask_yn("This runs the deliberate machine-translation pass. Proceed?", default=False):
        emit("Cancelled.")
        return 2
    actions.run_sync_action(emit)  # always sync the baseline before translating
    return actions.run_translate_action(emit, locales, scope, confirmed=True)


def main(argv: Sequence[str] | None = None, emit: Callable[[str], None] = print) -> int:
    """Parse args and dispatch. Returns the chosen action's exit code."""
    args = build_parser().parse_args(argv)
    locales = _parse_locales(args.locales)

    # Wall-clock is read HERE (not in the audit module) so reports land in a dated
    # folder while the audit logic stays deterministic under test.
    from datetime import datetime

    now = datetime.now()
    reports_dir = REPO_ROOT / "reports" / now.strftime("%Y%m%d")
    timestamp = now.strftime("%Y%m%d_%H%M%S")

    if args.run_mode == "sync":
        return actions.run_sync_action(emit, dry_run=args.dry_run)
    if args.run_mode == "import":
        if not args.import_file or not locales:
            emit("import mode needs --import <file> and --locales <tag>.")
            return 1
        return actions.run_import_action(
            emit, Path(args.import_file), locales[0], is_web=args.web,
        )
    if args.run_mode == "translate":
        return actions.run_translate_action(
            emit, locales, args.scope, confirmed=args.confirm_translate,
        )
    # default: audit
    return actions.run_audit_action(
        emit, reports_dir, timestamp, locales or None, fail_on_gaps=args.check,
    )
