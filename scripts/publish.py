#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unified publish pipeline for saropa_drift_viewer.

Supports both the Dart package (pub.dev) and VS Code extension
(Marketplace / Open VSX) from a single entry point.

Usage:
    python scripts/publish.py dart               # Dart package pipeline
    python scripts/publish.py extension           # Extension pipeline
    python scripts/publish.py all                 # Both targets
    python scripts/publish.py dart --analyze-only # Analysis only (no publish)

Exit codes match the ExitCode enum in modules/constants.py.
"""

import argparse
import subprocess
import sys

# Ensure colorama is available so modules.constants can init it on Windows.
try:
    import colorama  # noqa: F401
except ImportError:
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "colorama", "-q"],
        check=False,
        capture_output=True,
    )

from modules.constants import C, ExitCode, REPO_ROOT, EXTENSION_DIR
from modules.display import dim, heading, info, show_logo
from modules.utils import read_package_version


# ── CLI ──────────────────────────────────────────────────────

_CLI_FLAGS = [
    ("--analyze-only", "Run analysis + build + package only. No publish."),
    ("--yes", "Accept version without prompting (CI mode)."),
    ("--skip-tests", "Skip test steps."),
    ("--skip-extensions", "Skip VS Code extension checks."),
    ("--skip-global-npm", "Skip global npm package checks."),
    ("--auto-install", "Auto-install .vsix without prompting (CI)."),
    ("--no-logo", "Suppress the Saropa ASCII art logo."),
]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Drift Viewer -- Unified Publish Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "target",
        choices=["dart", "extension", "all"],
        help="Which target to build/publish.",
    )
    for flag, help_text in _CLI_FLAGS:
        parser.add_argument(flag, action="store_true", help=help_text)
    return parser.parse_args()


# ── Banner ───────────────────────────────────────────────────


def _print_banner(args: argparse.Namespace, target: str, version: str) -> None:
    """Print the script banner (logo or compact header)."""
    labels = {"dart": "Dart", "extension": "Extension", "all": "All Targets"}
    if not args.no_logo:
        show_logo(version)
    else:
        print(f"\n  {C.BOLD}Drift Viewer -- {labels[target]} Pipeline"
              f"{C.RESET}  {dim(f'v{version}')}")
    print(f"  Project root: {dim(REPO_ROOT)}")
    if target in ("extension", "all"):
        print(f"  Extension:    {dim(EXTENSION_DIR)}")


# ── Results ──────────────────────────────────────────────────


def _print_results(
    results: list[tuple[str, bool, float]],
    version: str,
    vsix_path: str | None = None,
) -> str | None:
    """Save report, print timing chart, return report path."""
    from modules.report import save_report, print_timing, print_report_path

    report = save_report(results, version or "unknown", vsix_path)
    print_timing(results)
    print_report_path(report)
    return report


# ── Exit Codes ───────────────────────────────────────────────

_STEP_EXIT_CODES = {
    # Shared
    "git": ExitCode.PREREQUISITE_FAILED,
    "GitHub CLI": ExitCode.PREREQUISITE_FAILED,
    "Working tree": ExitCode.WORKING_TREE_DIRTY,
    "Remote sync": ExitCode.REMOTE_SYNC_FAILED,
    "Git commit & push": ExitCode.GIT_FAILED,
    "Git tag": ExitCode.GIT_FAILED,
    "GitHub release": ExitCode.RELEASE_FAILED,
    # Dart
    "Dart SDK": ExitCode.PREREQUISITE_FAILED,
    "Flutter SDK": ExitCode.PREREQUISITE_FAILED,
    "Publish workflow": ExitCode.PREREQUISITE_FAILED,
    "Dart format": ExitCode.QUALITY_FAILED,
    "Dart tests": ExitCode.TEST_FAILED,
    "Dart analysis": ExitCode.QUALITY_FAILED,
    "Dart docs": ExitCode.QUALITY_FAILED,
    "Dart dry-run": ExitCode.QUALITY_FAILED,
    "Dart version": ExitCode.VERSION_INVALID,
    "pub.dev publish": ExitCode.PUBLISH_FAILED,
    # Extension
    "Node.js": ExitCode.PREREQUISITE_FAILED,
    "npm": ExitCode.PREREQUISITE_FAILED,
    "VS Code CLI": ExitCode.PREREQUISITE_FAILED,
    "vsce PAT": ExitCode.PREREQUISITE_FAILED,
    "Global npm pkgs": ExitCode.PREREQUISITE_FAILED,
    "VS Code extensions": ExitCode.PREREQUISITE_FAILED,
    "Dependencies": ExitCode.DEPENDENCY_FAILED,
    "Compile": ExitCode.COMPILE_FAILED,
    "Tests": ExitCode.TEST_FAILED,
    "File line limits": ExitCode.QUALITY_FAILED,
    "Version validation": ExitCode.VERSION_INVALID,
    "Package": ExitCode.PACKAGE_FAILED,
    "Marketplace publish": ExitCode.PUBLISH_FAILED,
    "Open VSX publish": ExitCode.OPENVSX_FAILED,
}


def _exit_code_from_results(
    results: list[tuple[str, bool, float]],
) -> int:
    """Derive exit code from the most recent failing step."""
    for name, passed, _ in reversed(results):
        if not passed:
            return _STEP_EXIT_CODES.get(name, 1)
    return 1


# ── Main ─────────────────────────────────────────────────────


def main() -> int:
    """Unified entry point: analyze → package → publish."""
    args = parse_args()
    target = args.target
    version = read_package_version()
    results: list[tuple[str, bool, float]] = []

    _print_banner(args, target, version)

    dart_version = ""
    ext_version = ""
    vsix_path: str | None = None

    # ── Analysis phase ──

    if target in ("dart", "all"):
        from modules.pipeline import run_dart_analysis

        dart_version, dart_ok = run_dart_analysis(args, results)
        if not dart_ok:
            _print_results(results, dart_version)
            return _exit_code_from_results(results)

    if target in ("extension", "all"):
        from modules.pipeline import run_ext_analysis, package_and_install

        ext_version, ext_ok = run_ext_analysis(args, results)
        if not ext_ok:
            _print_results(results, ext_version)
            return _exit_code_from_results(results)

        vsix_path = package_and_install(args, results, ext_version)
        if not vsix_path:
            return ExitCode.PACKAGE_FAILED

    # ── Analyze-only: stop here ──

    if args.analyze_only:
        v = ext_version or dart_version
        report = _print_results(results, v, vsix_path)
        if report and target in ("extension", "all"):
            from modules.ext_install import prompt_open_report

            prompt_open_report(report)
        return ExitCode.SUCCESS

    # ── Publish phase ──

    if target in ("extension", "all"):
        from modules.ext_publish import confirm_publish

        heading("Publish Confirmation")
        if not confirm_publish(ext_version):
            info("Publish cancelled by user.")
            return ExitCode.USER_CANCELLED

    if target in ("dart", "all"):
        from modules.pipeline import run_dart_publish

        if not run_dart_publish(dart_version, results):
            _print_results(results, dart_version)
            return _exit_code_from_results(results)

    if target in ("extension", "all"):
        from modules.pipeline import ask_publish_stores, run_publish
        from modules.ext_prereqs import get_installed_extension_versions

        stores = "both"
        if not get_installed_extension_versions():
            stores = ask_publish_stores()
        if not run_publish(ext_version, vsix_path, results, stores):
            _print_results(results, ext_version, vsix_path)
            return _exit_code_from_results(results)

    return ExitCode.SUCCESS


if __name__ == "__main__":
    sys.exit(main())
