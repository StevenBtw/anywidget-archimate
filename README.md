# anywidget-archimate

Interactive ArchiMate model viewer for Jupyter, Marimo, and VS Code notebooks.

Renders ArchiMate models from Open Exchange Format XML or Archi `.archimate` files, or from Python data, in layer bands from top to bottom:

- **Lilac:** Motivation
- **Tan:** Strategy
- **Yellow:** Business
- **Blue:** Application
- **Green:** Technology, including the Physical elements
- **Pink:** Implementation & Migration
- **Grey:** Other (Location, Grouping, and any other layer)

A band only appears when the model has elements in it. Every ArchiMate 3.2 element type is drawn with its notation icon, junctions as small dots (filled for And, hollow for Or) in the band of the elements they join, and all 11 relationship types with their notation. Elements joined by Composition or Aggregation are nested.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/StevenBtw/anywidget-archimate/main/assets/archimate-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/StevenBtw/anywidget-archimate/main/assets/archimate-light.png">
  <img alt="anywidget-archimate demo" src="https://raw.githubusercontent.com/StevenBtw/anywidget-archimate/main/assets/archimate-light.png">
</picture>

## Install

```bash
uv add anywidget-archimate
```

## Usage

```python
from anywidget_archimate import ArchiMate

# From an XML file
widget = ArchiMate.from_xml("model.xml")
widget
```

```python
# Or load later
widget = ArchiMate()
widget.load_xml("model.xml")
```

### From Python data

```python
widget = ArchiMate(
    elements=[
        {"id": "a1", "name": "Web shop", "type": "ApplicationComponent", "layer": "Application", "documentation": ""},
        {"id": "t1", "name": "App server", "type": "Node", "layer": "Technology", "documentation": ""},
    ],
    relationships=[
        {"id": "r1", "source": "t1", "target": "a1", "type": "Serving", "name": ""},
    ],
    height=500,
)
```

- `layer` is `Motivation`, `Strategy`, `Business`, `Application`, `Technology`, `Implementation` or `Other`, in any case; `Implementation & Migration` and `Physical` (Technology) work too. Without a layer, or with one the widget does not know, the element goes to the layer of its type, else to Other.
- `type` is an ArchiMate 3.2 element type such as `BusinessProcess`, `Capability`, `Goal` or `WorkPackage`; a junction is `AndJunction` or `OrJunction`. Other types draw as a plain box.
- Relationship `type` is one of `Composition`, `Aggregation`, `Assignment`, `Realization`, `Serving`, `Access`, `Influence`, `Triggering`, `Flow`, `Specialization` or `Association`.
- Names, documentation and the other values are shown as text, never as HTML.

### Selection and highlights

Clicking an element sets `selected_element` to its dict and opens its details. The host can also select or outline elements:

```python
widget.selected_element = {"id": "a1"}  # a dict with at least the id
widget.highlight_ids = ["a1", "t1"]     # outline several elements
widget.observe(lambda change: print(change["new"]), names="selected_element")
```

### Comparison styling

To show several runs of one model, give elements and relationships an optional `status`:

| `status` | Element | Relationship |
| --- | --- | --- |
| `partial` | dashed and faded | faded |
| `changed` | amber fill | amber line |
| `only_a` | red fill | red line |
| `only_b` | green fill | green line |
| `ghost` | very faint and dashed | very faint |

`stable` or no status draws as usual. An optional `badge` on an element (for example `"2/3"`) is drawn in its top left corner; text longer than 26 characters is cut.

### Toolbar

The toolbar opens the filter panel (hide layers, element types and relationship types, or turn off nesting), uploads an `.xml` or `.archimate` file, exports the diagram as SVG or PNG, fits the diagram to the view and switches between light and dark. The theme follows the host page (marimo, Jupyter, VS Code, or the operating system) unless you choose one: pass `dark_mode=True` or `dark_mode=False`, set `widget.dark_mode`, or use the toolbar switch.

## Development

```bash
git clone https://github.com/StevenBtw/anywidget-archimate.git
cd anywidget-archimate
uv sync
uv run pytest
```

The `examples/demo_marimo.py` example needs marimo, which is an optional extra:

```bash
uv sync --extra examples
```

## License

Apache-2.0
