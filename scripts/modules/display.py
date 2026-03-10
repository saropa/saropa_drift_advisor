# -*- coding: utf-8 -*-
"""Terminal display helpers and the Saropa logo."""

from modules.constants import C


# ── Display Helpers ──────────────────────────────────────────


def heading(text: str) -> None:
    """Print a bold section heading."""
    bar = "=" * 60
    print(f"\n{C.CYAN}{bar}{C.RESET}")
    print(f"  {C.BOLD}{C.WHITE}{text}{C.RESET}")
    print(f"{C.CYAN}{bar}{C.RESET}")


def ok(text: str) -> None:
    print(f"  {C.GREEN}[OK]{C.RESET}   {text}")


def fix(text: str) -> None:
    """An issue was found and automatically repaired."""
    print(f"  {C.MAGENTA}[FIX]{C.RESET}  {text}")


def fail(text: str) -> None:
    print(f"  {C.RED}[FAIL]{C.RESET} {text}")


def warn(text: str) -> None:
    print(f"  {C.YELLOW}[WARN]{C.RESET} {text}")


def info(text: str) -> None:
    print(f"  {C.BLUE}[INFO]{C.RESET} {text}")


def print_cmd_output(result) -> None:
    """Print stdout/stderr from a subprocess result (if non-empty)."""
    if hasattr(result, "stdout") and result.stdout and result.stdout.strip():
        print(result.stdout)
    if hasattr(result, "stderr") and result.stderr and result.stderr.strip():
        print(result.stderr)


def dim(text: str) -> str:
    """Wrap text in dim ANSI codes for secondary information."""
    return f"{C.DIM}{text}{C.RESET}"


def ask_yn(question: str, default: bool = True) -> bool:
    """Prompt the user with a yes/no question. Returns the boolean answer.

    Handles EOF and Ctrl+C gracefully by returning the default.
    """
    hint = "Y/n" if default else "y/N"
    try:
        answer = input(
            f"  {C.YELLOW}{question} [{hint}]: {C.RESET}",
        ).strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return default
    if not answer:
        return default
    return answer in ("y", "yes")


# cSpell:disable
def show_logo(version: str) -> None:
    """Print the Saropa rainbow-gradient logo and script version."""
    logo = f"""
{C.ORANGE_208}                               ....{C.RESET}
{C.ORANGE_208}                       `-+shdmNMMMMNmdhs+-{C.RESET}
{C.ORANGE_209}                    -odMMMNyo/-..````.++:+o+/-{C.RESET}
{C.YELLOW_215}                 `/dMMMMMM/`            ````````{C.RESET}
{C.YELLOW_220}                `dMMMMMMMMNdhhhdddmmmNmmddhs+-{C.RESET}
{C.YELLOW_226}                QMMMMMMMMMMMMMMMMMMMMMMMMMMMMMNhs{C.RESET}
{C.GREEN_190}              . :sdmNNNNMMMMMNNNMMMMMMMMMMMMMMMMm+{C.RESET}
{C.GREEN_154}              o     `..~~~::~+==+~:/+sdNMMMMMMMMMMMo{C.RESET}
{C.GREEN_118}              m                        .+NMMMMMMMMMN{C.RESET}
{C.CYAN_123}              m+                         :MMMMMMMMMm{C.RESET}
{C.CYAN_87}              qN:                        :MMMMMMMMMF{C.RESET}
{C.BLUE_51}               oNs.                    `+NMMMMMMMMo{C.RESET}
{C.BLUE_45}                :dNy\\.              ./smMMMMMMMMm:{C.RESET}
{C.BLUE_39}                 `TdMNmhyso+++oosydNNMMMMMMMMMdP+{C.RESET}
{C.BLUE_33}                    .odMMMMMMMMMMMMMMMMMMMMdo-{C.RESET}
{C.BLUE_57}                       `-+shdNNMMMMNNdhs+-{C.RESET}
{C.BLUE_57}                               ````{C.RESET}

  {C.PINK_195}Drift Viewer -- Extension Publish Pipeline{C.RESET}
  {C.LIGHT_BLUE_117}Extension v{version}{C.RESET}
"""
    print(logo)
    print(f"{C.CYAN}{'-' * 60}{C.RESET}")
# cSpell:enable
