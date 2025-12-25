"""
Test package initializer.
"""

import tempfile
import unittest
from pathlib import Path


class TempDirTestCase(unittest.TestCase):
    """Base test class that provides a temporary directory for each test."""

    tmpdir: Path
    _tmpdir_obj: tempfile.TemporaryDirectory

    def setUp(self) -> None:
        super().setUp()
        self._tmpdir_obj = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmpdir_obj.name)

    def tearDown(self) -> None:
        self._tmpdir_obj.cleanup()
        super().tearDown()
