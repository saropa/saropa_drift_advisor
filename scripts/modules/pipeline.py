# -*- coding: utf-8 -*-
"""Pipeline orchestration: analysis and publish step sequencing."""

from __future__ import annotations

import argparse
import os
import shutil
import time
from typing import TYPE_CHECKING

from modules.constants import ABOUT_SAROPA_PATH, C, CHANGELOG_PATH, EXTENSION_DIR, REPO_ROOT
from modules.display import ask_choice, heading, info, ok, warn
from modules.utils import run_step

if TYPE_CHECKING:
    from modules.target_config import TargetConfig


# ── Changelog Sync ────────────────────────────────────────


def sync_extension_changelog() -> bool:
    """Copy root CHANGELOG.md to extension/ for VS Code Marketplace.

    The Marketplace uses extension/CHANGELOG.md when displaying version history.
    This ensures the extension changelog stays in sync with the root changelog.
    """
    ext_changelog = os.path.join(EXTENSION_DIR, "CHANGELOG.md")
    try:
        shutil.copy2(CHANGELOG_PATH, ext_changelog)
        ok(f"Synced CHANGELOG.md → extension/CHANGELOG.md")
        return True
    except OSError as e:
        from modules.display import fail
        fail(f"Failed to sync changelog: {e}")
        return False


def sync_extension_about() -> bool:
    """Copy root ABOUT_SAROPA.md to extension/ for the About Saropa command.

    The extension bundles this file so the (i) icon in the Database header
    can open the company overview in VS Code's markdown preview.
    """
    ext_about = os.path.join(EXTENSION_DIR, "ABOUT_SAROPA.md")
    try:
        shutil.copy2(ABOUT_SAROPA_PATH, ext_about)
        ok("Synced ABOUT_SAROPA.md → extension/ABOUT_SAROPA.md")
        return True
    except OSError as e:
        from modules.display import fail
        fail(f"Failed to sync about file: {e}")
        return False


# ── Shared Helpers ───────────────────────────────────────


def _validate_version_step(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
    config: "TargetConfig",
    step_label: str,
) -> tuple[str, bool]:
    """Run version validation for a target. Returns (version, ok)."""
    from modules.checks_version import apply_bump, validate_version_changelog

    heading(step_label)

    # Apply --bump before validation so the bumped version is what gets validated.
    bump = getattr(args, "bump", None)
    if bump:
        if not run_step(
            f"{config.display_name} bump",
            lambda: apply_bump(bump, config),
            results,
        ):
            return "", False

    if getattr(args, "yes", False):
        os.environ["PUBLISH_YES"] = "1"
    t0 = time.time()
    version, version_ok = validate_version_changelog(config=config)
    elapsed = time.time() - t0
    results.append((f"{config.display_name} version", version_ok, elapsed))
    if not version_ok:
        return "", False
    return version, True


def _commit_and_tag(
    config: "TargetConfig",
    version: str,
    results: list[tuple[str, bool, float]],
    label: str,
) -> bool:
    """Commit, push, and tag for a target. Skips if tag exists.

    Logs which paths will be staged so the operator can verify scope,
    and provides clear skip/proceed messages for each sub-step.
    """
    from modules.git_ops import is_version_tagged, git_commit_and_push, create_git_tag

    tag = f"{config.tag_prefix}{version}"
    tagged = is_version_tagged(version, config.tag_prefix)
    if tagged:
        heading(f"{label} Git Commit & Push")
        info(f"Tag {tag} already exists — skipping commit and tag.")
        heading(f"{label} Git Tag")
        info(f"Skipped (tag {tag} exists).")
        return True

    heading(f"{label} Git Commit & Push")
    if not run_step("Git commit & push",
                    lambda: git_commit_and_push(config, version), results):
        return False
    heading(f"{label} Git Tag")
    if not run_step("Git tag",
                    lambda: create_git_tag(config, version), results):
        return False
    return True


# ── Extension Analysis ───────────────────────────────────


def _run_ext_prerequisites(
    results: list[tuple[str, bool, float]],
) -> bool:
    """Extension prerequisite checks (Node, npm, git, VS Code CLI)."""
    from modules.ext_prereqs import check_node, check_npm, check_vscode_cli
    from modules.checks_git import check_git

    heading("Step 1 \u00b7 Prerequisites")
    for name, fn in [
        ("Node.js", check_node),
        ("npm", check_npm),
        ("git", check_git),
        ("VS Code CLI", check_vscode_cli),
    ]:
        if not run_step(name, fn, results):
            return False
    return True


def _run_ext_dev_checks(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Extension dev environment + git state checks."""
    from modules.ext_prereqs import check_global_npm_packages, check_vscode_extensions
    from modules.checks_git import check_working_tree, check_remote_sync
    from modules.ext_build import ensure_dependencies

    if getattr(args, "skip_global_npm", False):
        heading("Step 2 \u00b7 Global npm Packages (skipped)")
    else:
        heading("Step 2 \u00b7 Global npm Packages")
        if not run_step("Global npm pkgs", check_global_npm_packages, results):
            return False

    if getattr(args, "skip_extensions", False):
        heading("Step 3 \u00b7 VS Code Extensions (skipped)")
    else:
        heading("Step 3 \u00b7 VS Code Extensions")
        if not run_step("VS Code extensions", check_vscode_extensions, results):
            return False

    # When running the "all" target the Dart leg already checked the working
    # tree and remote sync, so skip these to avoid a duplicate prompt.
    if getattr(args, "_skip_git_state", False):
        heading("Step 4 \u00b7 Working Tree (already checked)")
        ok("Checked during Dart analysis")
        heading("Step 5 \u00b7 Remote Sync (already checked)")
        ok("Checked during Dart analysis")
    else:
        heading("Step 4 \u00b7 Working Tree")
        # analyze / --analyze-only must not show "publish will push" copy.
        will_publish = not getattr(args, "analyze_only", False)
        if not run_step(
            "Working tree",
            lambda: check_working_tree(will_publish=will_publish),
            results,
        ):
            return False

        heading("Step 5 \u00b7 Remote Sync")
        if not run_step("Remote sync", check_remote_sync, results):
            return False

    heading("Step 6 \u00b7 Dependencies")
    if not run_step("Dependencies", ensure_dependencies, results):
        return False

    return True


def _run_ext_build_and_validate(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> tuple[str, bool, str | None]:
    """Extension compile, test, quality, and version steps.

    Returns (version, all_passed, lint_report_path). lint_report_path is set when
    the saropa_lints step runs and produces a report file.
    """
    from modules.ext_build import step_compile, step_test, check_file_line_limits
    from modules.target_config import EXTENSION

    heading("Step 7 \u00b7 Quality Checks")
    if not run_step("File line limits", check_file_line_limits, results):
        return "", False, None

    lint_step_name = "Lint (saropa_lints)"
    lint_report_path: str | None = None
    if getattr(args, "skip_lint", False):
        heading("Step 8 \u00b7 Lint (saropa_lints) (skipped)")
        results.append((lint_step_name, True, 0.0))
    else:
        # Run lint before compile/tests so warnings surface earlier in long runs.
        heading("Step 8 \u00b7 Lint (saropa_lints)")
        from modules.saropa_lints_run import step_saropa_lints
        while True:
            passed, lint_report_path = step_saropa_lints(results, cwd=REPO_ROOT)
            if passed:
                break

            # Preserve only the final lint disposition so reports and exit code
            # reflect the user's final choice (retry/skip/abort).
            if results and results[-1][0] == lint_step_name:
                results.pop()

            choice = ask_choice(
                "Lint step failed. Choose what to do next",
                choices=("retry", "skip", "abort"),
                default="retry",
            )
            if choice == "retry":
                warn("Retrying saropa_lints scan...")
                continue
            if choice == "skip":
                warn("Skipping saropa_lints after failure by user choice.")
                results.append((lint_step_name, True, 0.0))
                break
            return "", False, None

    heading("Step 9 \u00b7 Compile")
    if not run_step("Compile", step_compile, results):
        return "", False, None

    if getattr(args, "skip_tests", False):
        heading("Step 10 \u00b7 Tests (skipped)")
    else:
        heading("Step 10 \u00b7 Tests")
        while True:
            if run_step("Tests", step_test, results):
                break

            # Preserve only the final test disposition so reports and exit
            # code reflect the user's final choice (retry/skip/abort).
            if results and results[-1][0] == "Tests":
                results.pop()

            choice = ask_choice(
                "Extension tests failed. Choose what to do next",
                choices=("retry", "skip", "abort"),
                default="retry",
            )
            if choice == "retry":
                warn("Retrying extension tests...")
                continue
            if choice == "skip":
                warn("Continuing despite test failures by user choice.")
                results.append(("Tests (skipped)", True, 0.0))
                break
            # abort
            return "", False, None

    # Localization audit (System A, plan 75 \u00a75.5): measure manifest NLS coverage,
    # write a report under reports/<YYYYMMDD>/, and let the maintainer ignore / retry
    # / abort on gaps. Non-fatal \u2014 untranslated strings ship as English; translating
    # is a separate operator-run step, never run at publish. With no locale bundles
    # (today's English-only state) there are no gaps, so this proceeds silently.
    heading("Step 11 \u00b7 Localization audit")
    from modules.l10n_audit import step_l10n_audit
    if not step_l10n_audit(results):
        return "", False, lint_report_path

    # Runtime (System B) translation audit + baseline check (plan 75 \u00a75.5). The
    # audit classifies every shipped locale against the runtime registries and writes
    # a timestamped JSON report under reports/<YYYYMMDD>/ (same convention as the
    # manifest audit and the publish summary). The sync check then verifies the
    # committed host base bundle (`l10n/bundle.l10n.json`) is current vs the
    # registries. Both are READ-ONLY here \u2014 they NEVER translate and the sync runs
    # dry-run only, so a publish never dirties the working tree (plan 75 \u00a75.5/\u00a77).
    # Gaps are a warning, not a gate \u2014 English-first release; translating is a
    # separate operator-run step (the translation util below), never run at publish.
    _sync_start = time.time()
    try:
        import sys as _sys
        from datetime import datetime as _datetime
        from pathlib import Path as _Path

        from modules.constants import SCRIPT_DIR
        from modules.l10n import audit as _runtime_audit
        from modules.l10n.cli import TRANSLATED_LOCALES
        from modules.l10n.sync import base_bundle_is_current, run_sync as _runtime_sync

        # Audit the ten TARGET locales (not just locales already on disk) so an
        # English-only project correctly reports everything still to translate
        # rather than "nothing to translate" because no bundles exist yet. The
        # wall-clock is read here and passed down so the audit module stays
        # deterministic (same split the standalone launcher uses).
        _now = _datetime.now()
        _reports_dir = _Path(REPO_ROOT) / "reports" / _now.strftime("%Y%m%d")
        _audit_report = _runtime_audit.run_audit(TRANSLATED_LOCALES)
        _audit_path = _runtime_audit.write_report(
            _audit_report, _reports_dir, _now.strftime("%Y%m%d_%H%M%S")
        )

        info(
            f"  Runtime l10n: {_audit_report['source_keys']} source keys "
            f"({_audit_report['host_keys']} host + {_audit_report['web_keys']} web) "
            f"across {len(TRANSLATED_LOCALES)} target locale(s):"
        )
        for _loc in _audit_report["locales"]:
            info(
                f"    {_loc['locale']:>6}: {_loc['coverage_pct']:5.1f}%  "
                f"missing={_loc['missing']} untranslated={_loc['untranslated']} "
                f"low={_loc['low_quality']}"
            )
        # The audit report URL \u2014 a full filesystem path the maintainer can open.
        info(f"  Audit report: {C.WHITE}{_audit_path}{C.RESET}")

        # Full ABSOLUTE-path command (running interpreter + script) so the
        # maintainer can open the translation util's interactive menu by
        # copy-paste regardless of cwd or which Python is on PATH. This publish
        # step only reports coverage; the util is where the separate,
        # operator-gated translate pass is actually run (plan 75 \u00a77).
        _translate_util = os.path.join(SCRIPT_DIR, "translate_l10n.py")
        info(f"  Translation util: {C.WHITE}{_sys.executable} {_translate_util}{C.RESET}")

        # Baseline currency check (dry-run, never rewrites the tree).
        _status = base_bundle_is_current()
        if _status["current"]:
            ok(f"Runtime l10n baseline current ({_status['expected']} host keys).")
        else:
            warn(
                f"Runtime l10n baseline STALE: bundle.l10n.json has "
                f"{_status['on_disk']} entries, source has {_status['expected']}. "
                f"Run: {_sys.executable} {_translate_util} --run-mode sync"
            )
        for _a in _runtime_sync(dry_run=True)["aligned"]:
            if _a["missing"] or _a["orphans_pruned"]:
                info(
                    f"  runtime {_a['surface']} {_a['locale']}: "
                    f"missing={_a['missing']} orphans_pruned={_a['orphans_pruned']}"
                )
        results.append(("Step 11b \u00b7 Runtime l10n audit", True, time.time() - _sync_start))
    except Exception as _exc:  # never block publish on the advisory runtime check
        warn(f"Runtime l10n audit failed (non-fatal): {_exc}")
        results.append(("Step 11b \u00b7 Runtime l10n audit", False, time.time() - _sync_start))

    # Use a distinct local name: assigning bare `ok` here would make `ok` a
    # function-local for the WHOLE function, shadowing the imported ok() display
    # helper and turning every earlier ok(...) call (the Step 11b baseline line)
    # into an UnboundLocalError \u2014 which is exactly what silently broke Step 11b.
    version, version_ok = _validate_version_step(
        args, results, EXTENSION, "Step 12 \u00b7 Version & CHANGELOG"
    )
    return version, version_ok, lint_report_path


# ── Dart Analysis ────────────────────────────────────────


def _run_dart_build_steps(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Run Dart format, test, analysis, pub-score checks, docs, and dry-run."""
    from modules.dart_build import (
        format_code,
        run_tests,
        run_analysis,
        run_downgrade_check,
        run_outdated_check,
        generate_docs,
        pre_publish_validation,
    )

    heading("Dart \u00b7 Format")
    if not run_step("Dart format", format_code, results):
        return False

    if getattr(args, "skip_tests", False):
        heading("Dart \u00b7 Tests (skipped)")
    else:
        heading("Dart \u00b7 Tests")
        while True:
            if run_step("Dart tests", run_tests, results):
                break

            # Preserve only the final test disposition so reports and exit
            # code reflect the user's final choice (retry/skip/abort).
            if results and results[-1][0] == "Dart tests":
                results.pop()

            choice = ask_choice(
                "Dart tests failed. Choose what to do next",
                choices=("retry", "skip", "abort"),
                default="retry",
            )
            if choice == "retry":
                warn("Retrying Dart tests...")
                continue
            if choice == "skip":
                warn("Continuing despite Dart test failures by user choice.")
                results.append(("Dart tests (skipped)", True, 0.0))
                break
            # abort
            return False

    heading("Dart \u00b7 Analysis")
    if not run_step("Dart analysis", run_analysis, results):
        return False

    heading("Dart \u00b7 Downgrade check")
    if not run_step("Downgrade + analyze", run_downgrade_check, results):
        return False

    heading("Dart \u00b7 Outdated check")
    if not run_step("Dependencies up-to-date", run_outdated_check, results):
        return False

    heading("Dart \u00b7 Documentation")
    if not run_step("Dart docs", generate_docs, results):
        return False

    heading("Dart \u00b7 Dry Run")
    if not run_step("Dart dry-run", pre_publish_validation, results):
        return False
    return True


def run_dart_analysis(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> tuple[str, bool]:
    """Run all Dart analysis steps. Returns (version, all_passed)."""
    from modules.dart_prereqs import check_dart, check_flutter, check_publish_workflow
    from modules.checks_git import check_git, check_working_tree, check_remote_sync
    from modules.target_config import DART, ensure_server_constants_version_sync

    heading("Dart \u00b7 Prerequisites")
    for name, fn in [
        ("Dart SDK", check_dart),
        ("Flutter SDK", check_flutter),
        ("git", check_git),
        ("Publish workflow", check_publish_workflow),
    ]:
        if not run_step(name, fn, results):
            return "", False

    heading("Dart \u00b7 Working Tree")
    # analyze / --analyze-only must not show "publish will push" copy in checks_git.
    will_publish = not getattr(args, "analyze_only", False)
    if not run_step(
        "Working tree",
        lambda: check_working_tree(will_publish=will_publish),
        results,
    ):
        return "", False

    heading("Dart \u00b7 Remote Sync")
    if not run_step("Remote sync", check_remote_sync, results):
        return "", False

    from modules.web_assets import ensure_web_assets_sync
    heading("Dart \u00b7 Web assets sync")
    if not run_step("Web assets sync", ensure_web_assets_sync, results):
        return "", False

    heading("Dart \u00b7 Server constants version")
    if not run_step("Server constants version", ensure_server_constants_version_sync, results):
        return "", False

    if not _run_dart_build_steps(args, results):
        return "", False

    return _validate_version_step(args, results, DART, "Dart \u00b7 Version & CHANGELOG")


def run_ext_analysis(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
) -> tuple[str, bool, str | None]:
    """Run all extension analysis steps. Returns (version, all_passed, lint_report_path)."""
    if not _run_ext_prerequisites(results):
        return "", False, None
    if not _run_ext_dev_checks(args, results):
        return "", False, None
    return _run_ext_build_and_validate(args, results)


# ── Package & Install ─────────────────────────────────────


def package_and_install(
    args: argparse.Namespace,
    results: list[tuple[str, bool, float]],
    version: str,
) -> str | None:
    """Package .vsix and offer local install. Returns vsix path."""
    from modules.ext_publish import step_package
    from modules.ext_prereqs import get_installed_extension_versions
    from modules.ext_install import print_install_instructions, prompt_install
    from modules.report import save_report, print_timing, print_report_path

    heading("Extension File Sync")
    t0 = time.time()
    sync_ok = sync_extension_changelog() and sync_extension_about()
    elapsed = time.time() - t0
    results.append(("Extension file sync", sync_ok, elapsed))
    if not sync_ok:
        return None

    heading("Package")
    t0 = time.time()
    vsix_path = step_package()
    elapsed = time.time() - t0
    results.append(("Package", vsix_path is not None, elapsed))

    if not vsix_path:
        report = save_report(results, version or "unknown")
        print_timing(results)
        print_report_path(report)
        return None

    heading("Local Install")
    ok(f"VSIX: {C.WHITE}{os.path.basename(vsix_path)}{C.RESET}")
    # Reports the EXTENSION version ALREADY installed in the editor (the previous
    # release), not the freshly-packaged .vsix above — install happens later via
    # prompt_install. The label names the extension and each editor so the number
    # never reads as the editor's own version (e.g. "code v3.7.1" looked like VS
    # Code 3.7.1 rather than drift-viewer 3.7.1 inside VS Code).
    from modules.constants import MARKETPLACE_EXTENSION_ID
    # "saropa.drift-viewer" -> "drift-viewer": the user-facing extension name.
    ext_name = MARKETPLACE_EXTENSION_ID.split(".", 1)[-1]
    installed = get_installed_extension_versions()
    if installed:
        parts = [f"{editor} v{ver}" for editor, ver in sorted(installed.items())]
        info(f"Currently installed {ext_name}: {', '.join(parts)}")
    else:
        info(f"{ext_name} not currently installed in VS Code or Cursor.")
    print_install_instructions(vsix_path)
    if getattr(args, "auto_install", False):
        _auto_install_vsix(vsix_path)
    else:
        prompt_install(vsix_path)

    return vsix_path


def _auto_install_vsix(vsix_path: str) -> None:
    """CI mode: install .vsix via code CLI without prompting."""
    from modules.utils import run
    vsix_name = os.path.basename(vsix_path)
    info(f"Running: code --install-extension {vsix_name}")
    run(["code", "--install-extension", os.path.abspath(vsix_path)])

