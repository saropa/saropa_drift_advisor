# -*- coding: utf-8 -*-
"""Git prerequisite and state checks (shared across all targets).

This module is imported by the unified publish pipeline (``publish.py``) for:

- Verifying ``git`` and ``gh`` are installed and usable.
- Detecting an unclean working tree (``git status --porcelain``) before long analysis
  or publish steps, so operators see what is not yet committed.
- Fetching ``origin`` and optionally fast-forwarding when the local branch is behind.

``check_working_tree`` is used for both **analysis** and **publish** flows. Callers must
pass ``will_publish=False`` when the run will not perform a release (e.g. ``analyze``
target or ``--analyze-only``), so user-facing copy does not imply a commit/push that
will not happen. When ``will_publish=True``, the guidance matches
``git_ops.git_commit_and_push`` (``TargetConfig.git_stage_paths``).
"""

import shutil
import subprocess

from modules.constants import C, REPO_ROOT
from modules.display import ask_yn, fail, fix, info, ok, warn
from modules.utils import run


def check_git() -> bool:
    """Verify git is installed."""
    result = run(["git", "--version"], check=False)
    if result.returncode != 0:
        fail("git is not installed. Install from https://git-scm.com/")
        return False
    ok(f"git -- {C.WHITE}{result.stdout.strip()}{C.RESET}")
    return True


def check_gh_cli() -> bool:
    """Verify GitHub CLI is installed and authenticated."""
    if not shutil.which("gh"):
        fail("GitHub CLI (gh) is not installed.")
        info(f"  Install from {C.WHITE}https://cli.github.com/{C.RESET}")
        return False

    try:
        result = run(["gh", "auth", "status"], check=False, timeout=10)
    except subprocess.TimeoutExpired:
        fail("GitHub CLI auth check timed out.")
        return False
    if result.returncode != 0:
        fail(f"GitHub CLI not authenticated. "
             f"Run: {C.YELLOW}gh auth login{C.RESET}")
        return False
    ok("GitHub CLI -- authenticated")
    return True


def check_working_tree(will_publish: bool = True) -> bool:
    """Verify the working tree is clean; prompt if there are uncommitted changes.

    Args:
        will_publish: When True, tell the user a publish step will ``git add`` (per
            ``TargetConfig.git_stage_paths``), commit, and push. When False (analyze
            target or ``--analyze-only``), state that this run does not commit or push.

    Returns:
        True if porcelain is empty or the user confirms; False on status failure or
        when the user declines the prompt.
    """
    result = run(["git", "status", "--porcelain"], cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("Could not check git status.")
        return False
    if not result.stdout.strip():
        ok("Working tree is clean")
        return True

    changed = result.stdout.strip().splitlines()
    warn(f"{len(changed)} uncommitted local change(s) (not in a commit yet):")
    for line in changed[:10]:
        print(f"         {C.DIM}{line}{C.RESET}")
    if len(changed) > 10:
        print(f"         {C.DIM}... and {len(changed) - 10} more{C.RESET}")
    if will_publish:
        info(
            "If you continue, publish will git add (per target), commit, and push to origin — "
            "Dart: entire repo; extension: extension/ and scripts/ only."
        )
    else:
        info(
            "This run is analysis-only: nothing will be committed or pushed. "
            "When you publish later, release staging is Dart: entire repo; extension: "
            "extension/ and scripts/ only."
        )
    return ask_yn("Continue with uncommitted changes?", default=False)


def _check_if_behind() -> bool:
    """Compare local HEAD against upstream. Pull if behind."""
    local = run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT)
    remote = run(["git", "rev-parse", "@{u}"], cwd=REPO_ROOT)
    if remote.returncode != 0:
        warn("No upstream tracking branch. Skipping sync check.")
        return True
    if local.stdout.strip() == remote.stdout.strip():
        ok("Local branch is up to date with origin")
        return True

    base = run(["git", "merge-base", "HEAD", "@{u}"], cwd=REPO_ROOT)
    if base.stdout.strip() == local.stdout.strip():
        fix("Local is behind origin. Pulling...")
        pull = run(["git", "pull", "--ff-only"], cwd=REPO_ROOT)
        if pull.returncode != 0:
            fail("git pull --ff-only failed (branches diverged?)")
            return False
        ok("Pulled latest from origin")
        return True
    ok("Local is ahead of origin (will push during publish)")
    return True


def check_remote_sync() -> bool:
    """Fetch origin and ensure local branch is up to date."""
    info("Fetching origin...")
    fetch = run(["git", "fetch", "origin"], cwd=REPO_ROOT)
    if fetch.returncode != 0:
        fail(f"git fetch failed: {fetch.stderr.strip()}")
        return False
    return _check_if_behind()
