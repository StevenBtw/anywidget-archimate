"""ESM and CSS bundler for the ArchiMate widget.

Reads JS/CSS files from disk at import time and assembles them into a single
ESM module string with CDN imports, following the anywidget-graph pattern.
"""

from __future__ import annotations

from pathlib import Path

_UI_DIR = Path(__file__).parent


def _read_file(path: Path) -> str:
    """Read a file and return its contents."""
    return path.read_text(encoding="utf-8")


def get_esm() -> str:
    """Build the ESM module string for the widget."""
    index_js = _read_file(_UI_DIR / "index.js")

    return f"""
import dagre from "https://esm.sh/dagre@0.8.5";

{index_js}

export default {{ render }};
"""


def get_css() -> str:
    """Return the CSS for the widget."""
    return _read_file(_UI_DIR / "styles.css")
