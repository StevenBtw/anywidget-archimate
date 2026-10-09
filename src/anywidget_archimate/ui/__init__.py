"""ESM and CSS bundler for the ArchiMate widget.

Reads the JS/CSS files from disk and assembles them into a single ESM module string.
dagre (MIT, ``vendor/dagre.min.js``) is bundled, so the widget makes no network
requests: its UMD wrapper fills a local ``module`` object instead of a global.
"""

from __future__ import annotations

from pathlib import Path

_UI_DIR = Path(__file__).parent


def _read_file(path: Path) -> str:
    """Read a file and return its contents."""
    return path.read_text(encoding="utf-8")


def _strip_exports(code: str) -> str:
    """Remove import lines and ``export`` keywords so modules can share one ESM scope."""
    lines = []
    for line in code.split("\n"):
        stripped = line.strip()
        if stripped.startswith("import "):
            continue
        if stripped.startswith("export "):
            line = line.replace("export ", "", 1)
        lines.append(line)
    return "\n".join(lines)


def _bundled_dagre() -> str:
    dagre_js = _read_file(_UI_DIR / "vendor" / "dagre.min.js")
    return f"const dagre = (() => {{\nconst module = {{ exports: {{}} }};\nconst exports = module.exports;\n{dagre_js}\nreturn module.exports;\n}})();"


def get_esm() -> str:
    """Build the ESM module string for the widget."""
    status_js = _read_file(_UI_DIR / "status.js")
    index_js = _read_file(_UI_DIR / "index.js")

    return f"""
// === dagre 0.8.5 (MIT, bundled) ===
{_bundled_dagre()}

// === Comparison styling, badges, theme ===
{_strip_exports(status_js)}

{index_js}

export default {{ render }};
"""


def get_css() -> str:
    """Return the CSS for the widget."""
    return _read_file(_UI_DIR / "styles.css")
