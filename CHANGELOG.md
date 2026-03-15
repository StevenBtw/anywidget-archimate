# Changelog

## 0.1.0

### New Features

- **ArchiMate XML parser**: Parses ArchiMate 3.0 Open Exchange Format XML with support for all 13 element types and 8 relationship types
- **Layered layout**: Automatic dagre-based layout with Business (top), Application (middle), Technology (bottom)
- **Layer coloring**: Yellow for Business, blue for Application, green for Technology
- **ArchiMate relationship arrows**: Correct marker notation for Composition (filled diamond), Aggregation (hollow diamond), Assignment (circle + arrow), Realization (dashed + hollow arrow), Serving (hollow arrow), Access (dashed + hollow arrow), Flow (dashed + filled arrow), Triggering (filled arrow)
- **Layer bands**: Semi-transparent background bands with labels for each architectural layer
- **Element badges**: Two-letter type badges (AC, BA, TS, etc.) on each element
- **Zoom and pan**: Mouse wheel zoom and drag-to-pan on the SVG diagram
- **Dark mode**: Toggle between light and dark themes
- **Details panel**: Click any element to see its name, type, layer, and documentation
- **anywidget integration**: Works in Jupyter, Marimo, and VS Code notebooks
- **`from_xml` / `load_xml`**: Load ArchiMate models from file path or XML string
