# -*- coding: utf-8 -*-
"""Prerequisite tool checks (Node, npm, git, gh CLI, vsce auth, OVSX PAT).

Each check returns True on success, False on blocking failure.
All prerequisites are blocking — the pipeline halts on the first failure
so the user gets a clear message about what to install.
"""

import shutil
import subprocess
import sys

from modules.constants import C, EXTENSION_DIR
from modules.display import fail, info, ok, warn
from modules.utils import get_ovsx_pat, run


def check_node() -> bool:
    """Verify Node.js is installed (>= 18).

    VS Code extensions require Node 18+ for the vsce packaging tool.
    """
    result = run(["node", "--version"], check=False)
    if result.returncode != 0:
        fail("Node.js is not installed. Install from https://nodejs.org/")
        return False
    # node --version returns "vXX.YY.ZZ", strip the leading "v"
    version = result.stdout.strip().lstrip("v")
    major = int(version.split(".")[0])
    if major < 18:
        fail(f"Node.js {version} found -- version 18+ required.")
        return False
    ok(f"Node.js {C.WHITE}{version}{C.RESET}")
    return True


def check_npm() -> bool:
    """Verify npm is installed.

    npm ships with Node.js, so a missing npm usually means a broken
    Node installation rather than a separate install step.
    """
    result = run(["npm", "--version"], check=False)
    if result.returncode != 0:
        fail("npm is not installed. It ships with Node.js -- reinstall Node.")
        return False
    ok(f"npm {C.WHITE}{result.stdout.strip()}{C.RESET}")
    return True


def check_git() -> bool:
    """Verify git is installed.

    Required for working tree checks, commit, tag, and push operations
    during the publish phase.
    """
    result = run(["git", "--version"], check=False)
    if result.returncode != 0:
        fail("git is not installed. Install from https://git-scm.com/")
        return False
    ok(f"git -- {C.WHITE}{result.stdout.strip()}{C.RESET}")
    return True


def check_gh_cli() -> bool:
    """Verify GitHub CLI is installed and authenticated.

    Only called when publishing (not --analyze-only). Blocking because
    Step 15 requires `gh release create` to attach the .vsix to a
    GitHub release. Failing early here prevents discovering the issue
    only after the marketplace publish has already succeeded.
    """
    if not shutil.which("gh"):
        fail("GitHub CLI (gh) is not installed.")
        info(f"  Install from {C.WHITE}https://cli.github.com/{C.RESET}")
        return False

    # Use a timeout because gh auth status can hang if the keyring is locked
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


def check_vsce_auth() -> bool:
    """Verify vsce has valid marketplace credentials for publisher 'saropa'.

    Only called when --analyze-only is NOT set, since credentials are
    only needed for the actual marketplace publish in Step 13.
    Uses `vsce verify-pat` to validate without publishing. If verification
    fails, runs `vsce login saropa` interactively so the user can enter or
    overwrite the PAT (handles both first-time and overwrite prompts).
    """
    info("Checking marketplace credentials...")
    result = run(
        ["npx", "@vscode/vsce", "verify-pat", "saropa"],
        cwd=EXTENSION_DIR,
        check=False,
    )
    if result.returncode == 0:
        ok("Marketplace PAT verified for 'saropa'")
        return True

    # verify-pat may not exist in older vsce versions — treat as a
    # non-blocking warning rather than failing the entire pipeline
    stderr = (result.stderr or "").lower()
    if "unknown command" in stderr or "not a vsce command" in stderr:
        warn("Could not verify PAT (vsce verify-pat not available).")
        info("Publish may fail if credentials are missing.")
        return True

    # Run vsce login interactively: works for both first-time (PAT only) and
    # overwrite (y/N then PAT) without guessing prompt order via piped input.
    info("Marketplace needs a login token (PAT). Same token whether you use VS Code or Cursor -- it can expire.")
    info(f"  Get one: {C.WHITE}https://marketplace.visualstudio.com/manage{C.RESET} > your publisher > Create token. Copy it, then paste here when vsce asks.")
    info("Running vsce login for publisher 'saropa'...")
    info("  If it asks to 'overwrite' -- type y, then paste the token when asked.")
    login_result = subprocess.run(
        ["npx", "@vscode/vsce", "login", "saropa"],
        cwd=EXTENSION_DIR,
        shell=(sys.platform == "win32"),
    )
    if login_result.returncode != 0:
        fail("vsce login failed or was cancelled.")
        return False
    # Re-verify after login
    result = run(
        ["npx", "@vscode/vsce", "verify-pat", "saropa"],
        cwd=EXTENSION_DIR,
        check=False,
    )
    if result.returncode == 0:
        ok("Marketplace PAT verified for 'saropa'")
        return True
    fail("No valid marketplace PAT found for publisher 'saropa'.")
    info(f"  Run manually if needed: {C.YELLOW}npx @vscode/vsce login saropa{C.RESET}")
    return False


def check_ovsx_token() -> bool:
    """Check OVSX_PAT for Open VSX (Cursor / VSCodium). Never blocks: missing = skip step.

    Token is read from env or from project .env file (so Run from IDE works).
    When set, Step 14 will publish to Open VSX. When not set, we warn and
    skip Step 14 so the pipeline still succeeds (VS Code + GitHub release).
    """
    pat = get_ovsx_pat()
    if pat:
        ok("OVSX_PAT set (Open VSX publish)")
        return True
    warn("OVSX_PAT not set; Open VSX step will be skipped.")
    info(f"  Set in shell, or add to {C.WHITE}.env{C.RESET}: {C.YELLOW}OVSX_PAT=your-token{C.RESET}")
    info(f"  Token: {C.WHITE}https://open-vsx.org/user-settings/tokens{C.RESET}")
    return True
