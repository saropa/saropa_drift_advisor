# -*- coding: utf-8 -*-
"""Regression tests for the publish pipeline's Dart analyze gate.

Pins modules.dart_build.run_analysis to invoke the EXACT command the publish
CI runs (`flutter analyze --fatal-warnings`) with the saropa_lints plugins block
left intact.

The defect these tests guard against: run_analysis previously stripped the
``plugins:`` block from analysis_options.yaml and ran ``--fatal-infos``, which
disabled saropa_lints locally — the very rules CI enforces with
``--fatal-warnings``. The local gate then passed on code CI would reject, the
script committed/tagged/pushed, the VS Code extension published, and only CI
caught the warnings — blocking pub.dev after one store had already shipped. The
pre-publish gate must run the same analyzer configuration CI does, or it is not
a gate.
"""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules import dart_build


def _fake_result(returncode: int) -> subprocess.CompletedProcess[str]:
    """A CompletedProcess stand-in with the fields print_cmd_output reads."""
    return subprocess.CompletedProcess(
        args=["flutter", "analyze", "--fatal-warnings"],
        returncode=returncode,
        stdout="",
        stderr="",
    )


class TestRunAnalysisMatchesCi(unittest.TestCase):
    def test_invokes_fatal_warnings_not_fatal_infos(self) -> None:
        """The gate runs `flutter analyze --fatal-warnings` — byte-for-byte the
        CI command — so a clean local run guarantees a clean CI analyze."""
        captured: list[list[str]] = []

        def _capture(cmd, **kwargs):
            captured.append(cmd)
            return _fake_result(0)

        with patch.object(dart_build, "run", _capture):
            passed = dart_build.run_analysis()

        self.assertTrue(passed)
        self.assertEqual(captured, [["flutter", "analyze", "--fatal-warnings"]])
        # --fatal-infos was the defective threshold; it must never come back.
        self.assertNotIn("--fatal-infos", captured[0])

    def test_does_not_mutate_analysis_options(self) -> None:
        """The gate must not strip/restore the plugins block: saropa_lints has
        to run exactly as it does in CI. run_analysis touches no files now, so a
        reintroduced backup/restore path (the old plugin-strip) would surface as
        an unexpected file write here."""
        writes: list[str] = []
        real_open = open

        def _tracking_open(file, mode="r", *args, **kwargs):
            if any(flag in mode for flag in ("w", "a", "x", "+")):
                writes.append(str(file))
            return real_open(file, mode, *args, **kwargs)

        with patch.object(dart_build, "run", lambda *a, **k: _fake_result(0)):
            with patch("builtins.open", _tracking_open):
                dart_build.run_analysis()

        offenders = [w for w in writes if "analysis_options" in w]
        self.assertEqual(
            offenders, [], f"run_analysis must not write analysis_options*: {offenders}"
        )

    def test_nonzero_exit_fails_the_gate(self) -> None:
        """A warning/error from analyze (CI exit 1) fails the local gate too, so
        the publish stops before any commit/tag/push triggers CI."""
        with patch.object(dart_build, "run", lambda *a, **k: _fake_result(1)):
            self.assertFalse(dart_build.run_analysis())


if __name__ == "__main__":
    unittest.main()
