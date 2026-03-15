// ArchiMate widget renderer
// Uses dagre for layered layout, vanilla SVG for rendering

// ============================================================================
// Constants
// ============================================================================

const LAYER_COLORS = {
  Business:    { fill: "#FFFFB5", stroke: "#D4D400", text: "#555500" },
  Application: { fill: "#B5D8FF", stroke: "#4A90D9", text: "#1A3A5C" },
  Technology:  { fill: "#C9E7B7", stroke: "#5BA83B", text: "#2D5A1E" },
  Other:       { fill: "#E8E8E8", stroke: "#999999", text: "#333333" },
};

const LAYER_ORDER = ["Business", "Application", "Technology", "Other"];
const LAYER_RANK = { Business: 0, Application: 1, Technology: 2, Other: 3 };

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const NODE_RX = 6;
const LAYER_LABEL_PAD = 30;

// ArchiMate relationship visual config
const REL_STYLES = {
  Composition:   { dash: "",     srcMarker: "diamond-filled", tgtMarker: "" },
  Aggregation:   { dash: "",     srcMarker: "diamond-hollow", tgtMarker: "" },
  Assignment:    { dash: "",     srcMarker: "circle-filled",  tgtMarker: "arrow-filled" },
  Realization:   { dash: "6 4",  srcMarker: "",               tgtMarker: "arrow-hollow" },
  Serving:       { dash: "",     srcMarker: "",               tgtMarker: "arrow-hollow" },
  Access:        { dash: "4 3",  srcMarker: "",               tgtMarker: "arrow-hollow" },
  Flow:          { dash: "6 4",  srcMarker: "",               tgtMarker: "arrow-filled" },
  Triggering:    { dash: "",     srcMarker: "",               tgtMarker: "arrow-filled" },
  Association:   { dash: "",     srcMarker: "",               tgtMarker: "" },
  Specialization:{ dash: "",     srcMarker: "",               tgtMarker: "arrow-hollow" },
  Influence:     { dash: "6 4",  srcMarker: "",               tgtMarker: "arrow-hollow" },
};

// Relationship type colors for the filter sidebar swatches
const REL_COLORS = {
  Composition:    "#7c3aed",
  Aggregation:    "#6366f1",
  Assignment:     "#2563eb",
  Realization:    "#0891b2",
  Serving:        "#059669",
  Access:         "#d97706",
  Flow:           "#dc2626",
  Triggering:     "#be185d",
  Association:    "#6b7280",
  Specialization: "#4b5563",
  Influence:      "#9333ea",
};

// ============================================================================
// SVG Helpers
// ============================================================================

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, v);
  }
  return el;
}

function buildMarkerDefs() {
  const defs = svgEl("defs");

  const arrowFilled = svgEl("marker", {
    id: "arrow-filled", viewBox: "0 0 10 10", refX: "10", refY: "5",
    markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse",
  });
  arrowFilled.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 Z", fill: "#666" }));
  defs.appendChild(arrowFilled);

  const arrowHollow = svgEl("marker", {
    id: "arrow-hollow", viewBox: "0 0 10 10", refX: "10", refY: "5",
    markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse",
  });
  arrowHollow.appendChild(svgEl("path", {
    d: "M 0 0 L 10 5 L 0 10 Z", fill: "#fff", stroke: "#666", "stroke-width": "1.5",
  }));
  defs.appendChild(arrowHollow);

  const diamondFilled = svgEl("marker", {
    id: "diamond-filled", viewBox: "0 0 12 12", refX: "6", refY: "6",
    markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
  });
  diamondFilled.appendChild(svgEl("path", { d: "M 0 6 L 6 0 L 12 6 L 6 12 Z", fill: "#666" }));
  defs.appendChild(diamondFilled);

  const diamondHollow = svgEl("marker", {
    id: "diamond-hollow", viewBox: "0 0 12 12", refX: "6", refY: "6",
    markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
  });
  diamondHollow.appendChild(svgEl("path", {
    d: "M 0 6 L 6 0 L 12 6 L 6 12 Z", fill: "#fff", stroke: "#666", "stroke-width": "1.5",
  }));
  defs.appendChild(diamondHollow);

  const circleFilled = svgEl("marker", {
    id: "circle-filled", viewBox: "0 0 10 10", refX: "5", refY: "5",
    markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse",
  });
  circleFilled.appendChild(svgEl("circle", { cx: "5", cy: "5", r: "4", fill: "#666" }));
  defs.appendChild(circleFilled);

  return defs;
}

// ============================================================================
// Filter Sidebar
// ============================================================================

function buildFilterPanel(model, onFilterChange) {
  const panel = document.createElement("div");
  panel.className = "aam-filter-panel";

  // Filter state
  const hiddenLayers = new Set();
  const hiddenElementTypes = new Set();
  const hiddenRelTypes = new Set();
  let nestElements = true; // nesting enabled by default

  function emitChange() {
    onFilterChange(hiddenLayers, hiddenElementTypes, hiddenRelTypes, nestElements);
  }

  function renderPanel() {
    panel.innerHTML = "";

    const elements = model.get("elements") || [];
    const relationships = model.get("relationships") || [];

    // Header
    const header = document.createElement("div");
    header.className = "aam-filter-header";
    header.innerHTML = "<strong>Filter</strong>";
    panel.appendChild(header);

    const content = document.createElement("div");
    content.className = "aam-filter-content";

    // --- Nest elements toggle ---
    const nestSection = document.createElement("div");
    nestSection.className = "aam-filter-section aam-filter-nest-section";
    const nestItem = document.createElement("label");
    nestItem.className = "aam-filter-item aam-filter-nest-toggle";
    const nestCheckbox = document.createElement("input");
    nestCheckbox.type = "checkbox";
    nestCheckbox.checked = nestElements;
    nestCheckbox.className = "aam-filter-checkbox";
    nestCheckbox.addEventListener("change", () => {
      nestElements = nestCheckbox.checked;
      emitChange();
    });
    nestItem.appendChild(nestCheckbox);
    const nestLabel = document.createElement("span");
    nestLabel.className = "aam-filter-name";
    nestLabel.textContent = "Nest elements";
    nestItem.appendChild(nestLabel);
    nestSection.appendChild(nestItem);
    content.appendChild(nestSection);

    // --- Layers section ---
    const layerSection = document.createElement("div");
    layerSection.className = "aam-filter-section";

    const layerHeader = document.createElement("div");
    layerHeader.className = "aam-filter-section-title";
    layerHeader.innerHTML = '<span>Layers</span>';
    addToggleLinks(layerHeader, LAYER_ORDER, hiddenLayers, () => { emitChange(); renderPanel(); });
    layerSection.appendChild(layerHeader);

    // Count elements per layer
    const layerCounts = {};
    elements.forEach((e) => {
      layerCounts[e.layer] = (layerCounts[e.layer] || 0) + 1;
    });

    for (const layer of LAYER_ORDER) {
      const count = layerCounts[layer] || 0;
      if (count === 0) continue;
      const colors = LAYER_COLORS[layer];
      const item = createCheckboxItem({
        name: `${layer} Layer`,
        count,
        color: colors.fill,
        borderColor: colors.stroke,
        isHidden: hiddenLayers.has(layer),
        onToggle: (visible) => {
          if (visible) hiddenLayers.delete(layer);
          else hiddenLayers.add(layer);
          emitChange();
        },
      });
      layerSection.appendChild(item);
    }
    content.appendChild(layerSection);

    // --- Element types section (grouped by layer) ---
    const elemSection = document.createElement("div");
    elemSection.className = "aam-filter-section";

    const elemHeader = document.createElement("div");
    elemHeader.className = "aam-filter-section-title";
    elemHeader.innerHTML = '<span>Elements</span>';
    const allElemTypes = [...new Set(elements.map((e) => e.type))];
    addToggleLinks(elemHeader, allElemTypes, hiddenElementTypes, () => { emitChange(); renderPanel(); });
    elemSection.appendChild(elemHeader);

    // Group element types by layer
    const typesByLayer = {};
    elements.forEach((e) => {
      if (!typesByLayer[e.layer]) typesByLayer[e.layer] = {};
      typesByLayer[e.layer][e.type] = (typesByLayer[e.layer][e.type] || 0) + 1;
    });

    for (const layer of LAYER_ORDER) {
      const types = typesByLayer[layer];
      if (!types) continue;
      const colors = LAYER_COLORS[layer];

      // Layer sub-header
      const subHeader = document.createElement("div");
      subHeader.className = "aam-filter-subheader";
      subHeader.textContent = layer;
      subHeader.style.color = colors.text;
      elemSection.appendChild(subHeader);

      for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
        const badge = getTypeBadge(type);
        const item = createCheckboxItem({
          name: formatType(type),
          count,
          color: colors.fill,
          borderColor: colors.stroke,
          badge,
          isHidden: hiddenElementTypes.has(type),
          onToggle: (visible) => {
            if (visible) hiddenElementTypes.delete(type);
            else hiddenElementTypes.add(type);
            emitChange();
          },
        });
        elemSection.appendChild(item);
      }
    }
    content.appendChild(elemSection);

    // --- Relationship types section ---
    const relSection = document.createElement("div");
    relSection.className = "aam-filter-section";

    const relHeader = document.createElement("div");
    relHeader.className = "aam-filter-section-title";
    relHeader.innerHTML = '<span>Relationships</span>';
    const allRelTypes = [...new Set(relationships.map((r) => r.type))];
    addToggleLinks(relHeader, allRelTypes, hiddenRelTypes, () => { emitChange(); renderPanel(); });
    relSection.appendChild(relHeader);

    // Count relationship types
    const relCounts = {};
    relationships.forEach((r) => {
      relCounts[r.type] = (relCounts[r.type] || 0) + 1;
    });

    for (const [type, count] of Object.entries(relCounts).sort((a, b) => b[1] - a[1])) {
      const style = REL_STYLES[type] || {};
      const item = createCheckboxItem({
        name: type,
        count,
        color: REL_COLORS[type] || "#6b7280",
        borderColor: REL_COLORS[type] || "#6b7280",
        dash: style.dash,
        isHidden: hiddenRelTypes.has(type),
        onToggle: (visible) => {
          if (visible) hiddenRelTypes.delete(type);
          else hiddenRelTypes.add(type);
          emitChange();
        },
      });
      relSection.appendChild(item);
    }
    content.appendChild(relSection);

    panel.appendChild(content);
  }

  // Re-render panel when data changes
  model.on("change:elements", renderPanel);
  model.on("change:relationships", renderPanel);
  renderPanel();

  return { element: panel, render: renderPanel };
}

function addToggleLinks(header, allKeys, hiddenSet, callback) {
  if (allKeys.length < 2) return;
  const links = document.createElement("span");
  links.className = "aam-filter-toggles";

  const allLink = document.createElement("a");
  allLink.textContent = "all";
  allLink.href = "#";
  allLink.addEventListener("click", (e) => {
    e.preventDefault();
    allKeys.forEach((k) => hiddenSet.delete(k));
    callback();
  });

  const noneLink = document.createElement("a");
  noneLink.textContent = "none";
  noneLink.href = "#";
  noneLink.addEventListener("click", (e) => {
    e.preventDefault();
    allKeys.forEach((k) => hiddenSet.add(k));
    callback();
  });

  links.appendChild(allLink);
  links.appendChild(document.createTextNode(" / "));
  links.appendChild(noneLink);
  header.appendChild(links);
}

function createCheckboxItem({ name, count, color, borderColor, badge, dash, isHidden, onToggle }) {
  const item = document.createElement("div");
  item.className = "aam-filter-item" + (isHidden ? " aam-filter-hidden" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = !isHidden;
  checkbox.className = "aam-filter-checkbox";
  checkbox.addEventListener("change", () => {
    const visible = checkbox.checked;
    item.classList.toggle("aam-filter-hidden", !visible);
    onToggle(visible);
  });
  item.appendChild(checkbox);

  // Color swatch
  const swatch = document.createElement("span");
  swatch.className = "aam-filter-swatch";
  swatch.style.background = color;
  swatch.style.borderColor = borderColor || color;
  if (dash) {
    // Show dashed border for dashed relationship types
    swatch.style.borderStyle = "dashed";
  }
  item.appendChild(swatch);

  // Badge (if element type)
  if (badge) {
    const badgeSpan = document.createElement("span");
    badgeSpan.className = "aam-filter-badge";
    badgeSpan.textContent = badge;
    item.appendChild(badgeSpan);
  }

  // Name
  const nameSpan = document.createElement("span");
  nameSpan.className = "aam-filter-name";
  nameSpan.textContent = name;
  item.appendChild(nameSpan);

  // Count
  const countSpan = document.createElement("span");
  countSpan.className = "aam-filter-count";
  countSpan.textContent = count;
  item.appendChild(countSpan);

  return item;
}

// ============================================================================
// Layout
// ============================================================================

// Nesting relationship types (Composition & Aggregation → visual nesting)
const NESTING_REL_TYPES = new Set(["Composition", "Aggregation"]);

// Container padding for compound parent nodes
const CONTAINER_PAD_TOP = 28;
const CONTAINER_PAD = 14;
const CHILD_COLS = 3;
const CHILD_GAP = 10;
const LAYER_GAP = 60; // vertical gap between layer bands
const LAYER_MARGIN = 50;

/**
 * Per-layer layout: runs dagre independently for each layer, then stacks
 * them vertically. This guarantees Business is on top, Application in the
 * middle, and Technology at the bottom — no exceptions.
 *
 * Returns a result object (not a dagre graph) with:
 *   nodes: Map<id, { x, y, width, height, layer, _isParent, _isChild }>
 *   edges: [{ points, relationship }]
 *   width, height: total diagram size
 */
function computeLayout(elements, relationships, nestElements) {
  const elementIds = new Set(elements.map((e) => e.id));
  const elemById = new Map(elements.map((e) => [e.id, e]));

  // --- Nesting ---
  const nestedEdgeIds = new Set();
  const childToParent = new Map();
  const parentToChildren = new Map();
  if (nestElements) {
    for (const rel of relationships) {
      if (!NESTING_REL_TYPES.has(rel.type)) continue;
      if (!elementIds.has(rel.source) || !elementIds.has(rel.target)) continue;
      if (!childToParent.has(rel.target)) {
        childToParent.set(rel.target, rel.source);
        if (!parentToChildren.has(rel.source)) parentToChildren.set(rel.source, []);
        parentToChildren.get(rel.source).push(rel.target);
        nestedEdgeIds.add(rel.id);
      }
    }
  }
  const parentIds = new Set(parentToChildren.keys());

  // --- Container sizing ---
  function containerSize(parentId) {
    const children = parentToChildren.get(parentId) || [];
    const cols = Math.min(children.length, CHILD_COLS);
    const rows = Math.ceil(children.length / CHILD_COLS);
    const w = cols * NODE_WIDTH + (cols - 1) * CHILD_GAP + CONTAINER_PAD * 2;
    const h = rows * NODE_HEIGHT + (rows - 1) * CHILD_GAP + CONTAINER_PAD_TOP + CONTAINER_PAD;
    return {
      width: Math.max(w, NODE_WIDTH + CONTAINER_PAD * 2),
      height: Math.max(h, NODE_HEIGHT + CONTAINER_PAD_TOP + CONTAINER_PAD),
    };
  }

  // --- Group top-level elements by layer ---
  const layerElements = {};
  for (const el of elements) {
    if (childToParent.has(el.id)) continue; // children positioned inside parent
    if (!layerElements[el.layer]) layerElements[el.layer] = [];
    layerElements[el.layer].push(el);
  }

  // --- Run dagre per layer ---
  const nodePositions = new Map(); // id → { x, y, width, height, layer, ... }
  let currentY = LAYER_MARGIN;
  let maxWidth = 0;
  const layerBounds = {}; // layer → { y, height }
  const orderedLayers = LAYER_ORDER.filter((l) => layerElements[l] && layerElements[l].length > 0);

  for (const layer of orderedLayers) {
    const layerEls = layerElements[layer];
    const layerIds = new Set(layerEls.map((e) => e.id));

    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({
      rankdir: "LR",  // left-to-right within each layer (processes/flows)
      ranksep: 60,
      nodesep: 30,
      edgesep: 20,
      marginx: 30,
      marginy: 20,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes for this layer
    for (const el of layerEls) {
      const isParent = parentIds.has(el.id);
      const size = isParent ? containerSize(el.id) : { width: NODE_WIDTH, height: NODE_HEIGHT };
      g.setNode(el.id, { label: el.name, width: size.width, height: size.height });
    }

    // Add within-layer edges only
    for (const rel of relationships) {
      if (nestedEdgeIds.has(rel.id)) continue;
      let src = rel.source;
      let tgt = rel.target;
      if (childToParent.has(src)) src = childToParent.get(src);
      if (childToParent.has(tgt)) tgt = childToParent.get(tgt);
      if (src === tgt) continue;
      if (layerIds.has(src) && layerIds.has(tgt)) {
        g.setEdge(src, tgt, { relationship: rel }, rel.id);
      }
    }

    dagre.layout(g);

    const gInfo = g.graph();
    const layerH = gInfo.height || 0;
    const layerW = gInfo.width || 0;

    // Store positions with y-offset
    for (const nodeId of g.nodes()) {
      const nd = g.node(nodeId);
      const isParent = parentIds.has(nodeId);
      nodePositions.set(nodeId, {
        x: nd.x, y: nd.y + currentY,
        width: nd.width, height: nd.height,
        layer, _isParent: isParent,
      });
    }

    layerBounds[layer] = { y: currentY, height: layerH };
    maxWidth = Math.max(maxWidth, layerW);
    currentY += layerH + LAYER_GAP;
  }

  // --- Center all layers to the same width ---
  for (const layer of orderedLayers) {
    const layerEls = layerElements[layer];
    // Find this layer's actual width
    let minX = Infinity, maxX = -Infinity;
    for (const el of layerEls) {
      const pos = nodePositions.get(el.id);
      if (pos) {
        minX = Math.min(minX, pos.x - pos.width / 2);
        maxX = Math.max(maxX, pos.x + pos.width / 2);
      }
    }
    const layerW = maxX - minX;
    const offsetX = (maxWidth - layerW) / 2 - minX + LAYER_MARGIN;
    for (const el of layerEls) {
      const pos = nodePositions.get(el.id);
      if (pos) pos.x += offsetX;
    }
  }

  // --- Position children inside parents ---
  for (const [parentId, children] of parentToChildren) {
    const pPos = nodePositions.get(parentId);
    if (!pPos) continue;
    const px = pPos.x - pPos.width / 2 + CONTAINER_PAD;
    const py = pPos.y - pPos.height / 2 + CONTAINER_PAD_TOP;

    children.forEach((childId, i) => {
      const col = i % CHILD_COLS;
      const row = Math.floor(i / CHILD_COLS);
      const childEl = elemById.get(childId);
      nodePositions.set(childId, {
        x: px + col * (NODE_WIDTH + CHILD_GAP) + NODE_WIDTH / 2,
        y: py + row * (NODE_HEIGHT + CHILD_GAP) + NODE_HEIGHT / 2,
        width: NODE_WIDTH, height: NODE_HEIGHT,
        layer: childEl ? childEl.layer : pPos.layer,
        _isChild: true,
      });
    });
  }

  // --- Build cross-layer edges as simple straight lines between node centers ---
  const edgeList = [];
  for (const rel of relationships) {
    if (nestedEdgeIds.has(rel.id)) continue;
    if (!elementIds.has(rel.source) || !elementIds.has(rel.target)) continue;

    let src = rel.source;
    let tgt = rel.target;
    if (childToParent.has(src)) src = childToParent.get(src);
    if (childToParent.has(tgt)) tgt = childToParent.get(tgt);
    if (src === tgt) continue;

    const srcPos = nodePositions.get(src);
    const tgtPos = nodePositions.get(tgt);
    if (!srcPos || !tgtPos) continue;

    // Connect from bottom of source to top of target (or reverse)
    const srcEl = elemById.get(src);
    const tgtEl = elemById.get(tgt);
    if (!srcEl || !tgtEl) continue;
    const srcLayer = LAYER_RANK[srcEl.layer] ?? 3;
    const tgtLayer = LAYER_RANK[tgtEl.layer] ?? 3;

    let points;
    if (srcLayer === tgtLayer) {
      // Same layer: use dagre's edge points if available, else straight line
      points = [
        { x: srcPos.x, y: srcPos.y },
        { x: tgtPos.x, y: tgtPos.y },
      ];
    } else if (srcLayer < tgtLayer) {
      // Source above target: connect bottom of source to top of target
      points = [
        { x: srcPos.x, y: srcPos.y + srcPos.height / 2 },
        { x: tgtPos.x, y: tgtPos.y - tgtPos.height / 2 },
      ];
    } else {
      // Source below target: reversed for arrow direction
      points = [
        { x: tgtPos.x, y: tgtPos.y + tgtPos.height / 2 },
        { x: srcPos.x, y: srcPos.y - srcPos.height / 2 },
      ];
    }

    edgeList.push({ points, relationship: rel });
  }

  const totalW = maxWidth + LAYER_MARGIN * 2;
  const totalH = currentY - LAYER_GAP + LAYER_MARGIN;

  return {
    nodes: nodePositions,
    edges: edgeList,
    layerBounds,
    parentIds,
    childToParent,
    width: totalW,
    height: totalH,
  };
}

// ============================================================================
// Rendering
// ============================================================================

function renderDiagram(container, elements, relationships, darkMode, nestElements) {
  container.innerHTML = "";

  if (!elements.length) {
    container.innerHTML = '<div class="aam-empty">No ArchiMate elements to display. Use <code>.load_xml(path)</code> or <code>ArchiMate.from_xml(path)</code>.</div>';
    return;
  }

  const layout = computeLayout(elements, relationships, nestElements);
  const svgWidth = layout.width;
  const svgHeight = layout.height;

  const svg = svgEl("svg", {
    width: "100%",
    height: "100%",
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    class: "aam-svg",
  });

  svg.appendChild(buildMarkerDefs());

  const mainG = svgEl("g", { class: "aam-main" });
  svg.appendChild(mainG);

  // Draw layer bands
  drawLayerBands(mainG, layout, svgWidth);

  // Draw parent containers first (behind children)
  const containersG = svgEl("g", { class: "aam-containers" });
  mainG.appendChild(containersG);
  for (const [nodeId, nodeData] of layout.nodes) {
    const el = elements.find((e) => e.id === nodeId);
    if (el && nodeData._isParent) {
      drawContainerNode(containersG, nodeData, el, darkMode);
    }
  }

  // Draw edges
  const edgesG = svgEl("g", { class: "aam-edges" });
  mainG.appendChild(edgesG);
  for (const edge of layout.edges) {
    drawEdge(edgesG, edge, darkMode);
  }

  // Draw leaf nodes
  const nodesG = svgEl("g", { class: "aam-nodes" });
  mainG.appendChild(nodesG);
  for (const [nodeId, nodeData] of layout.nodes) {
    const el = elements.find((e) => e.id === nodeId);
    if (el && !nodeData._isParent) {
      drawNode(nodesG, nodeData, el, darkMode);
    }
  }

  container.appendChild(svg);
  setupZoomPan(svg, mainG);
}

function drawLayerBands(parentG, layout, svgWidth) {
  // Compute extents from node positions
  const layerExtents = {};
  for (const [nodeId, nd] of layout.nodes) {
    const layer = nd.layer || "Other";
    if (nd._isChild) continue; // children are inside parents, skip for band calc
    if (!layerExtents[layer]) layerExtents[layer] = { minY: Infinity, maxY: -Infinity };
    layerExtents[layer].minY = Math.min(layerExtents[layer].minY, nd.y - nd.height / 2);
    layerExtents[layer].maxY = Math.max(layerExtents[layer].maxY, nd.y + nd.height / 2);
  }

  for (const [layer, ext] of Object.entries(layerExtents)) {
    const colors = LAYER_COLORS[layer] || LAYER_COLORS.Other;
    const pad = 20;
    const bandY = ext.minY - pad - LAYER_LABEL_PAD;
    const bandH = ext.maxY - ext.minY + pad * 2 + LAYER_LABEL_PAD;

    parentG.appendChild(svgEl("rect", {
      x: 0, y: bandY, width: svgWidth, height: bandH,
      fill: colors.fill, opacity: "0.18", rx: "4",
    }));

    const label = svgEl("text", {
      x: 14, y: bandY + 18, class: "aam-layer-label", fill: colors.text,
    });
    label.textContent = `${layer} Layer`;
    parentG.appendChild(label);
  }
}

function drawNode(parentG, nodeData, el, darkMode) {
  const colors = LAYER_COLORS[el.layer] || LAYER_COLORS.Other;
  const x = nodeData.x - NODE_WIDTH / 2;
  const y = nodeData.y - NODE_HEIGHT / 2;

  const group = svgEl("g", {
    class: "aam-node", "data-id": el.id,
    transform: `translate(${x}, ${y})`,
  });

  group.appendChild(svgEl("rect", {
    width: NODE_WIDTH, height: NODE_HEIGHT, rx: NODE_RX,
    fill: colors.fill, stroke: colors.stroke, "stroke-width": "1.5",
    class: "aam-node-rect",
  }));

  const badge = getTypeBadge(el.type);
  if (badge) {
    const badgeG = svgEl("g", { transform: `translate(${NODE_WIDTH - 24}, 4)` });
    badgeG.appendChild(svgEl("rect", {
      width: 20, height: 14, rx: 2, fill: colors.stroke, opacity: "0.25",
    }));
    const badgeText = svgEl("text", {
      x: 10, y: 11, "text-anchor": "middle", "font-size": "8",
      fill: colors.text, "font-weight": "bold",
    });
    badgeText.textContent = badge;
    badgeG.appendChild(badgeText);
    group.appendChild(badgeG);
  }

  const text = svgEl("text", {
    x: NODE_WIDTH / 2, y: NODE_HEIGHT / 2 + 1,
    "text-anchor": "middle", "dominant-baseline": "middle",
    class: "aam-node-label", fill: colors.text,
  });
  text.textContent = truncate(el.name, 22);
  group.appendChild(text);

  const subtext = svgEl("text", {
    x: NODE_WIDTH / 2, y: NODE_HEIGHT - 8,
    "text-anchor": "middle", class: "aam-node-type",
    fill: colors.text, opacity: "0.6",
  });
  subtext.textContent = formatType(el.type);
  group.appendChild(subtext);

  const title = svgEl("title");
  title.textContent = `${el.name}\n${formatType(el.type)} (${el.layer})\n${el.documentation || ""}`;
  group.appendChild(title);

  parentG.appendChild(group);
}

function drawContainerNode(parentG, nodeData, el, darkMode) {
  const colors = LAYER_COLORS[el.layer] || LAYER_COLORS.Other;
  const w = nodeData.width;
  const h = nodeData.height;
  const x = nodeData.x - w / 2;
  const y = nodeData.y - h / 2;

  const group = svgEl("g", {
    class: "aam-node aam-container", "data-id": el.id,
    transform: `translate(${x}, ${y})`,
  });

  // Container background
  group.appendChild(svgEl("rect", {
    width: w, height: h, rx: NODE_RX,
    fill: colors.fill, stroke: colors.stroke, "stroke-width": "1.5",
    opacity: "0.5", class: "aam-node-rect",
  }));

  // Header bar
  group.appendChild(svgEl("rect", {
    width: w, height: CONTAINER_PAD_TOP - 2, rx: NODE_RX,
    fill: colors.stroke, opacity: "0.2",
  }));
  // Flat bottom corners on header (overlay rect)
  group.appendChild(svgEl("rect", {
    x: 0, y: NODE_RX,
    width: w, height: CONTAINER_PAD_TOP - 2 - NODE_RX,
    fill: colors.stroke, opacity: "0.2",
  }));

  // Container name
  const text = svgEl("text", {
    x: 8, y: CONTAINER_PAD_TOP / 2 + 1,
    "dominant-baseline": "middle",
    class: "aam-node-label", fill: colors.text,
    "font-size": "11",
  });
  text.textContent = truncate(el.name, 30);
  group.appendChild(text);

  // Badge
  const badge = getTypeBadge(el.type);
  if (badge) {
    const badgeG = svgEl("g", { transform: `translate(${w - 24}, 5)` });
    badgeG.appendChild(svgEl("rect", {
      width: 20, height: 14, rx: 2, fill: colors.stroke, opacity: "0.3",
    }));
    const badgeText = svgEl("text", {
      x: 10, y: 11, "text-anchor": "middle", "font-size": "8",
      fill: colors.text, "font-weight": "bold",
    });
    badgeText.textContent = badge;
    badgeG.appendChild(badgeText);
    group.appendChild(badgeG);
  }

  // Tooltip
  const title = svgEl("title");
  title.textContent = `${el.name}\n${formatType(el.type)} (${el.layer})\n${el.documentation || ""}`;
  group.appendChild(title);

  parentG.appendChild(group);
}

function drawEdge(parentG, edgeData, darkMode) {
  let points = edgeData.points || [];
  if (points.length < 2) return;

  const rel = edgeData.relationship || {};
  const reversed = rel._reversed;
  const style = REL_STYLES[rel.type] || REL_STYLES.Serving;
  const strokeColor = darkMode ? "#aaa" : "#666";

  // If the edge was reversed for layout, reverse points so arrows face correctly
  if (reversed) {
    points = [...points].reverse();
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }

  const path = svgEl("path", {
    d, fill: "none", stroke: strokeColor, "stroke-width": "1.5", class: "aam-edge",
  });

  if (style.dash) path.setAttribute("stroke-dasharray", style.dash);
  if (style.srcMarker) path.setAttribute("marker-start", `url(#${style.srcMarker})`);
  if (style.tgtMarker) path.setAttribute("marker-end", `url(#${style.tgtMarker})`);

  const title = svgEl("title");
  title.textContent = `${rel.type}${rel.name ? ": " + rel.name : ""}`;
  path.appendChild(title);

  parentG.appendChild(path);
}

// ============================================================================
// Zoom & Pan
// ============================================================================

function setupZoomPan(svg, mainG) {
  let viewBox = svg.viewBox.baseVal;
  let isPanning = false;
  let startPoint = { x: 0, y: 0 };
  let scale = 1;

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const pt = svgPoint(svg, e);
    const newScale = scale * delta;
    if (newScale < 0.1 || newScale > 10) return;
    viewBox.x = pt.x - (pt.x - viewBox.x) * delta;
    viewBox.y = pt.y - (pt.y - viewBox.y) * delta;
    viewBox.width *= delta;
    viewBox.height *= delta;
    scale = newScale;
  }, { passive: false });

  svg.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    startPoint = svgPoint(svg, e);
    svg.style.cursor = "grabbing";
  });

  svg.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    const pt = svgPoint(svg, e);
    viewBox.x -= pt.x - startPoint.x;
    viewBox.y -= pt.y - startPoint.y;
  });

  svg.addEventListener("mouseup", () => { isPanning = false; svg.style.cursor = "grab"; });
  svg.addEventListener("mouseleave", () => { isPanning = false; svg.style.cursor = "grab"; });
  svg.style.cursor = "grab";
}

function svgPoint(svg, event) {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// ============================================================================
// Utilities
// ============================================================================

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "\u2026" : str;
}

function formatType(type) {
  return type
    .replace("Application", "App ")
    .replace("Business", "Biz ")
    .replace("Technology", "Tech ")
    .replace("System", "Sys ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function getTypeBadge(type) {
  const badges = {
    ApplicationComponent: "AC", ApplicationInterface: "AI",
    ApplicationService: "AS", DataObject: "DO",
    BusinessActor: "BA", BusinessProcess: "BP",
    BusinessFunction: "BF", BusinessEvent: "BE", BusinessObject: "BO",
    Node: "Nd", Device: "Dv", SystemSoftware: "SS", TechnologyService: "TS",
  };
  return badges[type] || "";
}

// ============================================================================
// Anywidget Render
// ============================================================================

function render({ model, el }) {
  const wrapper = document.createElement("div");
  wrapper.className = "aam-wrapper";
  el.appendChild(wrapper);

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "aam-toolbar";
  toolbar.innerHTML = `
    <button class="aam-btn aam-btn-filter" title="Toggle filter panel">&#9776;</button>
    <span class="aam-title">ArchiMate Model</span>
    <span class="aam-legend">
      <span class="aam-legend-item"><span class="aam-dot" style="background:#FFFFB5;border-color:#D4D400"></span>Business</span>
      <span class="aam-legend-item"><span class="aam-dot" style="background:#B5D8FF;border-color:#4A90D9"></span>Application</span>
      <span class="aam-legend-item"><span class="aam-dot" style="background:#C9E7B7;border-color:#5BA83B"></span>Technology</span>
    </span>
    <button class="aam-btn aam-btn-fit" title="Fit to view">Fit</button>
    <button class="aam-btn aam-btn-dark" title="Toggle dark mode">&#9681;</button>
  `;
  wrapper.appendChild(toolbar);

  // Content area (sidebar + graph)
  const contentArea = document.createElement("div");
  contentArea.className = "aam-content";
  wrapper.appendChild(contentArea);

  // Filter state
  let hiddenLayers = new Set();
  let hiddenElementTypes = new Set();
  let hiddenRelTypes = new Set();
  let nestElements = true;

  // Filter sidebar
  const filterPanel = buildFilterPanel(model, (layers, elemTypes, relTypes, nest) => {
    hiddenLayers = layers;
    hiddenElementTypes = elemTypes;
    hiddenRelTypes = relTypes;
    nestElements = nest;
    rebuildDiagram();
  });
  filterPanel.element.classList.add("aam-panel-open"); // open by default
  contentArea.appendChild(filterPanel.element);

  // Graph container
  const graphContainer = document.createElement("div");
  graphContainer.className = "aam-graph-container";
  graphContainer.style.height = model.get("height") + "px";
  contentArea.appendChild(graphContainer);

  // Details panel
  const details = document.createElement("div");
  details.className = "aam-details";
  details.style.display = "none";
  wrapper.appendChild(details);

  function getFilteredData() {
    const allElements = model.get("elements") || [];
    const allRelationships = model.get("relationships") || [];

    // Filter elements by layer and type
    const elements = allElements.filter((e) =>
      !hiddenLayers.has(e.layer) && !hiddenElementTypes.has(e.type)
    );
    const visibleIds = new Set(elements.map((e) => e.id));

    // Filter relationships: both endpoints must be visible, and type not hidden
    const relationships = allRelationships.filter((r) =>
      !hiddenRelTypes.has(r.type) &&
      visibleIds.has(r.source) &&
      visibleIds.has(r.target)
    );

    return { elements, relationships };
  }

  function rebuildDiagram() {
    const darkMode = model.get("dark_mode");
    wrapper.classList.toggle("aam-dark", darkMode);

    const { elements, relationships } = getFilteredData();
    renderDiagram(graphContainer, elements, relationships, darkMode, nestElements);

    // Attach click handlers to nodes
    const allElements = model.get("elements") || [];
    graphContainer.querySelectorAll(".aam-node").forEach((node) => {
      node.addEventListener("click", () => {
        const id = node.dataset.id;
        const found = allElements.find((e) => e.id === id);
        if (found) {
          model.set("selected_element", { ...found });
          model.save_changes();
          showDetails(details, found);
        }
      });
    });
  }

  // Toggle filter panel
  toolbar.querySelector(".aam-btn-filter").addEventListener("click", () => {
    filterPanel.element.classList.toggle("aam-panel-open");
  });

  // Fit button
  toolbar.querySelector(".aam-btn-fit").addEventListener("click", () => {
    const svg = graphContainer.querySelector("svg");
    if (svg) {
      const vb = svg.getAttribute("viewBox").split(" ").map(Number);
      svg.setAttribute("viewBox", `${vb[0]} ${vb[1]} ${vb[2]} ${vb[3]}`);
    }
  });

  // Dark mode toggle
  toolbar.querySelector(".aam-btn-dark").addEventListener("click", () => {
    model.set("dark_mode", !model.get("dark_mode"));
    model.save_changes();
  });

  // Watch for model changes
  model.on("change:elements", rebuildDiagram);
  model.on("change:relationships", rebuildDiagram);
  model.on("change:dark_mode", rebuildDiagram);
  model.on("change:height", () => {
    graphContainer.style.height = model.get("height") + "px";
    rebuildDiagram();
  });

  rebuildDiagram();
}

function showDetails(container, el) {
  container.style.display = "block";
  container.innerHTML = `
    <div class="aam-details-header">
      <strong>${el.name}</strong>
      <button class="aam-btn aam-details-close">&times;</button>
    </div>
    <div class="aam-details-body">
      <div><span class="aam-detail-label">Type:</span> ${formatType(el.type)}</div>
      <div><span class="aam-detail-label">Layer:</span> ${el.layer}</div>
      <div><span class="aam-detail-label">ID:</span> <code>${el.id}</code></div>
      ${el.documentation ? `<div class="aam-detail-doc">${el.documentation}</div>` : ""}
    </div>
  `;
  container.querySelector(".aam-details-close").addEventListener("click", () => {
    container.style.display = "none";
  });
}
