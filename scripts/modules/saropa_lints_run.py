# -*- coding: utf-8 -*-
"""Optional saropa_lints scan step for the Drift Advisor pipeline.

Runs `dart run saropa_lints scan .` from the given directory (default repo root).
Integration is optional: if saropa_lints is not available or the scan fails,
the step records failure but callers can treat it as non-blocking (e.g. --skip-lint).
"""

from __future__ import annotations

import os
import time
from modules.constants import REPO_ROOT
from modules.display import fail, info, warn
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

    # saropa_lints typically writes to reports/<date>/<timestamp>_scan_report.log
    # and may return non-zero when warnings are present. We only fail this step
    # when the generated report contains ERROR severity findings.
    report_path = _find_latest_scan_report(root)
    if proc.returncode == 0:
        return True, report_path, elapsed
    if report_path and not _scan_report_has_errors(report_path):
        return True, report_path, elapsed
    return False, report_path, elapsed


def _find_latest_scan_report(root: str) -> str | None:
    """Return the newest saropa_lints scan report path, if one exists."""
    reports_dir = os.path.join(root, "reports")
    if os.path.isdir(reports_dir):
        for date_dir in sorted(os.listdir(reports_dir), reverse=True):
            date_path = os.path.join(reports_dir, date_dir)
            if not os.path.isdir(date_path):
                continue
            for name in sorted(os.listdir(date_path), reverse=True):
                if name.endswith("_scan_report.log"):
                    return os.path.join(date_path, name)
    return None


def _scan_report_has_errors(report_path: str) -> bool:
    """Return True when report contains at least one ERROR-level issue."""
    try:
        with open(report_path, "r", encoding="utf-8") as report_file:
            for line in report_file:
                if "  ERROR " in line:
                    return True
    except OSError:
        return True
    return False


def _print_scan_warnings_and_errors(report_path: str) -> None:
    """Print WARNING and ERROR entries from a saropa_lints scan report.

    This surfaces actionable lint findings in the publish terminal output so
    the user can immediately see what failed (or what should be fixed next)
    without opening the report file manually.
    """
    current_file = ""
    warning_count = 0
    error_count = 0
    try:
        with open(report_path, "r", encoding="utf-8") as report_file:
            for raw_line in report_file:
                line = raw_line.rstrip("\n")
                # File section headers are plain paths without leading spaces.
                if line and not line.startswith((" ", "=", "─")) and ":" not in line:
                    current_file = line
                    continue
                if "  WARNING " in line:
                    warning_count += 1
                    if current_file:
                        warn(f"{current_file}")
                        current_file = ""
                    warn(line.strip())
                elif "  ERROR " in line:
                    error_count += 1
                    if current_file:
                        fail(f"{current_file}")
                        current_file = ""
                    fail(line.strip())
    except OSError as exc:
        warn(f"Could not read saropa_lints report: {exc}")
        return

    info(f"saropa_lints findings: {error_count} error(s), {warning_count} warning(s)")


def step_saropa_lints(
    results: list[tuple[str, bool, float]],
    cwd: str | None = None,
) -> tuple[bool, str | None]:
    """Run saropa_lints scan as a pipeline step. Appends (name, passed, elapsed) to results.

    Returns (passed, report_path). report_path is the path to the scan report log if found.
    """
    passed, report_path, elapsed = run_saropa_lints_scan(cwd=cwd)
    if report_path:
        _print_scan_warnings_and_errors(report_path)
    results.append(("Lint (saropa_lints)", passed, elapsed))
    return passed, report_path
