"""ArchiMate anywidget - Interactive ArchiMate model viewer."""

from __future__ import annotations

from pathlib import Path

import anywidget
import traitlets

from anywidget_archimate.parser import parse_xml
from anywidget_archimate.ui import get_css, get_esm


class ArchiMate(anywidget.AnyWidget):
    """Interactive ArchiMate model viewer widget.

    Renders ArchiMate elements in a layered diagram with:
    - Yellow for Business layer (top)
    - Blue for Application layer (middle)
    - Green for Technology layer (bottom)
    - Proper ArchiMate relationship arrows
    """

    _esm = get_esm()
    _css = get_css()

    # Graph data (synced to browser)
    elements = traitlets.List(trait=traitlets.Dict()).tag(sync=True)
    relationships = traitlets.List(trait=traitlets.Dict()).tag(sync=True)

    # Display settings
    width = traitlets.Unicode(default_value="100%").tag(sync=True)
    height = traitlets.Int(default_value=700).tag(sync=True)
    dark_mode = traitlets.Bool(default_value=True).tag(sync=True)

    # Interaction state
    selected_element = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)

    @classmethod
    def from_xml(cls, source: str | Path, **kwargs) -> ArchiMate:
        """Create widget from ArchiMate XML file or string.

        Args:
            source: Path to XML file or XML string.
            **kwargs: Additional widget parameters.
        """
        elements, relationships = parse_xml(source)
        return cls(elements=elements, relationships=relationships, **kwargs)

    def load_xml(self, source: str | Path) -> None:
        """Load ArchiMate XML into the widget, replacing current content.

        Args:
            source: Path to XML file or XML string.
        """
        elements, relationships = parse_xml(source)
        self.elements = elements
        self.relationships = relationships
