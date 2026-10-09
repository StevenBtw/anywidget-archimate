"""Tests for the assembled widget module (ESM string) and its JavaScript helpers.

The module must load without network access (dagre is bundled) and render in a
host that only provides the anywidget model contract. Node.js runs the JavaScript
checks (`node --test tests/js/*.test.mjs`); they are skipped where Node.js is not installed.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

from anywidget_archimate.ui import get_esm

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
needs_node = pytest.mark.skipif(NODE is None, reason="Node.js is not installed")


def test_the_module_makes_no_network_imports():
    esm = get_esm()

    assert not re.search(r"""\bimport\b[^;]*?["']https?://""", esm)
    assert "esm.sh" not in esm


@needs_node
def test_the_module_loads_offline_and_exports_render(tmp_path):
    module = tmp_path / "widget.mjs"
    module.write_text(get_esm(), encoding="utf-8")
    probe = "const m = await import(process.argv[1]); console.log(typeof m.default.render);"

    proc = subprocess.run(
        [NODE, "--input-type=module", "-e", probe, module.as_uri()],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )

    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == "function"


@needs_node
def test_javascript_helpers():
    tests = sorted(str(path) for path in (ROOT / "tests" / "js").glob("*.test.mjs"))
    proc = subprocess.run(
        [NODE, "--test", *tests], capture_output=True, text=True, encoding="utf-8", cwd=ROOT, check=False
    )

    assert proc.returncode == 0, f"{proc.stdout}\n{proc.stderr}"


def test_the_widget_syncs_highlight_ids():
    from anywidget_archimate import ArchiMate

    widget = ArchiMate(highlight_ids=["n1", "n2"])

    assert widget.highlight_ids == ["n1", "n2"]
    assert widget.trait_metadata("highlight_ids", "sync") is True
    assert ArchiMate().highlight_ids == []
