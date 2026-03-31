#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unified publish pipeline for saropa_drift_advisor.

Supports both the Dart package (pub.dev) and VS Code extension
(Marketplace / Open VSX) from a single entry point.

Usage:
    python scripts/publish.py                     # Interactive menu
    python scripts/publish.py all                 # Full pipeline (Dart + Extension)
    python scripts/publish.py dart                # Dart package only (pub.dev)
    python scripts/publish.py extension           # VS Code extension only (Marketplace)
    python scripts/publish.py analyze             # Full analysis without publishing
    python scripts/publish.py openvsx             # Republish existing .vsix to Open VSX
    python scripts/publish.py dart --bump minor   # Bump version before validation

Exit codes match the ExitCode enum in modules/constants.py.
"""

import argparse
import subprocess
import sys
from pathlib import Path

# Ensure the scripts/ directory is on sys.path so `from modules ...` works
# regardless of which directory the script is invoked from.
# Without this, running `python d:\src\...\scripts\publish.py` from another
# directory would fail to locate the `modules` package sitting beside this file.
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Ensure colorama is available so modules.constants can init it on Windows.
# colorama translates ANSI escape sequences into Win32 console calls, which
# is required for coloured output on the classic Windows terminal (cmd.exe).
# If the package is missing we install it silently before any module import
# that depends on it.
try:
    import colorama  # noqa: F401
except ImportError:
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "colorama", "-q"],
        check=False,
        capture_output=True,
    )

# Now that prerequisites are satisfied, import project modules.
# C provides colour/style constants (BOLD, CYAN, etc.), ExitCode is the
# canonical set of integer exit codes, and the two path constants point
# to the repository root and the VS Code extension sub-directory.
from modules.constants import C, ExitCode, REPO_ROOT, EXTENSION_DIR
from modules.display import (
    ask_yn, close_publish_log, dim, heading, info, open_publish_log, show_logo,
)

# Reusable cancellation message shown whenever the user aborts a publish.
MSG_PUBLISH_CANCELLED = "Publish cancelled by user."


# ── CLI ──────────────────────────────────────────────────────

# Registry of boolean CLI flags.
# Each tuple is (flag-name, help-text).  They are added to argparse
# dynamically in `parse_args()` so new flags only require a single edit here.
_CLI_FLAGS = [
    ("--analyze-only", "Run analysis + build + package only. No publish."),
    ("--yes", "Accept version without prompting (CI mode)."),
    ("--skip-tests", "Skip test steps."),
    ("--skip-lint", "Skip saropa_lints scan step (extension pipeline)."),
    ("--skip-extensions", "Skip VS Code extension checks."),
    ("--skip-global-npm", "Skip global npm package checks."),
    ("--auto-install", "Auto-install .vsix without prompting (CI)."),
    ("--no-logo", "Suppress the Saropa ASCII art logo."),
]

# Map of target names to human-readable descriptions.
# Ordering matters: the interactive menu number (1-N) is derived from
# insertion order, so "all" is always option 1.
_TARGETS = {
    "all": "Full pipeline: Dart package + VS Code extension (pub.dev & Marketplace)",
    "dart": "Dart package only: validate, test, and publish to pub.dev",
    "extension": "VS Code extension only: compile, package, and publish to Marketplace",
    "analyze": "Analysis only: run all checks and packaging without publishing",
    "openvsx": "Open VSX republish: upload existing .vsix to Open VSX registry",
}

# Pre-computed list of target keys for index-based lookup in the interactive
# menu (e.g. user types "2" → _TARGET_KEYS[1] → "dart").
_TARGET_KEYS = list(_TARGETS.keys())


def _prompt_target() -> str:
    """Interactively ask the user which target to publish.

    Displays a numbered menu of all available targets and loops until the
    user provides a valid selection (by number or by name).  Ctrl-C / EOF
    triggers a clean exit with USER_CANCELLED.
    """
    print(f"\n  {C.BOLD}Which target do you want to build/publish?{C.RESET}\n")

    # Print each target as a numbered, colour-coded menu item.
    for i, (key, desc) in enumerate(_TARGETS.items(), 1):
        print(f"    {C.CYAN}{i}{C.RESET}) {C.WHITE}{key:10}{C.RESET} {dim(desc)}")
    print()

    # Prompt in a loop until we get a valid answer.
    while True:
        try:
            choice = input(f"  {C.YELLOW}Enter choice (1-{len(_TARGETS)}): {C.RESET}").strip()
        except (EOFError, KeyboardInterrupt):
            # User pressed Ctrl-C or stdin closed — exit gracefully.
            print()
            sys.exit(ExitCode.USER_CANCELLED)

        # Accept a numeric index (1-based).
        if choice in {str(i) for i in range(1, len(_TARGETS) + 1)}:
            return _TARGET_KEYS[int(choice) - 1]

        # Also accept the target name directly (case-insensitive).
        if choice.lower() in _TARGET_KEYS:
            return choice.lower()

        # Invalid input — show an error hint and loop again.
        print(f"  {C.RED}Invalid choice. Please enter 1-{len(_TARGETS)} or a target name.{C.RESET}")


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments and return a Namespace.

    If no positional `target` argument is supplied on the command line,
    the user is prompted interactively via `_prompt_target()`.
    """
    parser = argparse.ArgumentParser(
        description="Saropa Drift Advisor -- Unified Publish Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Positional argument: target (optional — prompted if omitted).
    parser.add_argument(
        "target",
        nargs="?",
        choices=_TARGET_KEYS,
        default=None,
        help="Which target to build/publish (prompted if omitted).",
    )

    # Optional --bump flag to increment the version before validation.
    parser.add_argument(
        "--bump",
        choices=["patch", "minor", "major"],
        default=None,
        help="Bump version before validation (patch, minor, or major).",
    )

    # Dynamically register every boolean flag defined in _CLI_FLAGS.
    for flag, help_text in _CLI_FLAGS:
        parser.add_argument(flag, action="store_true", help=help_text)

    args = parser.parse_args()

    # Fall back to interactive prompt when no target was given.
    if args.target is None:
        args.target = _prompt_target()

    return args


# ── Target Info ──────────────────────────────────────────────


def _read_banner_version(target: str) -> str:
    """Read the version to display in the startup banner.

    For extension-related targets the version is the *maximum* of the Dart
    and extension versions (they can drift apart during development).  For
    Dart-only targets we read the Dart pubspec version directly.
    """
    if target in ("extension", "openvsx"):
        # Extension targets: show the highest version across both packages
        # so the banner is never misleadingly low.
        from modules.target_config import read_max_version
        return read_max_version()

    # Dart or combined targets: read the Dart pubspec.yaml version.
    from modules.target_config import DART, read_version
    return read_version(DART)


def _print_target_info(target: str, version: str) -> None:
    """Print target label, version, and relevant directory paths after the logo.

    Gives the user a clear summary of what is about to run before any
    long-running steps begin.
    """
    # Human-friendly labels for each target key.
    labels = {
        "all": "Full Pipeline",
        "dart": "Dart Package",
        "extension": "VS Code Extension",
        "analyze": "Analysis Only",
        "openvsx": "Open VSX Republish",
    }
    print(f"\n  {C.BOLD}{labels[target]}{C.RESET}  {dim(f'v{version}')}")
    print(f"  Project root: {dim(REPO_ROOT)}")

    # Only show the extension directory when the pipeline will actually use it.
    if target in ("extension", "all", "openvsx", "analyze"):
        print(f"  Extension:    {dim(EXTENSION_DIR)}")


# ── Results ──────────────────────────────────────────────────


def _print_results(
    results: list[tuple[str, bool, float]],
    version: str,
    vsix_path: str | None = None,
    lint_report_path: str | None = None,
) -> str | None:
    """Save a timestamped report, print the step-timing chart, and return
    the path to the saved report file.

    Parameters
    ----------
    results : list of (step_name, passed, elapsed_seconds)
        Accumulated pipeline results from every step that has run so far.
    version : str
        The release version string (used in the report filename).
    vsix_path : str or None
        Path to the packaged .vsix file, if one was produced.
    lint_report_path : str or None
        When the extension pipeline ran saropa_lints, this is the path to
        the scan report.  It gets copied into the reports/ folder and
        referenced in the summary so the user can review lint findings.
    """
    from modules.report import save_report, print_timing, print_report_path

    # Persist the report to disk (reports/YYYYMMDD/...).
    report = save_report(
        results, version or "unknown", vsix_path, lint_report_path=lint_report_path
    )

    # Print a visual bar chart of elapsed time per step.
    print_timing(results)

    # Print the absolute path to the saved report so the user can find it.
    print_report_path(report)
    return report


# ── Exit Codes ───────────────────────────────────────────────

# Maps each pipeline step name to the most appropriate ExitCode when that
# step fails.  This keeps exit-code logic centralised rather than scattered
# across individual step functions.  When a step fails, `_exit_code_from_results`
# looks up the failing step name here to determine the process exit code.
_STEP_EXIT_CODES = {
    # ── Shared steps (used by both Dart and Extension pipelines) ──
    "git": ExitCode.PREREQUISITE_FAILED,
    "GitHub CLI": ExitCode.PREREQUISITE_FAILED,
    "Working tree": ExitCode.WORKING_TREE_DIRTY,
    "Remote sync": ExitCode.REMOTE_SYNC_FAILED,
    "Git commit & push": ExitCode.GIT_FAILED,
    "Git tag": ExitCode.GIT_FAILED,
    "GitHub release": ExitCode.RELEASE_FAILED,

    # ── Dart-specific steps ──
    "Dart SDK": ExitCode.PREREQUISITE_FAILED,
    "Flutter SDK": ExitCode.PREREQUISITE_FAILED,
    "Publish workflow": ExitCode.PREREQUISITE_FAILED,
    "Web assets sync": ExitCode.QUALITY_FAILED,
    "Server constants version": ExitCode.QUALITY_FAILED,
    "Dart format": ExitCode.QUALITY_FAILED,
    "Dart tests": ExitCode.TEST_FAILED,
    "Dart analysis": ExitCode.QUALITY_FAILED,
    "Dart docs": ExitCode.QUALITY_FAILED,
    "Dart dry-run": ExitCode.QUALITY_FAILED,
    "Dart version": ExitCode.VERSION_INVALID,
    "pub.dev publish": ExitCode.PUBLISH_FAILED,

    # ── Extension-specific steps ──
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
    "Lint (saropa_lints)": ExitCode.QUALITY_FAILED,
    "Version validation": ExitCode.VERSION_INVALID,
    "Package": ExitCode.PACKAGE_FAILED,
    "Marketplace publish": ExitCode.PUBLISH_FAILED,
    "Open VSX publish": ExitCode.OPENVSX_FAILED,
}


def _exit_code_from_results(
    results: list[tuple[str, bool, float]],
) -> int:
    """Derive an exit code from the pipeline results.

    Walks the results list in *reverse* order so that the most recently
    recorded failure determines the exit code.  This is intentional: if
    multiple steps fail, the last one is typically the most actionable
    (earlier failures may cascade).

    Falls back to a generic exit code of 1 if the failing step name is
    not in `_STEP_EXIT_CODES` (should not happen, but guards against
    new steps being added without a mapping).
    """
    for name, passed, _ in reversed(results):
        if not passed:
            return _STEP_EXIT_CODES.get(name, 1)
    # No failures found — should not reach here if called after a failure,
    # but return 1 as a safe fallback.
    return 1


# ── Main ─────────────────────────────────────────────────────


def _run_analysis(args, target, results):
    """Run per-target analysis phases (Dart, Extension, or both).

    Returns a 5-tuple:
        dart_version  – version string read from pubspec.yaml (or empty)
        ext_version   – version string read from package.json (or empty)
        vsix_path     – filesystem path to the packaged .vsix (or None)
        ok            – True if all analysis steps passed
        ext_lint_report – path to the saropa_lints scan report (or None)

    Each sub-pipeline is imported lazily to keep startup fast and to avoid
    importing extension modules when only the Dart target is selected.
    """
    dart_version = ""
    ext_version = ""
    vsix_path = None
    ext_lint_report = None

    # ── Dart analysis leg ──
    if target in ("dart", "all"):
        from modules.pipeline import run_dart_analysis

        dart_version, dart_ok = run_dart_analysis(args, results)
        if not dart_ok:
            # Bail early — no point running the extension leg if Dart failed.
            return dart_version, ext_version, vsix_path, False, None

    # ── Extension analysis leg ──
    if target in ("extension", "all"):
        from modules.pipeline import run_ext_analysis, package_and_install

        ext_args = args
        if target == "all":
            # When running the full "all" pipeline the Dart leg has already
            # prompted the user to confirm the release version.  Duplicate
            # prompts are confusing, so we clone the args namespace and force
            # --yes for the extension leg to skip its own version prompt.
            import argparse as _argparse
            ext_args = _argparse.Namespace(**vars(args))
            ext_args.yes = True

        # Run extension-specific analysis (compile, tests, lint, etc.).
        ext_version, ext_ok, ext_lint_report = run_ext_analysis(ext_args, results)
        if not ext_ok:
            return dart_version, ext_version, vsix_path, False, None

        # Package the extension into a .vsix and optionally install it
        # locally so the developer can smoke-test before publishing.
        vsix_path = package_and_install(args, results, ext_version)
        if not vsix_path:
            # Packaging failed — report and bail.
            return dart_version, ext_version, vsix_path, False, None

    return dart_version, ext_version, vsix_path, True, ext_lint_report


def _confirm_dart_publish(version: str) -> bool:
    """Show a summary of what a Dart-only publish will do and ask for
    explicit confirmation before proceeding.

    Returns True if the user accepts, False otherwise.
    """
    print(f"\n  {C.BOLD}{C.YELLOW}Dart Publish Summary{C.RESET}")
    print(f"  {'-' * 40}")
    print(f"  Version: {C.WHITE}v{version}{C.RESET}")
    print(f"  Tag:     {C.WHITE}v{version}{C.RESET}")

    # List every irreversible action so the user knows exactly what will happen.
    print(f"\n  {C.YELLOW}This will:{C.RESET}")
    print("    1. Commit and push to origin")
    print(f"    2. Create git tag v{version}")
    print("    3. Trigger GitHub Actions publish to pub.dev")
    print("    4. Create GitHub release")
    print(f"\n  {C.RED}These actions are irreversible.{C.RESET}")

    # Default to "no" to prevent accidental publishes.
    return ask_yn("Proceed with publish?", default=False)


def _confirm_full_publish(dart_version: str, ext_version: str) -> bool:
    """Show a combined summary for the 'all' target (Dart + Extension)
    and ask for explicit confirmation.

    This is the "big red button" prompt — it covers two registries and
    multiple git tags, so we display as much detail as possible.

    Returns True if the user accepts, False otherwise.
    """
    from modules.constants import MARKETPLACE_EXTENSION_ID, REPO_URL, TAG_PREFIX

    # Extension tags use a distinct prefix (e.g. "ext-v") to avoid
    # colliding with Dart package tags (plain "v").
    ext_tag = f"{TAG_PREFIX}{ext_version}"

    print(f"\n  {C.BOLD}{C.YELLOW}Full Publish Summary{C.RESET}")
    print(f"  {'-' * 40}")

    # Dart section of the summary.
    print(f"\n  {C.CYAN}Dart Package (pub.dev){C.RESET}")
    print(f"    Version: {C.WHITE}v{dart_version}{C.RESET}")
    print(f"    Tag:     {C.WHITE}v{dart_version}{C.RESET}")

    # Extension section of the summary.
    print(f"\n  {C.CYAN}VS Code Extension (Marketplace){C.RESET}")
    print(f"    Version: {C.WHITE}v{ext_version}{C.RESET}")
    print(f"    Tag:     {C.WHITE}{ext_tag}{C.RESET}")
    print(f"    ID:      {C.WHITE}{MARKETPLACE_EXTENSION_ID}{C.RESET}")

    # Exhaustive list of side-effects.
    print(f"\n  {C.YELLOW}This will:{C.RESET}")
    print("    1. Commit and push to origin")
    print(f"    2. Create git tags v{dart_version} + {ext_tag}")
    print("    3. Publish Dart package to pub.dev (via GitHub Actions)")
    print("    4. Publish extension to VS Code Marketplace + Open VSX")
    print("    5. Create GitHub releases for both")
    print(f"\n  {C.RED}These actions are irreversible.{C.RESET}")

    # Default to "no" — safety first.
    return ask_yn("Proceed with publish?", default=False)


def _run_publish(target, dart_version, ext_version, vsix_path, results, ext_lint_report=None):
    """Execute the actual publish steps for the selected target(s).

    This function is called only after analysis has passed and the user
    has been shown a confirmation prompt.  Each target branch imports its
    publish module lazily and runs the relevant steps.

    Returns an ExitCode integer on failure, or None on success.
    """
    heading("Publish Confirmation")

    # ── Confirmation gates ──
    # Each target has its own confirmation function because the summary
    # details differ (tags, registries, side-effects).
    if target == "all":
        if not _confirm_full_publish(dart_version, ext_version):
            info(MSG_PUBLISH_CANCELLED)
            return ExitCode.USER_CANCELLED
    elif target == "dart":
        if not _confirm_dart_publish(dart_version):
            info(MSG_PUBLISH_CANCELLED)
            return ExitCode.USER_CANCELLED
    elif target == "extension":
        # Extension uses its own confirmation dialog from the ext_publish
        # module because it includes Marketplace-specific details.
        from modules.ext_publish import confirm_publish
        if not confirm_publish(ext_version):
            info(MSG_PUBLISH_CANCELLED)
            return ExitCode.USER_CANCELLED

    # ── Dart publish ──
    if target in ("dart", "all"):
        from modules.dart_publish import run_dart_publish
        if not run_dart_publish(dart_version, results):
            # Dart publish failed — print report and return the mapped exit code.
            _print_results(results, dart_version)
            return _exit_code_from_results(results)

    # ── Extension publish ──
    if target in ("extension", "all"):
        from modules.ext_publish import run_ext_publish
        if not run_ext_publish(ext_version, vsix_path, results):
            # Extension publish failed — include lint report in the summary
            # so the user can review any quality findings alongside the failure.
            _print_results(results, ext_version, vsix_path, lint_report_path=ext_lint_report)
            return _exit_code_from_results(results)

    # All publish steps succeeded.
    return None


def main() -> int:
    """Top-level entry point for the publish pipeline.

    Orchestrates the overall flow:
        1. Show the Saropa ASCII art logo (unless suppressed with --no-logo).
        2. Open the publish log file (tee'd alongside console output).
        3. Run the inner pipeline (analysis → package → publish).
        4. Guarantee the log file is closed even if an exception occurs.

    Returns an integer exit code suitable for `sys.exit()`.
    """
    # The --no-logo flag is checked via sys.argv *before* argparse runs so
    # the logo can be displayed (or not) before the argument parser fires.
    if "--no-logo" not in sys.argv:
        show_logo()

    # Open a log file that mirrors all console output for later review.
    open_publish_log()
    try:
        return _main_inner()
    finally:
        # Always close the log — even on unhandled exceptions — to flush
        # buffered output and release the file handle.
        close_publish_log()


def _run_openvsx_only() -> int:
    """Publish the most recently built .vsix to Open VSX without running
    the full analysis/build pipeline.

    This is a convenience shortcut for re-publishing to Open VSX after a
    Marketplace publish has already succeeded, e.g. when the Open VSX
    publish timed out or failed transiently.

    Returns an ExitCode integer.
    """
    import glob
    import os
    from modules.ext_prereqs import get_ovsx_pat
    from modules.ext_publish import publish_openvsx, _save_ovsx_pat_to_env

    # Find all .vsix files in the extension directory, sorted by
    # modification time so the most recent build is last.
    pattern = os.path.join(EXTENSION_DIR, "*.vsix")
    vsix_files = sorted(glob.glob(pattern), key=os.path.getmtime)

    if not vsix_files:
        from modules.display import fail
        fail(f"No .vsix found in {EXTENSION_DIR}. Run 'extension' target first.")
        return ExitCode.PACKAGE_FAILED

    # Use the newest .vsix file (last after sort-by-mtime).
    vsix_path = vsix_files[-1]
    info(f"Using: {os.path.basename(vsix_path)}")

    # Attempt to retrieve the Open VSX Personal Access Token from the
    # environment or a cached .env file.
    pat = get_ovsx_pat()
    if not pat:
        # No cached token — prompt the user to paste one interactively.
        try:
            import getpass
            info(f"Token page: {C.WHITE}https://open-vsx.org/user-settings/tokens{C.RESET}")
            pat = (getpass.getpass(
                prompt="  Paste Open VSX token: ",
            ) or "").strip()

            if pat:
                # Cache the token for this session and persist it to .env
                # so subsequent runs don't need to prompt again.
                os.environ["OVSX_PAT"] = pat
                _save_ovsx_pat_to_env(pat)
        except (EOFError, KeyboardInterrupt):
            # User cancelled the token prompt.
            pat = ""

    if not pat:
        from modules.display import fail
        fail("No OVSX_PAT. Cannot publish to Open VSX.")
        return ExitCode.PREREQUISITE_FAILED

    # Publish the .vsix to Open VSX and return the appropriate exit code.
    if publish_openvsx(vsix_path):
        return ExitCode.SUCCESS
    return ExitCode.OPENVSX_FAILED


def _main_inner() -> int:
    """Core pipeline logic: parse args → analyse → package → publish.

    Separated from `main()` so that log open/close can wrap it in a
    try/finally without cluttering the control flow.

    Returns an integer exit code.
    """
    args = parse_args()
    target = args.target

    # Read the version for the banner.  For "openvsx" and "analyze" targets
    # we display the extension version since those targets ultimately
    # operate on the extension artefact.
    version = _read_banner_version(target if target not in ("openvsx", "analyze") else "extension")

    # Accumulator for step results: each entry is (step_name, passed, elapsed_seconds).
    # Passed down through the pipeline so every step can append its outcome.
    results: list[tuple[str, bool, float]] = []

    # Show the user what we're about to do.
    _print_target_info(target, version)

    # ── Open VSX shortcut ──
    # The "openvsx" target is a special case that bypasses the full pipeline
    # and simply uploads an already-built .vsix.
    if target == "openvsx":
        return _run_openvsx_only()

    # ── Analyze-only mode ──
    # The "analyze" target is syntactic sugar for running the full "all"
    # pipeline with --analyze-only, which skips the publish phase.
    if target == "analyze":
        args.analyze_only = True
        target = "all"

    # ── Analysis phase ──
    # Run all pre-publish checks (formatting, tests, compilation, etc.).
    dart_ver, ext_ver, vsix_path, ok, ext_lint_report = _run_analysis(args, target, results)
    if not ok:
        # At least one analysis step failed — print the report and exit
        # with the appropriate non-zero exit code.
        _print_results(results, ext_ver or dart_ver, vsix_path, lint_report_path=ext_lint_report)
        return _exit_code_from_results(results)

    # ── Analyze-only early exit ──
    # When --analyze-only is set, we stop after analysis and never publish.
    if args.analyze_only:
        report = _print_results(
            results, ext_ver or dart_ver, vsix_path, lint_report_path=ext_lint_report
        )
        # Offer to open the HTML report in the browser (extension targets only).
        if report and target in ("extension", "all"):
            from modules.ext_install import prompt_open_report
            prompt_open_report(report)
        return ExitCode.SUCCESS

    # ── Publish phase ──
    # Analysis passed and we're not in analyze-only mode, so proceed to
    # the actual publish.  _run_publish handles confirmation prompts and
    # returns None on success or an ExitCode on failure.
    err = _run_publish(target, dart_ver, ext_ver, vsix_path, results, ext_lint_report)
    return err if err is not None else ExitCode.SUCCESS


# ── Script entry point ───────────────────────────────────────
# When executed directly (not imported), run the pipeline and propagate
# the exit code to the OS so CI systems can detect failures.
if __name__ == "__main__":
    sys.exit(main())
