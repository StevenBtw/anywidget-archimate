"""The widget's size: without a height it takes the shared anywidgets rule (the cell's width, 16:10, between what the
chrome needs and 80% of the screen); a height in pixels still sets the diagram row, as before."""

from __future__ import annotations

from anywidget_archimate import ArchiMate


def test_height_defaults_to_the_shared_rule():
    assert ArchiMate().height == 0


def test_a_height_given_is_kept():
    assert ArchiMate(height=500).height == 500


def test_details_panel_shows_by_default():
    """A host with its own details view (Deriva Studio) sets show_details=False."""
    assert ArchiMate().show_details is True
    assert ArchiMate(show_details=False).show_details is False
