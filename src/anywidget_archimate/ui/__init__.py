"""ESM and CSS for the ArchiMate widget.

The front end is TypeScript (ui/*.ts), bundled by esbuild into ui/dist/widget.js
(scripts/build-esm.mjs, `npm run build`; CI and tests/test_ui.py fail when it is stale).
dagre (MIT, ``vendor/dagre.min.js``) is inlined in front of the bundle, so the widget
makes no network requests: its UMD wrapper fills a local ``module`` object instead of
a global.
"""

from __future__ import annotations

from pathlib import Path

_UI_DIR = Path(__file__).parent


def _read_file(path: Path) -> str:
    """Read a file and return its contents."""
    return path.read_text(encoding="utf-8")


def _bundled_dagre() -> str:
    dagre_js = _read_file(_UI_DIR / "vendor" / "dagre.min.js")
    return f"const dagre = (() => {{\nconst module = {{ exports: {{}} }};\nconst exports = module.exports;\n{dagre_js}\nreturn module.exports;\n}})();"


def get_esm() -> str:
    """Build the ESM module string for the widget: bundled dagre, then the esbuild bundle of the TypeScript front end."""
    return f"""\
// === dagre 0.8.5 (MIT, bundled) ===
{_bundled_dagre()}

// === Auto-generated ESM bundle for anywidget-archimate (ui/dist/widget.js) ===
{_read_file(_UI_DIR / "dist" / "widget.js")}"""


def get_css() -> str:
    """Return the CSS for the widget."""
    return _read_file(_UI_DIR / "styles.css")
