"""Demo: render the sample ArchiMate model."""

from pathlib import Path

from anywidget_archimate import ArchiMate

sample_xml = Path(__file__).parent / "sample.xml"

# Create widget from XML file
widget = ArchiMate.from_xml(sample_xml)
widget  # display in notebook
