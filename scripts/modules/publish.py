# -*- coding: utf-8 -*-
"""Publish operations: confirmation, package, git, marketplace, GitHub.

All functions in this module perform irreversible mutations (write files,
create git tags, publish to marketplace, create GitHub releases).
"""

import glob
import json
import os
import re

from modules.constants import (
    C,
    MARKETPLACE_EXTENSION_ID,
    MARKETPLACE_URL,
    EXTENSION_DIR,
    REPO_ROOT,
    REPO_URL,
    TAG_PREFIX,
)
from modules.display import ask_yn, fail, fix, info, ok
from modules.utils import get_ovsx_pat, run


# ── Publish: Confirmation ────────────────────────────────────


def confirm_publish(version: str) -> bool:
    """Show publish summary and require explicit confirmation.

    Lists every irreversible action that will happen, so the user
    can make an informed decision. Defaults to "no" since marketplace
    publishes cannot be undone.
    """
    tag = f"{TAG_PREFIX}{version}"
    print(f"\n  {C.BOLD}{C.YELLOW}Publish Summary{C.RESET}")
    print(f"  {'-' * 40}")
    print(f"  Version:     {C.WHITE}v{version}{C.RESET}")
    print(f"  Tag:         {C.WHITE}{tag}{C.RESET}")
    print(f"  Marketplace: {C.WHITE}{MARKETPLACE_EXTENSION_ID}{C.RESET}")
    print(f"  Repository:  {C.WHITE}{REPO_URL}{C.RESET}")
    print(f"\n  {C.YELLOW}This will:{C.RESET}")
    print(f"    1. Commit and push to origin")
    print(f"    2. Create git tag {tag}")
    print(f"    3. Publish to VS Code Marketplace")
    print(f"    4. Publish to Open VSX (Cursor / VSCodium, if OVSX_PAT set)")
    print(f"    5. Create GitHub release with .vsix")
    print(f"\n  {C.RED}These actions are irreversible.{C.RESET}")
    return ask_yn("Proceed with publish?", default=False)


# ── Publish: Package ─────────────────────────────────────────


def step_package() -> str | None:
    """Package the extension into a .vsix file. Returns the file path.

    Uses vsce (Visual Studio Code Extensions CLI) to create a .vsix archive.
    --no-dependencies skips bundling node_modules since the extension
    only needs compiled output in out/.
    """
    info("Packaging .vsix file...")
    result = run(
        ["npx", "@vscode/vsce", "package", "--no-dependencies"],
        cwd=EXTENSION_DIR,
    )
    if result.returncode != 0:
        fail("Packaging failed:")
        if result.stdout.strip():
            print(result.stdout)
        if result.stderr.strip():
            print(result.stderr)
        return None

    # vsce writes the .vsix to the cwd (extension/). If multiple exist
    # (e.g. from previous runs), pick the most recently modified one.
    pattern = os.path.join(EXTENSION_DIR, "*.vsix")
    vsix_files = sorted(glob.glob(pattern), key=os.path.getmtime)
    if not vsix_files:
        fail("No .vsix file found after packaging.")
        return None

    vsix_path = vsix_files[-1]
    size_kb = os.path.getsize(vsix_path) / 1024
    ok(f"Created: {os.path.basename(vsix_path)} ({size_kb:.0f} KB)")
    return vsix_path


# ── Publish: Git ─────────────────────────────────────────────



def git_commit_and_push(version: str) -> bool:
    """Commit extension-related changes and push to origin.

    Stages only extension/ and scripts/ directories so unrelated
    Dart package changes are not swept into the release commit.
    If there's nothing to commit, this succeeds silently.
    """
    tag = f"{TAG_PREFIX}{version}"
    info("Staging extension changes...")
    run(["git", "add", "extension/", "scripts/"], cwd=REPO_ROOT)

    # Check if there are staged changes after add -A
    status = run(["git", "status", "--porcelain"], cwd=REPO_ROOT)
    if not status.stdout.strip():
        ok("No changes to commit")
        return True

    info(f"Committing release {tag}...")
    commit = run(
        ["git", "commit", "-m", f"release(extension): {tag}"],
        cwd=REPO_ROOT,
    )
    if commit.returncode != 0:
        fail(f"git commit failed: {commit.stderr.strip()}")
        return False

    return _push_to_origin()


def _push_to_origin() -> bool:
    """Push current branch to origin.

    Detects the current branch name dynamically rather than hardcoding
    "main", so this works on feature branches too.
    If push is rejected (non-fast-forward), pulls with merge and retries once.
    """
    branch = run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=REPO_ROOT,
    )
    branch_name = branch.stdout.strip() or "main"

    info("Pushing to origin...")
    push = run(
        ["git", "push", "origin", branch_name],
        cwd=REPO_ROOT,
    )
    if push.returncode == 0:
        ok(f"Pushed to origin/{branch_name}")
        return True

    # Rejected (e.g. non-fast-forward): try pull then push once
    if "non-fast-forward" in (push.stderr or "") or "rejected" in (push.stderr or "").lower():
        fix("Remote has new commits; pulling with merge then re-pushing...")
        pull = run(["git", "pull", "origin", branch_name, "--no-edit"], cwd=REPO_ROOT)
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

    fail(f"git push failed: {push.stderr.strip()}")
    return False


def create_git_tag(version: str) -> bool:
    """Create and push an annotated git tag.

    Uses annotated tags (-a) rather than lightweight tags because
    annotated tags store the tagger, date, and message — useful for
    `gh release create` which uses the tag message as the default body.
    """
    tag = f"{TAG_PREFIX}{version}"
    info(f"Creating tag {tag}...")
    result = run(
        ["git", "tag", "-a", tag, "-m", f"Release extension {version}"],
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


# ── Publish: Marketplace ─────────────────────────────────────


def get_marketplace_published_version() -> str | None:
    """Return the latest version published on VS Code Marketplace, or None if unknown.

    Uses vsce show --json. When unauthenticated or offline, returns None (do not skip publish).
    """
    result = run(
        ["npx", "@vscode/vsce", "show", MARKETPLACE_EXTENSION_ID, "--json"],
        cwd=EXTENSION_DIR,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        data = json.loads(result.stdout)
        versions = data.get("versions")
        if versions and isinstance(versions, list) and len(versions) > 0:
            first = versions[0]
            if isinstance(first, dict) and "version" in first:
                return str(first["version"]).strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def publish_marketplace(vsix_path: str) -> bool:
    """Publish the pre-built .vsix to VS Code Marketplace.

    Requires a valid PAT (Personal Access Token) for the 'saropa' publisher.
    The PAT is stored in the system keychain via `npx @vscode/vsce login`.
    """
    info(f"Publishing {os.path.basename(vsix_path)} to marketplace...")
    # --packagePath skips the vscode:prepublish hook and publishes
    # the exact artifact we already validated
    result = run(
        ["npx", "@vscode/vsce", "publish", "--packagePath", vsix_path],
        cwd=EXTENSION_DIR,
    )
    if result.returncode != 0:
        fail("Marketplace publish failed:")
        if result.stdout.strip():
            print(result.stdout)
        if result.stderr.strip():
            print(result.stderr)
        return False
    ok("Published to VS Code Marketplace")
    return True


# ── Publish: Open VSX ───────────────────────────────────────


def publish_openvsx(vsix_path: str) -> bool:
    """Publish the pre-built .vsix to Open VSX (open-vsx.org).

    Used by Cursor, VSCodium, and others. Token from OVSX_PAT env or .env.
    Same .vsix as Step 13; credentials checked earlier in pipeline.
    """
    pat = get_ovsx_pat()
    if not pat:
        fail("OVSX_PAT is not set. Create a token at open-vsx.org/user-settings/tokens")
        return False
    info(f"Publishing {os.path.basename(vsix_path)} to Open VSX...")
    result = run(
        ["npx", "ovsx", "publish", vsix_path, "-p", pat],
        cwd=EXTENSION_DIR,
    )
    if result.returncode != 0:
        fail("Open VSX publish failed:")
        if result.stdout.strip():
            print(result.stdout)
        if result.stderr.strip():
            print(result.stderr)
        return False
    ok("Published to Open VSX")
    return True


# ── Publish: GitHub Release ──────────────────────────────────


def extract_changelog_section(version: str) -> str:
    """Extract the CHANGELOG content for a specific version.

    Reads everything between `## [X.Y.Z]` and the next `## [` header.
    Returns a generic "Release X.Y.Z" message if the section is empty
    or the file can't be read.
    """
    changelog_path = os.path.join(EXTENSION_DIR, "CHANGELOG.md")
    try:
        with open(changelog_path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return f"Release {version}"

    collecting = False
    section: list[str] = []
    for line in lines:
        # Start collecting after the version header
        if re.match(rf'^## \[{re.escape(version)}\]', line):
            collecting = True
            continue
        # Stop at the next version header
        if collecting and re.match(r'^## \[', line):
            break
        if collecting:
            section.append(line)

    notes = "".join(section).strip()
    return notes if notes else f"Release {version}"


def create_github_release(version: str, vsix_path: str) -> bool:
    """Create a GitHub release with the .vsix attached.

    Uses the `gh` CLI to create a release on GitHub. The .vsix file
    is attached as a downloadable asset, making it available to users
    who prefer to install from GitHub rather than the marketplace.
    """
    tag = f"{TAG_PREFIX}{version}"
    view = run(["gh", "release", "view", tag], cwd=REPO_ROOT)
    if view.returncode == 0:
        info(f"GitHub release {tag} already exists; skipping.")
        return True
    notes = extract_changelog_section(version)
    info(f"Creating GitHub release {tag}...")
    # gh release create attaches files listed after the tag name
    result = run(
        [
            "gh", "release", "create", tag,
            os.path.abspath(vsix_path),
            "--title", tag,
            "--notes", notes,
        ],
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        fail("GitHub release failed:")
        if result.stderr.strip():
            print(f"         {result.stderr.strip()}")
        _print_gh_troubleshooting()
        return False

    ok(f"GitHub release {tag} created")
    return True


def _print_gh_troubleshooting() -> None:
    """Print troubleshooting hints for GitHub release failures.

    The most common cause is a stale GITHUB_TOKEN env var that
    overrides the gh CLI's keyring credentials.
    """
    info("Troubleshooting:")
    info(f"  1. Check auth: {C.YELLOW}gh auth status{C.RESET}")
    info(f"  2. If GITHUB_TOKEN is set, clear it:")
    info(f"     PowerShell: {C.YELLOW}$env:GITHUB_TOKEN = \"\"{C.RESET}")
    info(f"     Bash: {C.YELLOW}unset GITHUB_TOKEN{C.RESET}")
