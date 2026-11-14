"""Demo: render a large ArchiMate model in Archi's native format (.archimate).

Run it in a notebook or an interactive window (Jupyter, VS Code), where the last line shows the widget;
set MODEL_PATH to the model file first.
"""

from anywidget_archimate import ArchiMate

MODEL_PATH = "model.archimate"  # the path of an Archi model file

widget = ArchiMate.from_xml(MODEL_PATH)
widget  # noqa: B018  (display in notebook)
