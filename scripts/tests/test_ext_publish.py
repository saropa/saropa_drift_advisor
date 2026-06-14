# -*- coding: utf-8 -*-
"""Unit tests for modules.ext_publish idempotency handling.

Marketplace/Open VSX listings lag publish acceptance by minutes (store CDN
propagation). A ``--resume`` retry can therefore read a stale older version,
miss the version-skip guard, and re-attempt a publish the store rejects with
an "already exists" / "already published" message. ``_already_published``
classifies that rejection so the publish helpers treat it as success instead
of aborting the pipeline. These tests pin that classification across the exact
phrasings vsce and ovsx emit, and confirm genuine failures still fail.
"""

from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.ext_publish import _already_published


def _result(stdout: str = "", stderr: str = "") -> SimpleNamespace:
    return SimpleNamespace(returncode=1, stdout=stdout, stderr=stderr)


class TestAlreadyPublished(unittest.TestCase):
    """Branch coverage for _already_published across registry phrasings."""

    def test_vsce_already_exists_on_stderr(self) -> None:
        # vsce reports the collision on stderr in this exact shape.
        result = _result(stderr="ERROR  saropa.drift-viewer v4.0.1 already exists.")
        self.assertTrue(_already_published(result))

    def test_vsce_already_exists_on_stdout(self) -> None:
        result = _result(stdout="saropa.drift-viewer v4.0.1 already exists.")
        self.assertTrue(_already_published(result))

    def test_ovsx_already_published(self) -> None:
        # ovsx uses "already published" rather than "already exists".
        result = _result(
            stderr="Extension saropa.drift-viewer version 4.0.1 is already published."
        )
        self.assertTrue(_already_published(result))

    def test_case_insensitive(self) -> None:
        result = _result(stderr="ALREADY EXISTS")
        self.assertTrue(_already_published(result))

    def test_genuine_failure_not_misclassified(self) -> None:
        # A real failure (auth, network) must still be treated as a failure.
        result = _result(stderr="ERROR  401 Unauthorized: invalid personal access token")
        self.assertFalse(_already_published(result))

    def test_empty_output(self) -> None:
        self.assertFalse(_already_published(_result()))

    def test_missing_attributes(self) -> None:
        # Defensive: a result object lacking stdout/stderr must not raise.
        self.assertFalse(_already_published(SimpleNamespace(returncode=1)))


if __name__ == "__main__":
    unittest.main()
