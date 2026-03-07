# -*- coding: utf-8 -*-
"""Dev environment checks (VS Code CLI, global npm packages, extensions).

VS Code CLI, global npm packages, and VS Code extensions are
developer conveniences — non-blocking warnings if unavailable,
but will auto-install if missing and the tools are reachable.
"""

import json
import shutil

from modules.constants import (
    C,
    REQUIRED_GLOBAL_NPM_PACKAGES,
    REQUIRED_VSCODE_EXTENSIONS,
)
from modules.display import fail, fix, info, ok, warn
from modules.utils import run


def check_vscode_cli() -> bool:
    """Verify the 'code' CLI is available (non-blocking).

    The code CLI is needed for auto-installing .vsix files and
    VS Code extensions. If missing, the user can still install manually.
    """
    if not shutil.which("code"):
        warn("VS Code CLI (code) not found on PATH.")
        info(f"  Open VS Code > {C.YELLOW}Ctrl+Shift+P{C.RESET} > "
             f"'{C.WHITE}Shell Command: Install code command in PATH{C.RESET}'")
        return True  # non-blocking
    ok("VS Code CLI (code) available on PATH")
    return True


def check_global_npm_packages() -> bool:
    """Check and install required global npm packages.

    Parses `npm list -g --json` to find what's already installed,
    then auto-installs any missing packages from REQUIRED_GLOBAL_NPM_PACKAGES.
    """
    if not REQUIRED_GLOBAL_NPM_PACKAGES:
        ok("No global npm packages required")
        return True

    all_ok = True
    result = run(["npm", "list", "-g", "--depth=0", "--json"], check=False)

    # Parse the JSON output to see which packages are already installed.
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
            install_result = run(
                ["npm", "install", "-g", pkg], check=False,
            )
            if install_result.returncode != 0:
                fail(f"Failed to install {pkg}: "
                     f"{install_result.stderr.strip()}")
                all_ok = False
            else:
                ok(f"Installed: {C.WHITE}{pkg}{C.RESET}")
    return all_ok


def check_vscode_extensions() -> bool:
    """Check and install required VS Code extensions.

    Skips silently if the 'code' CLI isn't available. Otherwise lists
    installed extensions and auto-installs any that are missing from
    REQUIRED_VSCODE_EXTENSIONS.
    """
    if not REQUIRED_VSCODE_EXTENSIONS:
        ok("No VS Code extensions required")
        return True

    if not shutil.which("code"):
        warn("Skipping VS Code extension check — 'code' CLI not available.")
        return True

    result = run(["code", "--list-extensions"], check=False)
    if result.returncode != 0:
        warn("Could not list VS Code extensions.")
        return True

    # Case-insensitive comparison for extension IDs
    installed = set(result.stdout.strip().lower().splitlines())

    all_ok = True
    for ext in REQUIRED_VSCODE_EXTENSIONS:
        if ext.lower() in installed:
            ok(f"VS Code extension: {C.WHITE}{ext}{C.RESET}")
        else:
            fix(f"Installing VS Code extension: {C.WHITE}{ext}{C.RESET}")
            install_result = run(
                ["code", "--install-extension", ext], check=False,
            )
            if install_result.returncode != 0:
                fail(f"Failed to install {ext}: "
                     f"{install_result.stderr.strip()}")
                all_ok = False
            else:
                ok(f"Installed: {C.WHITE}{ext}{C.RESET}")
    return all_ok
