"""Demo: render the reference bigdata ArchiMate model (Archi native format)."""

from anywidget_archimate import ArchiMate

widget = ArchiMate.from_xml(r"H:\Deriva\deriva\reference\reference_bigdata.archimate")
widget
