# -*- coding: utf-8 -*-
"""Terminal display helpers, publish log, and the Saropa logo."""

import os
import re
import sys
import time
from datetime import datetime

from modules.constants import C, REPO_ROOT


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


def coverage_color(pct: float) -> str:
    """Pick a severity color for a coverage percentage so the audit summary can be
    scanned at a glance: red below a third, yellow up to near-complete, green at or
    above near-complete. Thresholds are intentionally generous on the yellow band —
    a locale is only "green" once it is essentially shipped."""
    if pct < 33.3:
        return C.RED
    if pct < 90.0:
        return C.YELLOW
    return C.GREEN


# ── Live Progress Meter ──────────────────────────────────────


def _fmt_duration(seconds: float) -> str:
    """Format a duration as M:SS (or H:MM:SS past an hour) for the ETA readout.

    Returns a placeholder for a non-finite estimate (no throughput yet) instead of
    raising, so the meter can render before the first item completes.
    """
    if seconds != seconds or seconds == float("inf") or seconds < 0:  # NaN / inf / <0
        return "--:--"
    total = int(seconds)
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


class ProgressMeter:
    """Live single-line progress bar carrying a words-per-minute rate and an ETA.

    The rate and ETA are derived from WORDS processed, not item count, on purpose:
    translation keys span a single word to whole paragraphs, so an item-count ETA
    swings wildly while a word-rate settles quickly and predicts the finish far more
    steadily.

    On a TTY it redraws in place with a carriage return. On a non-TTY (pipe / file /
    CI) it instead prints one milestone line per ~10% so a redirected log stays
    readable rather than filling with control characters.
    """

    def __init__(
        self,
        label: str,
        total_items: int,
        total_words: int,
        width: int = 22,
        stream=None,
    ) -> None:
        self.label = label
        self.total_items = max(int(total_items), 0)
        self.total_words = max(int(total_words), 0)
        self.width = width
        self.stream = stream or sys.stdout
        # Start the clock at construction (after the one-time model load), so the
        # WPM rate reflects steady-state translation throughput, not warm-up.
        self._start = time.monotonic()
        self._tty = bool(getattr(self.stream, "isatty", lambda: False)())
        self._last_bucket = -1  # last 10% milestone emitted in non-TTY mode

    def _rate_and_eta(self, done_words: int) -> tuple[float, float]:
        """Return (words-per-minute, eta-seconds) from elapsed wall time.

        Yields a 0 rate and an infinite ETA until at least one word has completed,
        which the duration formatter renders as a placeholder.
        """
        elapsed = time.monotonic() - self._start
        if done_words <= 0 or elapsed <= 0:
            return 0.0, float("inf")
        wpm = done_words / elapsed * 60.0
        remaining_words = max(self.total_words - done_words, 0)
        eta = remaining_words / (done_words / elapsed)
        return wpm, eta

    def update(self, done_items: int, done_words: int) -> None:
        """Redraw the bar for the given progress (items position, words for rate)."""
        frac = (done_items / self.total_items) if self.total_items else 1.0
        frac = min(max(frac, 0.0), 1.0)
        wpm, eta = self._rate_and_eta(done_words)

        if self._tty:
            filled = int(round(frac * self.width))
            bar = (
                f"{C.GREEN}{'█' * filled}{C.RESET}"
                f"{C.DIM}{'░' * (self.width - filled)}{C.RESET}"
            )
            line = (
                f"  {C.BOLD}{self.label:>6}{C.RESET} "
                f"[{bar}] {C.CYAN}{frac * 100:5.1f}%{C.RESET}  "
                f"{done_items}/{self.total_items} keys "
                f"{C.DIM}·{C.RESET} {C.YELLOW}{wpm:4.0f} wpm{C.RESET} "
                f"{C.DIM}·{C.RESET} ETA {C.WHITE}{_fmt_duration(eta)}{C.RESET}"
            )
            # Trailing spaces clear any tail left by a previously longer line.
            self.stream.write("\r" + line + "   ")
            self.stream.flush()
            return

        # Non-TTY: one line per 10% bucket so a redirected log stays readable.
        bucket = int(frac * 10)
        if bucket > self._last_bucket:
            self._last_bucket = bucket
            self.stream.write(
                f"  {self.label}: {frac * 100:.0f}% "
                f"({done_items}/{self.total_items}) "
                f"{wpm:.0f} wpm ETA {_fmt_duration(eta)}\n"
            )
            self.stream.flush()

    def finish(self) -> None:
        """End the in-place line (TTY only) so following output starts on its own."""
        if self._tty:
            self.stream.write("\n")
            self.stream.flush()


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


def ask_choice(
    question: str,
    choices: tuple[str, ...],
    default: str,
    eof_default: str | None = None,
) -> str:
    """Prompt the user to pick one choice from a fixed list.

    Args:
        question: Prompt text shown before the available options.
        choices: Allowed lowercase values (for example: ("retry", "skip", "abort")).
        default: Value returned when the user presses Enter (the interactive default).
        eof_default: Value returned on EOF / Ctrl+C (no human at the keyboard).
            Defaults to ``default`` when omitted. Callers whose interactive
            default is a *retry* must set this to a terminal choice (e.g.
            "abort") — otherwise a closed stdin would re-issue the same failing
            step forever, because EOF would map to retry on every iteration.

    Returns:
        The selected normalized choice value.
    """
    normalized = tuple(choice.strip().lower() for choice in choices if choice.strip())
    if not normalized:
        raise ValueError("choices must include at least one non-empty option")
    if default.lower() not in normalized:
        raise ValueError("default must be one of choices")
    # When no explicit EOF fallback is given, mirror the interactive default.
    eof_choice = (eof_default if eof_default is not None else default).lower()
    if eof_choice not in normalized:
        raise ValueError("eof_default must be one of choices")

    # Build a map from first-letter abbreviation to full choice name,
    # so the user can type "r" instead of "retry", etc.  If two choices
    # share the same first letter the abbreviation is disabled for both
    # and the user must type the full word.
    first_letter: dict[str, str] = {}
    collisions: set[str] = set()
    for choice in normalized:
        letter = choice[0]
        if letter in first_letter:
            collisions.add(letter)
        else:
            first_letter[letter] = choice
    for letter in collisions:
        first_letter.pop(letter, None)

    # Format hint as "[R]etry, [S]kip, [A]bort" with the default marked.
    parts: list[str] = []
    for choice in normalized:
        letter = choice[0]
        # Capitalize the shortcut letter in brackets when it's unambiguous.
        if letter in first_letter:
            label = f"[{letter.upper()}]{choice[1:]}"
        else:
            label = choice
        if choice == default.lower():
            label += " (default)"
        parts.append(label)
    hint = ", ".join(parts)

    while True:
        try:
            raw = input(
                f"  {C.YELLOW}{question} {hint}: {C.RESET}",
            ).strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return eof_choice
        if not raw:
            return default.lower()
        if raw in normalized:
            return raw
        # Accept single-letter abbreviation when unambiguous.
        if raw in first_letter:
            return first_letter[raw]
        warn(f"Invalid choice '{raw}'. Please choose one of: {', '.join(normalized)}.")


# ── Publish Log (tee stdout to file) ────────────────────────

_ANSI_RE = re.compile(r"\033\[[0-9;]*m")
_original_stdout = None
_log_file = None


class _TeeWriter:
    """Wraps stdout to also write ANSI-stripped text to a log file."""

    def __init__(self, terminal, logfile):
        self.terminal = terminal
        self.logfile = logfile

    def write(self, text):
        self.terminal.write(text)
        self.logfile.write(_ANSI_RE.sub("", text))

    def flush(self):
        self.terminal.flush()
        self.logfile.flush()

    def isatty(self):
        return self.terminal.isatty()

    @property
    def encoding(self):
        return self.terminal.encoding


def open_publish_log() -> None:
    """Start teeing stdout to reports/YYYYMMDD/YYYYMMDD_publish_report.log."""
    global _original_stdout, _log_file  # noqa: PLW0603
    now = datetime.now()
    date_dir = os.path.join(REPO_ROOT, "reports", now.strftime("%Y%m%d"))
    os.makedirs(date_dir, exist_ok=True)
    path = os.path.join(
        date_dir, f"{now:%Y%m%d}_publish_report.log",
    )
    _log_file = open(path, "w", encoding="utf-8")  # noqa: SIM115
    _original_stdout = sys.stdout
    sys.stdout = _TeeWriter(_original_stdout, _log_file)


def close_publish_log() -> None:
    """Stop teeing and close the log file."""
    global _original_stdout, _log_file  # noqa: PLW0603
    if _original_stdout is None:
        return
    path = _log_file.name
    sys.stdout = _original_stdout
    _log_file.close()
    _original_stdout = None
    _log_file = None
    rel = os.path.relpath(path, REPO_ROOT)
    ok(f"Publish log: {C.WHITE}{rel}{C.RESET}")


# ── Logo ─────────────────────────────────────────────────────

# cSpell:disable
def show_logo(version: str = "") -> None:
    """Print the Saropa rainbow-gradient logo and optional version."""
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

  {C.PINK_195}Saropa Drift Advisor -- Publish Pipeline{C.RESET}"""
    print(logo)
    if version:
        print(f"  {C.LIGHT_BLUE_117}v{version}{C.RESET}")
    print(f"\n{C.CYAN}{'-' * 60}{C.RESET}")
# cSpell:enable
