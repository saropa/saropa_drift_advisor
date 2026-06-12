#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Runtime (System B) localization toolchain launcher (plan 75 §4).

Thin entry point: puts `scripts/` on `sys.path` and dispatches to
`modules.l10n.cli.main`. Distinct from `scripts/l10n.py`, which audits the
MANIFEST NLS (System A); this drives the RUNTIME l10n — the host/web symbolic-key
registries and their generated bundles.

Examples (full absolute paths recommended when handing a command to a user):
  python scripts/translate_l10n.py                       # audit (report, exit 0)
  python scripts/translate_l10n.py --run-mode audit --check   # CI gate on gaps
  python scripts/translate_l10n.py --run-mode sync       # build English baselines
  python scripts/translate_l10n.py --run-mode sync --dry-run

The deliberate translate pass is operator-gated and NEVER runs unattended
(plan 75 §7); it refuses without --confirm-translate and a named --locales list,
and performs no machine translation from this repository.
"""

import sys
from pathlib import Path

# Force UTF-8 console output so the em-dash / § / non-Latin sample text in summaries
# render cleanly on the Windows cp1252 terminal instead of as replacement glyphs.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:
        pass

# scripts/ on sys.path so `modules.l10n.*` imports resolve regardless of cwd.
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from modules.l10n.cli import main  # noqa: E402  (after sys.path setup)

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
