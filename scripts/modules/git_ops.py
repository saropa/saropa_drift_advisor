# -*- coding: utf-8 -*-
"""Git operations for the publish phase (commit, tag, push)."""

from __future__ import annotations

from modules.constants import REPO_ROOT
from modules.display import fail, fix, info, ok
from modules.utils import run

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from modules.target_config import TargetConfig


def is_version_tagged(version: str, tag_prefix: str) -> bool:
    """Check whether a git tag with the given prefix already exists."""
    tag = f"{tag_prefix}{version}"
    result = run(["git", "tag", "-l", tag], cwd=REPO_ROOT)
    return bool(result.stdout.strip())


def get_current_branch() -> str:
    """Return the current git branch name."""
    result = run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=REPO_ROOT,
    )
    return result.stdout.strip() or "main"


def get_remote_url() -> str:
    """Return the origin remote URL (empty string on failure)."""
    result = run(["git", "remote", "get-url", "origin"], cwd=REPO_ROOT)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _push_to_origin() -> bool:
    """Push current branch to origin.

    If push is rejected (non-fast-forward), pulls with merge and
    retries once.
    """
    branch_name = get_current_branch()

    info("Pushing to origin...")
    push = run(["git", "push", "origin", branch_name], cwd=REPO_ROOT)
    if push.returncode == 0:
        ok(f"Pushed to origin/{branch_name}")
        return True

    stderr = push.stderr or ""
    if "non-fast-forward" in stderr or "rejected" in stderr.lower():
        fix("Remote has new commits; pulling with merge then re-pushing...")
        pull = run(
            ["git", "pull", "origin", branch_name, "--no-edit"],
            cwd=REPO_ROOT,
        )
        if pull.returncode != 0:
            fail(f"git pull failed: {pull.stderr.strip()}")
            return False
        ok("Merged remote changes")
        push2 = run(["git", "push", "origin", branch_name], cwd=REPO_ROOT)
        if push2.returncode != 0:
            fail(f"git push failed after merge: {push2.stderr.strip()}")
            return False
        ok(f"Pushed to origin/{branch_name}")
        return True

    fail(f"git push failed: {stderr.strip()}")
    return False


def git_commit_and_push(config: "TargetConfig", version: str) -> bool:
    """Stage, commit, and push a release commit.

    Uses ``config.git_stage_paths`` to decide what to stage and
    ``config.commit_msg_fmt`` for the commit message.
    """
    tag = f"{config.tag_prefix}{version}"
    info(f"Staging changes for {config.display_name}...")
    run(["git", "add", *config.git_stage_paths], cwd=REPO_ROOT)

    status = run(["git", "status", "--porcelain"], cwd=REPO_ROOT)
    if not status.stdout.strip():
        ok("No changes to commit")
        return True

    msg = config.commit_msg_fmt.format(version=version)
    info(f"Committing {tag}...")
    commit = run(["git", "commit", "-m", msg], cwd=REPO_ROOT)
    if commit.returncode != 0:
        fail(f"git commit failed: {commit.stderr.strip()}")
        return False

    return _push_to_origin()


def create_git_tag(config: "TargetConfig", version: str) -> bool:
    """Create and push an annotated git tag."""
    tag = f"{config.tag_prefix}{version}"
    info(f"Creating tag {tag}...")
    result = run(
        ["git", "tag", "-a", tag, "-m", f"Release {config.display_name} {version}"],
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        fail(f"git tag failed: {result.stderr.strip()}")
        return False

    info(f"Pushing tag {tag}...")
    push = run(["git", "push", "origin", tag], cwd=REPO_ROOT)
    if push.returncode != 0:
        fail(f"git push tag failed: {push.stderr.strip()}")
        return False

    ok(f"Tag {tag} created and pushed")
    return True
