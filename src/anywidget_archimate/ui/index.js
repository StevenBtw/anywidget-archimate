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

  function emitChange() {
    onFilterChange(hiddenLayers, hiddenElementTypes, hiddenRelTypes);
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

// Prefix for invisible infrastructure nodes/edges
const _ANCHOR = "__anchor_";
const _LAYER_ANCHORS = {
  Business:    "__anchor_business",
  Application: "__anchor_application",
  Technology:  "__anchor_technology",
};

function computeLayout(elements, relationships) {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "TB",
    ranksep: 100,   // vertical space between ranks (layers)
    nodesep: 50,    // horizontal space between nodes at same rank
    edgesep: 25,    // minimum separation between edges
    marginx: 50,
    marginy: 50,
    acyclicer: "greedy",   // break cycles aggressively
    ranker: "network-simplex",  // best ranker for layered graphs
  });
  g.setDefaultEdgeLabel(() => ({}));

  const elementIds = new Set(elements.map((e) => e.id));

  // --- Layer enforcement via invisible anchor nodes ---
  // Create tiny invisible anchor nodes for each layer present in the data
  const presentLayers = [...new Set(elements.map((e) => e.layer))];
  const orderedLayers = LAYER_ORDER.filter((l) => presentLayers.includes(l));

  for (const layer of orderedLayers) {
    g.setNode(_LAYER_ANCHORS[layer], {
      width: 1, height: 1, layer, _isAnchor: true,
    });
  }

  // Chain anchor nodes top-to-bottom with high-weight edges to force rank order
  for (let i = 0; i < orderedLayers.length - 1; i++) {
    const upper = _LAYER_ANCHORS[orderedLayers[i]];
    const lower = _LAYER_ANCHORS[orderedLayers[i + 1]];
    g.setEdge(upper, lower, { weight: 200, minlen: 3 }, `__layerchain_${i}`);
  }

  // Add real nodes
  for (const el of elements) {
    g.setNode(el.id, {
      label: el.name,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layer: el.layer,
    });

    // Connect each node to its layer anchor (same-rank constraint)
    const anchor = _LAYER_ANCHORS[el.layer];
    if (anchor) {
      g.setEdge(anchor, el.id, { weight: 1, minlen: 0 }, `__rank_${el.id}`);
    }
  }

  // Add real edges, normalizing direction so cross-layer edges flow top-to-bottom
  for (const rel of relationships) {
    if (!elementIds.has(rel.source) || !elementIds.has(rel.target)) continue;

    const srcEl = elements.find((e) => e.id === rel.source);
    const tgtEl = elements.find((e) => e.id === rel.target);
    const srcRank = LAYER_RANK[srcEl.layer] ?? 3;
    const tgtRank = LAYER_RANK[tgtEl.layer] ?? 3;

    if (srcRank <= tgtRank) {
      // Normal direction (top → bottom or same layer)
      g.setEdge(rel.source, rel.target, {
        relationship: rel,
        weight: 1,
        minlen: srcRank === tgtRank ? 1 : 2,
      }, rel.id);
    } else {
      // Cross-layer edge going "upward" — reverse for dagre but mark as reversed
      g.setEdge(rel.target, rel.source, {
        relationship: { ...rel, _reversed: true },
        weight: 1,
        minlen: 2,
      }, rel.id);
    }
  }

  dagre.layout(g);
  return g;
}

function isAnchorNode(nodeId) {
  return nodeId.startsWith(_ANCHOR);
}

function isAnchorEdge(edgeObj) {
  return edgeObj.v.startsWith(_ANCHOR) || edgeObj.w.startsWith(_ANCHOR);
}

// ============================================================================
// Rendering
// ============================================================================

function renderDiagram(container, elements, relationships, darkMode) {
  container.innerHTML = "";

  if (!elements.length) {
    container.innerHTML = '<div class="aam-empty">No ArchiMate elements to display. Use <code>.load_xml(path)</code> or <code>ArchiMate.from_xml(path)</code>.</div>';
    return;
  }

  const g = computeLayout(elements, relationships);
  const graphInfo = g.graph();
  const svgWidth = graphInfo.width + 80;
  const svgHeight = graphInfo.height + 80;

  const svg = svgEl("svg", {
    width: "100%",
    height: "100%",
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    class: "aam-svg",
  });

  svg.appendChild(buildMarkerDefs());

  const mainG = svgEl("g", { class: "aam-main" });
  svg.appendChild(mainG);

  drawLayerBands(mainG, g, elements, svgWidth);

  const edgesG = svgEl("g", { class: "aam-edges" });
  mainG.appendChild(edgesG);
  for (const e of g.edges()) {
    // Skip invisible anchor edges
    if (isAnchorEdge(e)) continue;
    drawEdge(edgesG, g.edge(e), darkMode);
  }

  const nodesG = svgEl("g", { class: "aam-nodes" });
  mainG.appendChild(nodesG);
  for (const nodeId of g.nodes()) {
    // Skip invisible anchor nodes
    if (isAnchorNode(nodeId)) continue;
    const nodeData = g.node(nodeId);
    const el = elements.find((e) => e.id === nodeId);
    if (el && nodeData) drawNode(nodesG, nodeData, el, darkMode);
  }

  container.appendChild(svg);
  setupZoomPan(svg, mainG);
}

function drawLayerBands(parentG, g, elements, svgWidth) {
  const layerExtents = {};
  for (const nodeId of g.nodes()) {
    if (isAnchorNode(nodeId)) continue;
    const nd = g.node(nodeId);
    if (!nd) continue;
    const layer = nd.layer || "Other";
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

  // Filter sidebar
  const filterPanel = buildFilterPanel(model, (layers, elemTypes, relTypes) => {
    hiddenLayers = layers;
    hiddenElementTypes = elemTypes;
    hiddenRelTypes = relTypes;
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
    renderDiagram(graphContainer, elements, relationships, darkMode);

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
