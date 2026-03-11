# -*- coding: utf-8 -*-
"""Extension-specific prerequisite and environment checks.

Merges checks_prereqs.py (ext parts), checks_environment.py,
and ext helpers from utils.py.
"""

import json
import os
import shutil
import subprocess
import sys

from modules.constants import (
    C,
    EXTENSION_DIR,
    MARKETPLACE_EXTENSION_ID,
    REPO_ROOT,
    REQUIRED_GLOBAL_NPM_PACKAGES,
    REQUIRED_VSCODE_EXTENSIONS,
)
from modules.display import fail, fix, info, ok, warn
from modules.utils import run


# ── PAT / Version Helpers ──────────────────────────────────


def get_ovsx_pat() -> str:
    """Return OVSX_PAT from environment or from project .env file."""
    pat = os.environ.get("OVSX_PAT", "").strip()
    if pat:
        return pat
    env_path = os.path.join(REPO_ROOT, ".env")
    try:
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("OVSX_PAT="):
                    value = line.split("=", 1)[1].strip().strip('"').strip("'")
                    return value
    except OSError:
        pass
    return ""


def _get_extension_dirs() -> list[str]:
    """Return paths to VS Code / Cursor extension directories."""
    dirs: list[str] = []
    if sys.platform == "win32":
        appdata = os.environ.get("USERPROFILE", "")
        if appdata:
            dirs.append(os.path.join(appdata, ".vscode", "extensions"))
            dirs.append(os.path.join(appdata, ".cursor", "extensions"))
    elif sys.platform == "darwin":
        home = os.path.expanduser("~")
        dirs.append(os.path.join(home, ".vscode", "extensions"))
        dirs.append(os.path.join(home, ".cursor", "extensions"))
    else:
        home = os.path.expanduser("~")
        dirs.append(os.path.join(home, ".vscode", "extensions"))
        dirs.append(os.path.join(home, ".cursor", "extensions"))
    return dirs


def get_installed_extension_versions(
    extension_id: str = MARKETPLACE_EXTENSION_ID,
) -> dict[str, str]:
    """Return installed version per editor (vscode, cursor).

    Reads extension directories on disk to avoid calling ``code
    --list-extensions`` which opens an unwanted VS Code window on Windows.
    """
    out: dict[str, str] = {}
    # extension_id is like "saropa.drift-viewer"; folder names are
    # "saropa.drift-viewer-0.3.0"
    prefix = extension_id.lower() + "-"

    for ext_dir in _get_extension_dirs():
        if not os.path.isdir(ext_dir):
            continue
        editor = "cursor" if ".cursor" in ext_dir else "code"
        try:
            for entry in os.listdir(ext_dir):
                if entry.lower().startswith(prefix):
                    version = entry[len(prefix):]
                    if version and editor not in out:
                        out[editor] = version
        except OSError:
            continue
    return out


# ── Tool Checks (blocking) ────────────────────────────────


def check_node() -> bool:
    """Verify Node.js is installed (>= 18)."""
    result = run(["node", "--version"], check=False)
    if result.returncode != 0:
        fail("Node.js is not installed. Install from https://nodejs.org/")
        return False
    version = result.stdout.strip().lstrip("v")
    major = int(version.split(".")[0])
    if major < 18:
        fail(f"Node.js {version} found -- version 18+ required.")
        return False
    ok(f"Node.js {C.WHITE}{version}{C.RESET}")
    return True


def check_npm() -> bool:
    """Verify npm is installed."""
    result = run(["npm", "--version"], check=False)
    if result.returncode != 0:
        fail("npm is not installed. It ships with Node.js -- reinstall Node.")
        return False
    ok(f"npm {C.WHITE}{result.stdout.strip()}{C.RESET}")
    return True


def check_vsce_auth() -> bool:
    """Verify vsce has valid marketplace credentials for publisher 'saropa'."""
    info("Checking marketplace credentials...")
    result = run(
        ["npx", "@vscode/vsce", "verify-pat", "saropa"],
        cwd=EXTENSION_DIR,
        check=False,
    )
    if result.returncode == 0:
        ok("Marketplace PAT verified for 'saropa'")
        return True

    stderr = (result.stderr or "").lower()
    if "unknown command" in stderr or "not a vsce command" in stderr:
        warn("Could not verify PAT (vsce verify-pat not available).")
        info("Publish may fail if credentials are missing.")
        return True

    info("Marketplace needs a login token (PAT).")
    info(f"  Get one: {C.WHITE}https://marketplace.visualstudio.com/manage{C.RESET}")
    info("Running vsce login for publisher 'saropa'...")
    login_result = subprocess.run(
        ["npx", "@vscode/vsce", "login", "saropa"],
        cwd=EXTENSION_DIR,
        shell=(sys.platform == "win32"),
    )
    if login_result.returncode != 0:
        fail("vsce login failed or was cancelled.")
        return False
    result = run(
        ["npx", "@vscode/vsce", "verify-pat", "saropa"],
        cwd=EXTENSION_DIR,
        check=False,
    )
    if result.returncode == 0:
        ok("Marketplace PAT verified for 'saropa'")
        return True
    fail("No valid marketplace PAT found for publisher 'saropa'.")
    info(f"  Run manually: {C.YELLOW}npx @vscode/vsce login saropa{C.RESET}")
    return False


def check_ovsx_token() -> bool:
    """Check OVSX_PAT. Non-blocking — missing just means prompt at publish time."""
    pat = get_ovsx_pat()
    if pat:
        ok("OVSX_PAT set (Open VSX publish)")
        return True
    warn("OVSX_PAT not set; will prompt at publish time or skip.")
    info(f"  To avoid prompt: add {C.YELLOW}OVSX_PAT=your-token{C.RESET} to {C.WHITE}.env{C.RESET}")
    return True


# ── Environment Checks (non-blocking) ─────────────────────


def check_vscode_cli() -> bool:
    """Verify the 'code' CLI is available (non-blocking)."""
    if not shutil.which("code"):
        warn("VS Code CLI (code) not found on PATH.")
        info(f"  Open VS Code > {C.YELLOW}Ctrl+Shift+P{C.RESET} > "
             f"'{C.WHITE}Shell Command: Install code command in PATH{C.RESET}'")
        return True
    ok("VS Code CLI (code) available on PATH")
    return True


def check_global_npm_packages() -> bool:
    """Check and install required global npm packages."""
    if not REQUIRED_GLOBAL_NPM_PACKAGES:
        ok("No global npm packages required")
        return True

    all_ok = True
    result = run(["npm", "list", "-g", "--depth=0", "--json"], check=False)

    installed: set[str] = set()
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            installed = set(data.get("dependencies", {}).keys())
        except json.JSONDecodeError:
            pass

    for pkg in REQUIRED_GLOBAL_NPM_PACKAGES:
        if pkg in installed:
            ok(f"npm global: {C.WHITE}{pkg}{C.RESET}")
        else:
            fix(f"Installing global npm package: {C.WHITE}{pkg}{C.RESET}")
            install_result = run(["npm", "install", "-g", pkg], check=False)
            if install_result.returncode != 0:
                fail(f"Failed to install {pkg}: {install_result.stderr.strip()}")
                all_ok = False
            else:
                ok(f"Installed: {C.WHITE}{pkg}{C.RESET}")
    return all_ok


def check_vscode_extensions() -> bool:
    """Check required VS Code extensions are installed.

    Reads extension directories on disk to avoid calling ``code
    --list-extensions`` which opens an unwanted VS Code window on Windows.
    Missing extensions are reported as warnings (manual install required).
    """
    if not REQUIRED_VSCODE_EXTENSIONS:
        ok("No VS Code extensions required")
        return True

    # Gather all installed extension IDs from disk
    installed: set[str] = set()
    for ext_dir in _get_extension_dirs():
        if not os.path.isdir(ext_dir):
            continue
        try:
            for entry in os.listdir(ext_dir):
                # Folder names are like "publisher.name-version"
                parts = entry.rsplit("-", 1)
                if len(parts) == 2:
                    installed.add(parts[0].lower())
        except OSError:
            continue

    all_ok = True
    for ext in REQUIRED_VSCODE_EXTENSIONS:
        if ext.lower() in installed:
            ok(f"VS Code extension: {C.WHITE}{ext}{C.RESET}")
        else:
            warn(f"VS Code extension not found: {C.WHITE}{ext}{C.RESET}")
            info(f"  Install manually: {C.YELLOW}code --install-extension {ext}{C.RESET}")
            all_ok = False
    return all_ok
