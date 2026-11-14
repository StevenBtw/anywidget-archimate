"""ESM and CSS for the ArchiMate widget.

The front end is TypeScript (ui/*.ts), bundled by esbuild into ui/dist/widget.js
(scripts/build-esm.mjs, `npm run build`; CI and tests/test_ui.py fail when it is stale).
The layout is the widget's own (ui/layout.ts), so the widget needs no other library and
makes no network requests.
"""

from __future__ import annotations

from pathlib import Path

_UI_DIR = Path(__file__).parent


def _read_file(path: Path) -> str:
    """Read a file and return its contents."""
    return path.read_text(encoding="utf-8")


def get_esm() -> str:
    """Return the ESM module for the widget: the esbuild bundle of the TypeScript front end."""
    return _read_file(_UI_DIR / "dist" / "widget.js")


def get_css() -> str:
    """Return the CSS for the widget."""
    return _read_file(_UI_DIR / "styles.css")
