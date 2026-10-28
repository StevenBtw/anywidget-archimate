"""ArchiMate anywidget - Interactive ArchiMate model viewer."""

from __future__ import annotations

from pathlib import Path

import anywidget
import traitlets

from anywidget_archimate.parser import parse_xml
from anywidget_archimate.ui import get_css, get_esm


class _ChosenBool(traitlets.Bool):
    """A theme trait that records a choice in its `flag` trait whenever Python assigns it.

    Assigning the value the trait already has counts too: `widget.dark_mode = True` on a dark page keeps the widget
    dark after the page turns light. Values the widget writes from the browser arrive through `set_state` and are not
    a choice. Shared with anywidget-graph and anywidget-vector.
    """

    def __init__(self, *args, flag: str, **kwargs):
        super().__init__(*args, **kwargs)
        self.flag = flag

    def set(self, obj, value):
        super().set(obj, value)
        if not obj._applying_frontend_state:
            obj.set_trait(self.flag, True)


class ArchiMate(anywidget.AnyWidget):
    """Interactive ArchiMate model viewer widget.

    Renders ArchiMate 3.2 elements in layer bands, top to bottom: Motivation, Strategy, Business, Application,
    Technology (with Physical), Implementation & Migration and Other, with ArchiMate notation icons and
    relationship arrows.
    """

    _esm = get_esm()
    _css = get_css()

    # Graph data (synced to browser)
    elements = traitlets.List(trait=traitlets.Dict()).tag(sync=True)
    relationships = traitlets.List(trait=traitlets.Dict()).tag(sync=True)

    # Display settings
    width = traitlets.Unicode(default_value="100%").tag(sync=True)
    height = traitlets.Int(default_value=700).tag(sync=True)
    dark_mode = _ChosenBool(default_value=True, flag="_theme_explicit").tag(sync=True)
    # True once dark_mode is chosen (given here, set from Python or the toolbar): the widget stops following the page
    _theme_explicit = traitlets.Bool(default_value=False).tag(sync=True)
    # True while state from the browser is applied (see set_state)
    _applying_frontend_state = False

    # Interaction state: a click sets selected_element to the element's dict; the host may set a dict
    # with at least the id, such as {"id": "n1"} (not the bare id), to outline that element
    selected_element = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)
    # Element ids the host wants outlined (for example all elements behind one difference)
    highlight_ids = traitlets.List(trait=traitlets.Unicode()).tag(sync=True)

    # File upload (browser → Python)
    _upload_xml = traitlets.Unicode(default_value="").tag(sync=True)

    def __init__(self, **kwargs):
        # dark_mode=None means "follow the page", like leaving it out
        if "dark_mode" in kwargs and kwargs["dark_mode"] is None:
            del kwargs["dark_mode"]
        super().__init__(**kwargs)

    def set_state(self, sync_data):
        """Apply state from the browser (Jupyter and marimo both call this): a dark_mode it carries is the widget
        following the page, or a choice the browser already recorded in _theme_explicit, not a choice made in Python."""
        self._applying_frontend_state = True
        try:
            super().set_state(sync_data)
        finally:
            self._applying_frontend_state = False

    @traitlets.observe("_upload_xml")
    def _on_upload_xml(self, change):
        xml = change["new"]
        if xml:
            elements, relationships = parse_xml(xml)
            self.elements = elements
            self.relationships = relationships
            self._upload_xml = ""  # reset

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
