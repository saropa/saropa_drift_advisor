# -*- coding: utf-8 -*-
"""Git operations for the publish phase (commit, tag, push)."""

from __future__ import annotations

from modules.constants import REPO_ROOT
from modules.display import ask_choice, fail, fix, info, ok, warn
from modules.utils import run

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from modules.target_config import TargetConfig


def _prompt_skip_or_abort(label: str) -> bool:
    """Show a skip/abort prompt after a git failure.

    Returns True if the developer chose to skip (continue), False to abort.
    Every git failure in the publish pipeline must go through this so the
    script never hard-aborts without asking.
    """
    choice = ask_choice(
        f"{label}. Choose what to do next",
        choices=("skip", "abort"),
        default="abort",
    )
    if choice == "skip":
        warn(f"Skipping: {label} (by user choice).")
        return True
    return False


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
    retries once.  All failure paths prompt the developer instead of
    hard-aborting.
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
            return _prompt_skip_or_abort("git pull failed")
        ok("Merged remote changes")
        push2 = run(["git", "push", "origin", branch_name], cwd=REPO_ROOT)
        if push2.returncode != 0:
            fail(f"git push failed after merge: {push2.stderr.strip()}")
            return _prompt_skip_or_abort("git push failed after merge")
        ok(f"Pushed to origin/{branch_name}")
        return True

    fail(f"git push failed: {stderr.strip()}")
    return _prompt_skip_or_abort("git push failed")


def git_commit_and_push(config: "TargetConfig", version: str) -> bool:
    """Stage, commit, and push a release commit.

    Uses ``config.git_stage_paths`` to decide what to stage and
    ``config.commit_msg_fmt`` for the commit message.

    Only files under ``config.git_stage_paths`` are staged.  The function
    checks the *index* (staged changes) — not the whole working tree — so
    unstaged modifications elsewhere do not cause a spurious commit attempt.
    After committing, any remaining dirty files are reported as a warning so
    the operator knows the working tree is not fully clean.
    """
    tag = f"{config.tag_prefix}{version}"
    paths_display = ", ".join(config.git_stage_paths)
    info(f"Staging changes for {config.display_name} ({paths_display})...")
    add_result = run(["git", "add", *config.git_stage_paths], cwd=REPO_ROOT)
    if add_result.returncode != 0:
        fail(f"git add failed: {(add_result.stderr or add_result.stdout).strip()}")
        return _prompt_skip_or_abort("git add failed")

    # Check only the staging area (index) — unstaged changes in files
    # outside git_stage_paths must not trick us into attempting a commit
    # that has nothing staged.
    staged = run(["git", "diff", "--cached", "--name-only"], cwd=REPO_ROOT)
    staged_files = staged.stdout.strip()
    if not staged_files:
        ok("No staged changes to commit")
        _warn_dirty_working_tree(config)
        return True

    # Log what we are about to commit for auditability.
    for path in staged_files.splitlines():
        info(f"  staged: {path}")

    msg = config.commit_msg_fmt.format(version=version)
    info(f"Committing {tag}...")
    commit = run(["git", "commit", "-m", msg], cwd=REPO_ROOT)
    if commit.returncode != 0:
        # "nothing to commit" means an earlier manual commit (or a
        # previous pipeline run) already captured all staged changes.
        # Skip straight to push instead of prompting.
        combined = f"{commit.stdout or ''}\n{commit.stderr or ''}".lower()
        if "nothing to commit" in combined:
            ok("Already committed (nothing new to commit)")
            _warn_dirty_working_tree(config)
            return _push_to_origin()

        # Git sends pre-commit hook output to stderr; show both streams so
        # the operator sees exactly what happened.
        detail = (commit.stderr or "").strip()
        stdout_detail = (commit.stdout or "").strip()
        if stdout_detail:
            detail = f"{detail}\n{stdout_detail}" if detail else stdout_detail
        fail(f"git commit failed:\n{detail}")
        return _prompt_skip_or_abort("git commit failed")

    ok(f"Committed: {msg}")
    _warn_dirty_working_tree(config)
    return _push_to_origin()


def _warn_dirty_working_tree(config: "TargetConfig") -> None:
    """Warn if files outside the target's stage paths are still dirty.

    This is purely informational — a dirty tree is not a failure, but it
    helps the operator notice when a pipeline step left behind unstaged
    modifications (e.g. a changelog stamp that no target owns).
    """
    status = run(["git", "status", "--porcelain"], cwd=REPO_ROOT)
    dirty = status.stdout.strip()
    if not dirty:
        return
    paths_display = ", ".join(config.git_stage_paths)
    warn(f"Working tree still has uncommitted changes (not in {paths_display}):")
    for line in dirty.splitlines()[:10]:
        warn(f"  {line}")
    remaining = len(dirty.splitlines()) - 10
    if remaining > 0:
        warn(f"  ... and {remaining} more")


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
        return _prompt_skip_or_abort(f"git tag {tag} failed")

    info(f"Pushing tag {tag}...")
    push = run(["git", "push", "origin", tag], cwd=REPO_ROOT)
    if push.returncode != 0:
        fail(f"git push tag failed: {push.stderr.strip()}")
        return _prompt_skip_or_abort(f"git push tag {tag} failed")

    ok(f"Tag {tag} created and pushed")
    return True
