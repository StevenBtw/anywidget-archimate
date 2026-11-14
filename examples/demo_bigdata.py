"""Demo: render a large ArchiMate model in Archi's native format (.archimate).

Pass the model's path: python examples/demo_bigdata.py path/to/model.archimate
"""

import sys

from anywidget_archimate import ArchiMate

widget = ArchiMate.from_xml(sys.argv[1] if len(sys.argv) > 1 else "model.archimate")
widget  # noqa: B018  (display in notebook)
