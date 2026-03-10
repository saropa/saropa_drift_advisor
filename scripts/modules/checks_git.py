# -*- coding: utf-8 -*-
"""Git prerequisite and state checks (shared across all targets)."""

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


def check_working_tree() -> bool:
    """Verify git working tree is clean. Prompt if dirty.

    A dirty working tree is allowed during analysis (user confirms),
    but the publish phase will commit all staged changes, so the user
    needs to be aware of what will be included in the release commit.
    """
    result = run(["git", "status", "--porcelain"], cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("Could not check git status.")
        return False
    if not result.stdout.strip():
        ok("Working tree is clean")
        return True

    changed = result.stdout.strip().splitlines()
    warn(f"{len(changed)} uncommitted change(s):")
    for line in changed[:10]:
        print(f"         {C.DIM}{line}{C.RESET}")
    if len(changed) > 10:
        print(f"         {C.DIM}... and {len(changed) - 10} more{C.RESET}")
    return ask_yn("Continue with dirty working tree?", default=False)


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
