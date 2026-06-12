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

from modules.l10n import actions, scopes

_MODULE_DIR = Path(__file__).resolve().parent
REPO_ROOT = _MODULE_DIR.parents[2]


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
