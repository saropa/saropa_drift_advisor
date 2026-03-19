# -*- coding: utf-8 -*-
"""Optional saropa_lints scan step for the Drift Advisor pipeline.

Runs `dart run saropa_lints scan .` from the given directory (default repo root).
Integration is optional: if saropa_lints is not available or the scan fails,
the step records failure but callers can treat it as non-blocking (e.g. --skip-lint).
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from modules.constants import REPO_ROOT
from modules.utils import run


def _pubspec_has_saropa_lints(root: str) -> bool:
    """Return True if pubspec.yaml at root lists saropa_lints (dev_dependency)."""
    pubspec = os.path.join(root, "pubspec.yaml")
    if not os.path.isfile(pubspec):
        return False
    try:
        with open(pubspec, "r", encoding="utf-8") as f:
            content = f.read()
        return "saropa_lints" in content
    except OSError:
        return False


def run_saropa_lints_scan(
    cwd: str | None = None,
    dart_cmd: str = "dart",
) -> tuple[bool, str | None, float]:
    """Run saropa_lints scan in the given directory.

    Args:
        cwd: Working directory (project root). Defaults to REPO_ROOT.
        dart_cmd: Dart executable (default "dart").

    Returns:
        (success, report_path, elapsed_secs).
        report_path is the path to the generated scan report log if found; None otherwise.
    """
    root = os.path.abspath(cwd or REPO_ROOT)
    if not _pubspec_has_saropa_lints(root):
        return False, None, 0.0

    t0 = time.time()
    proc = run(
        [dart_cmd, "run", "saropa_lints", "scan", "."],
        cwd=root,
    )
    elapsed = time.time() - t0

    if proc.returncode != 0:
        return False, None, elapsed

    # saropa_lints typically writes to reports/<date>/<timestamp>_scan_report.log
    reports_dir = os.path.join(root, "reports")
    report_path = None
    if os.path.isdir(reports_dir):
        for date_dir in sorted(os.listdir(reports_dir), reverse=True):
            date_path = os.path.join(reports_dir, date_dir)
            if not os.path.isdir(date_path):
                continue
            for name in sorted(os.listdir(date_path), reverse=True):
                if name.endswith("_scan_report.log"):
                    report_path = os.path.join(date_path, name)
                    break
            if report_path:
                break

    return True, report_path, elapsed


def step_saropa_lints(
    results: list[tuple[str, bool, float]],
    cwd: str | None = None,
) -> tuple[bool, str | None]:
    """Run saropa_lints scan as a pipeline step. Appends (name, passed, elapsed) to results.

    Returns (passed, report_path). report_path is the path to the scan report log if found.
    """
    passed, report_path, elapsed = run_saropa_lints_scan(cwd=cwd)
    results.append(("Lint (saropa_lints)", passed, elapsed))
    return passed, report_path
