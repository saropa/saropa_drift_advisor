#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Standalone localization entry point for saropa_drift_advisor.

Runs the manifest localization audit on its own, separately from the publish
pipeline (which runs the same audit as Step 11 of its extension leg). Use this when
you just want to see localization coverage without starting a publish.

Usage::

    python scripts/l10n.py            # audit: write a report + print the coverage table (exit 0)
    python scripts/l10n.py audit      # same as above (explicit)
    python scripts/l10n.py check      # pre-publish / CI gate: exit 1 when any locale has gaps

What it does: reads extension/package.nls*.json, classifies each shipped locale
(missing / untranslated / translated), writes a JSON report under
reports/<YYYYMMDD>/, and prints a per-locale summary. With no locale bundles
(today's English-only state) it reports "nothing to translate" and exits 0.

What it does NOT do: translate. A machine-translation run (NLLB / Google) is a
separate, deliberate, operator-run step (plan 75 Phase 4) and is intentionally not
wired into this script. This audit only measures and reports.

Related dev commands (run from extension/): `npm run verify-nls` (key parity),
`npm run generate:nls-coverage` (rewrite the committed coverage snapshot),
`npm run verify:nls-coverage` (snapshot staleness gate).
"""

import sys
from pathlib import Path

# Put scripts/ on sys.path so `from modules ...` resolves regardless of the
# directory this script is invoked from (same pattern as publish.py).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from modules.l10n_audit import main

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
