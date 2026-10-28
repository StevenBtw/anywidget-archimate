# Changelog

## [0.4.1] - (2026-10-28)

### Fixes

- **One widget shown twice keeps following the page**: When the same widget was displayed in two places (two cells, or a cell and a sidebar), one view took the other's automatic theme update for a choice, and both stopped following the page after its first theme change. The guard for the widget's own updates is now seen by every view, also views from another copy of the module (a cell run again, a reconnect); it is the same guard anywidget-graph and anywidget-vector use
- **`dark_mode` set from Python is always kept**: `widget = ArchiMate(); widget.dark_mode = False`, then showing `widget`, rendered in the page's theme; only `dark_mode` given to the constructor was kept. Assigning `dark_mode` from Python now counts as a choice at any time, including the value it already has (`widget.dark_mode = True` on a dark page keeps it dark when the page turns light), while the browser's own updates (which arrive through `set_state`) still do not
- **`dark_mode=None`**: Means "follow the page", like leaving it out; before, it raised a `TraitError`

## [0.4.0] - (2026-10-28)

### Security

- **Details panel shows model data as text**: The name, id, type, layer and documentation of an element now go into the details panel as text. Before, markup in them ran as HTML when the element's details opened, for example `<img src=x onerror=...>` in a name or `<script>` in documentation. Upgrade if the widget shows models from sources you do not control, such as repository content, LLM output or uploaded files

### New Features

- **Artifact element**: `Artifact` is parsed into the Technology layer and drawn with its own icon and filter badge ("Ar")

### Improvements

- **Layer names in any case**: An element's `layer` matches in any case ("application", "TECHNOLOGY"), and an element with an unknown or missing layer is drawn under Other; before, such an element was left out of the diagram
- **Readable layer labels in dark mode**: Layer band labels and the filter panel's layer subheaders use the brighter layer color in dark mode; SVG and PNG exports keep it
- **README**: Documents passing elements and relationships from Python, the accepted layers, selection and highlights, comparison styling and the toolbar; the images now use absolute URLs, so they show on PyPI too
- **Release checks**: CI also runs on `release/**` branches and checks formatting; publishing to PyPI first runs the full test suite and stops when the tag does not match the package version
- **Dev dependencies**: Moved from `[tool.uv] dev-dependencies` to `[dependency-groups]`, which removes uv's deprecation warning

### Fixes

- **`dark_mode` from Python is kept**: `ArchiMate(dark_mode=False)` (or `from_xml(..., dark_mode=...)`) now renders in that theme and stops following the host page; before, the widget replaced it with the page's theme when it first drew. Setting `dark_mode` after the widget is shown, or using the toolbar switch, also stops following the page, for every view of that widget. Without `dark_mode`, the widget follows the page as before
- **Element without a type**: An element without a `type`, or with a type that is not text, no longer stops the whole diagram from drawing; the filter panel lists it as "(no type)" and hides it like any other type

## [0.3.1] - (2026-10-12)

### Improvements

- **Python 3.15**: CI now tests Python 3.15, and the package classifiers list 3.12 to 3.15
- **Examples extra**: `marimo` moved from the dev dependencies to a new `examples` extra (`uv sync --extra examples` or `pip install anywidget-archimate[examples]`); only `examples/demo_marimo.py` needs it

### Fixes

- **Zoom survives redraws**: Switching the theme, updating `status` or `badge`, or changing `height` no longer resets the zoom and pan; the diagram refits only when its layout changes, for example after new data or a filter change
- **Fit button**: Fit now returns to the whole diagram; before, it left the view unchanged

## [0.3.0] - (2026-10-09)

### New Features

- **Comparison styling**: Elements and relationships accept an optional `status` for showing several runs of one model. On elements, `partial` is dashed and faded, `changed` has an amber fill, `only_a` red, `only_b` green, and `ghost` is very faint and dashed. A container's header band takes the color of a `changed`, `only_a` or `only_b` status too. On relationships, `partial` is faded, `ghost` very faint, and `changed`, `only_a` and `only_b` have an amber, red or green line with arrowheads in the same color; relationships keep their ArchiMate dash. `stable` or no status draws as before. SVG and PNG exports keep the styling
- **Element badges**: An optional `badge` on an element (for example "2/3" or "only in run 1") is drawn in its top left corner and added to its tooltip; long text is cut to 26 characters, and an empty badge draws nothing
- **Host-driven selection**: Setting `selected_element` from Python or the host (a dict with at least `id`) outlines that element; clicking an element still sets it from the browser
- **Highlights**: New `highlight_ids` trait (a list of element ids) outlines several elements at once, for example all elements behind one difference

### Improvements

- **No network requests**: dagre 0.8.5 (MIT) is bundled with the widget instead of loaded from esm.sh, so the widget works offline and under a strict Content Security Policy, and the first render no longer waits on a CDN
- **JavaScript tests**: Node tests for the comparison, badge, theme and highlight helpers, a check that the assembled module loads offline, and render tests that mount the widget in jsdom with a plain-object model (no Jupyter, no Python); pytest runs them when Node.js is installed, and the render tests need `npm ci --prefix tests/js`
- **Theme follows any ancestor**: The widget now follows `data-theme` changes on any ancestor, not only on `<html>` and `<body>`, and ignores `data-theme` values other than `light` and `dark` (for example a design-system theme name)

### Fixes

- **Explicit host theme wins**: An explicit light choice on the host now overrides the operating system: `data-theme="light"` on the closest ancestor (then `<html>`, then `<body>`) or a `light` class on `<html>` or `<body>` renders light even when the operating system prefers dark. `data-theme` takes precedence over a `dark` class, which takes precedence over a `light` class, which takes precedence over `prefers-color-scheme` ([#13](https://github.com/StevenBtw/anywidget-archimate/issues/13))
- **Clean removal**: When the host removes the widget, it stops listening to the model and observing the page, so a re-displayed widget no longer leaves an earlier view rebuilding in the background

## [0.2.0] - (2026-03-16)

### Fixes

- **Theme detection**: Fixed auto-theme not responding to host theme changes: removed narrow Marimo shadow DOM gate so the MutationObserver is always active
- **Marimo `dark-theme` class**: Added detection for Marimo 0.20.x `dark-theme` CSS class in addition to Tailwind `dark`

### Improvements

- **Universal theme observer**: Theme auto-detection now works in any host (Marimo, Jupyter, VS Code), observing both `<html>` and `<body>` for class/data-theme changes
- **OS-level theme listener**: Added `prefers-color-scheme` media query change listener for OS dark/light mode switches
- **Dark mode toggle always visible**: Manual toggle no longer hidden in auto-theme mode; clicking it disables auto-theme so the user's choice is respected

## [0.1.4] - (2026-03-16)

### New Features

- **Automatic theme detection**: Auto-detects host dark mode (marimo Tailwind `class="dark"`, `data-theme` or `prefers-color-scheme`) and syncs the widget theme automatically; dark mode toggle is hidden when the host controls the theme

### Improvements

- **Neutral grey palette**: Light and dark mode colors updated to neutral grey tones for a cleaner look and better integration with marimo

## [0.1.3] - (2026-03-15)

### New Features

- **Upload button**: Toolbar button to load `.xml` or `.archimate` files directly from the browser; no Python code needed to switch models
- **Export to SVG**: Download the current diagram as a self-contained SVG file with inlined fonts
- **Export to PNG**: Download the current diagram as a high-resolution (2x) PNG with correct light/dark background

## [0.1.2] - (2026-03-15)

### New Features

- **Demo module**: Built-in `demo_archimate()` function that creates a pre-populated ArchiMate widget with a sample enterprise architecture model (12 elements across Business, Application and Technology layers); no external files needed

## [0.1.1] - (2026-03-15)

### New Features

- **ArchiMate icons**: Standard SVG icons for all 13 element types (stick figure for BusinessActor, component tabs for ApplicationComponent, 3D box for Node, gear for BusinessFunction, etc.)
- **Filter sidebar**: Collapsible left panel with per-layer, per-element-type and per-relationship-type checkboxes with counts and "all / none" toggles
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
- **Details panel**: Click any element to see its name, type, layer and documentation
- **anywidget integration**: Works in Jupyter, Marimo and VS Code notebooks
- **`from_xml` / `load_xml`**: Load ArchiMate models from file path or XML string
