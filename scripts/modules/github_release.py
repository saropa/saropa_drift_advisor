# -*- coding: utf-8 -*-
"""GitHub release creation (shared across all targets)."""

from __future__ import annotations

import os
import re

from modules.constants import C, CHANGELOG_PATH, REPO_ROOT
from modules.display import fail, info, ok, warn
from modules.utils import run

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from modules.target_config import TargetConfig


def extract_repo_path(remote_url: str) -> str:
    """Extract ``owner/repo`` from a GitHub remote URL."""
    match = re.search(r"github\.com[:/](.+?)(?:\.git)?$", remote_url)
    if not match:
        warn(f"Could not parse GitHub repo from: {remote_url}")
        return ""
    return match.group(1)


def extract_changelog_section(version: str) -> str:
    """Extract the CHANGELOG content for a specific version.

    Reads everything between ``## [X.Y.Z]`` and the next ``## [`` header.
    Returns a generic message if the section is empty or unreadable.
    """
    try:
        with open(CHANGELOG_PATH, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return f"Release {version}"

    collecting = False
    section: list[str] = []
    for line in lines:
        if re.match(rf"^## \[{re.escape(version)}\]", line):
            collecting = True
            continue
        if collecting and re.match(r"^## \[", line):
            break
        if collecting:
            section.append(line)

    notes = "".join(section).strip()
    return notes if notes else f"Release {version}"


def create_github_release(
    config: "TargetConfig",
    version: str,
    asset_path: str | None = None,
) -> bool:
    """Create a GitHub release for the given target.

    When *asset_path* is provided (e.g. a ``.vsix`` file), it is
    attached to the release as a downloadable asset.
    """
    tag = f"{config.tag_prefix}{version}"
    view = run(["gh", "release", "view", tag], cwd=REPO_ROOT)
    if view.returncode == 0:
        info(f"GitHub release {tag} already exists; skipping.")
        return True

    notes = extract_changelog_section(version)
    info(f"Creating GitHub release {tag}...")

    cmd = ["gh", "release", "create", tag]
    if asset_path:
        cmd.append(os.path.abspath(asset_path))
    cmd += ["--title", tag, "--notes", notes]

    result = run(cmd, cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("GitHub release failed:")
        if result.stderr.strip():
            info(result.stderr.strip())
        _print_gh_troubleshooting()
        return False

    ok(f"GitHub release {tag} created")
    return True


def _print_gh_troubleshooting() -> None:
    """Print troubleshooting hints for GitHub release failures."""
    info("Troubleshooting:")
    info(f"  1. Check auth: {C.YELLOW}gh auth status{C.RESET}")
    info(f"  2. If GITHUB_TOKEN is set, clear it:")
    info(f"     PowerShell: {C.YELLOW}$env:GITHUB_TOKEN = \"\"{C.RESET}")
    info(f"     Bash: {C.YELLOW}unset GITHUB_TOKEN{C.RESET}")
