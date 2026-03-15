# Changelog

## [0.1.4] - (2026-03-16)

### New Features

- **Automatic theme detection**: Auto-detects host dark mode (marimo Tailwind `class="dark"`, `data-theme`, or `prefers-color-scheme`) and syncs the widget theme automatically — dark mode toggle is hidden when the host controls the theme

### Improvements

- **Neutral grey palette**: Light and dark mode colors updated to neutral grey tones for a cleaner look and better integration with marimo

## [0.1.3] - (2026-03-15)

### New Features

- **Upload button**: Toolbar button to load `.xml` or `.archimate` files directly from the browser — no Python code needed to switch models
- **Export to SVG**: Download the current diagram as a self-contained SVG file with inlined fonts
- **Export to PNG**: Download the current diagram as a high-resolution (2x) PNG with correct light/dark background

## [0.1.2] - (2026-03-15)

### New Features

- **Demo module**: Built-in `demo_archimate()` function that creates a pre-populated ArchiMate widget with a sample enterprise architecture model (12 elements across Business, Application, and Technology layers) — no external files needed

## [0.1.1] - (2026-03-15)

### New Features

- **ArchiMate icons**: Standard SVG icons for all 13 element types (stick figure for BusinessActor, component tabs for ApplicationComponent, 3D box for Node, gear for BusinessFunction, etc.)
- **Filter sidebar**: Collapsible left panel with per-layer, per-element-type, and per-relationship-type checkboxes with counts and "all / none" toggles
- **Nest elements**: Composition and Aggregation relationships rendered as visual nesting with a toggle checkbox in the filter panel
- **Archi native format**: Parser now supports both Open Exchange Format XML and Archi tool `.archimate` files

### Improvements

- **Guaranteed layer separation**: Per-layer independent layout ensures Business is always on top, Application in the middle, Technology at the bottom
- **Left-to-right flow**: Within-layer dagre layout uses LR direction for natural process/flow reading order
- **ArchiMate notation compliance**: Rounded corners for behavior elements (Process, Function, Service, Event), square corners for structure/passive elements
- **Archi standard colors**: Application layer updated to cyan (`#B5FFFF`), hollow triangle marker for Realization and Specialization
- **Orthogonal edge routing**: Cross-layer edges use V-H-V (vertical-horizontal-vertical) segments with right angles instead of diagonal lines
- **Port distribution**: Multiple edges from the same node fan out across the node edge instead of bundling at center
- **Jog offset**: Parallel horizontal edge segments are spaced apart to prevent overlap
- **Barycenter optimization**: 3-pass iterative algorithm (top-down, bottom-up, top-down) repositions nodes to minimize total cross-layer edge length
- **Disconnected node layout**: Orphaned elements arranged in horizontal rows instead of vertical stacking
- **Dark mode default**: Dark theme enabled by default
- **CI**: Added Python 3.14 to test matrix

## [0.1.0] - (2026-03-15)

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
