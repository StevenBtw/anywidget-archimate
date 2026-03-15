// ArchiMate widget renderer
// Uses dagre for layered layout, vanilla SVG for rendering

// ============================================================================
// Constants
// ============================================================================

// Archi standard colors
const LAYER_COLORS = {
  Business:    { fill: "#FFFFB5", stroke: "#C8C800", text: "#555500" },
  Application: { fill: "#B5FFFF", stroke: "#00B2B2", text: "#005555" },
  Technology:  { fill: "#C9E7B7", stroke: "#5BA83B", text: "#2D5A1E" },
  Other:       { fill: "#E8E8E8", stroke: "#999999", text: "#333333" },
};

const LAYER_ORDER = ["Business", "Application", "Technology", "Other"];
const LAYER_RANK = { Business: 0, Application: 1, Technology: 2, Other: 3 };

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const LAYER_LABEL_PAD = 30;

// Behavior elements get rounded corners; structure/passive get square
const BEHAVIOR_TYPES = new Set([
  "ApplicationService", "BusinessProcess", "BusinessFunction", "BusinessEvent", "TechnologyService",
]);
function nodeRx(type) { return BEHAVIOR_TYPES.has(type) ? 14 : 4; }

// Relationship visual config
const REL_STYLES = {
  Composition:   { dash: "",     srcMarker: "diamond-filled", tgtMarker: "" },
  Aggregation:   { dash: "",     srcMarker: "diamond-hollow", tgtMarker: "" },
  Assignment:    { dash: "",     srcMarker: "circle-filled",  tgtMarker: "arrow-filled" },
  Realization:   { dash: "6 4",  srcMarker: "",               tgtMarker: "triangle-hollow" },
  Serving:       { dash: "",     srcMarker: "",               tgtMarker: "arrow-hollow" },
  Access:        { dash: "4 3",  srcMarker: "",               tgtMarker: "arrow-hollow" },
  Flow:          { dash: "6 4",  srcMarker: "",               tgtMarker: "arrow-filled" },
  Triggering:    { dash: "",     srcMarker: "",               tgtMarker: "arrow-filled" },
  Association:   { dash: "",     srcMarker: "",               tgtMarker: "" },
  Specialization:{ dash: "",     srcMarker: "",               tgtMarker: "triangle-hollow" },
  Influence:     { dash: "6 4",  srcMarker: "",               tgtMarker: "arrow-hollow" },
};

const REL_COLORS = {
  Composition: "#7c3aed", Aggregation: "#6366f1", Assignment: "#2563eb",
  Realization: "#0891b2", Serving: "#059669", Access: "#d97706",
  Flow: "#dc2626", Triggering: "#be185d", Association: "#6b7280",
  Specialization: "#4b5563", Influence: "#9333ea",
};

// ============================================================================
// ArchiMate Icons (SVG paths, rendered in 16x14 top-right corner)
// ============================================================================

const ARCHIMATE_ICONS = {
  // Business
  BusinessActor: (g) => {
    // Stick figure
    g.appendChild(svgEl("circle", { cx: 8, cy: 3, r: 2.5, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 8, y1: 5.5, x2: 8, y2: 10, stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 4, y1: 7, x2: 12, y2: 7, stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 8, y1: 10, x2: 5, y2: 14, stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 8, y1: 10, x2: 11, y2: 14, stroke: "currentColor", "stroke-width": 1.2 }));
  },
  BusinessProcess: (g) => {
    // Right-pointing arrow/chevron
    g.appendChild(svgEl("path", { d: "M 1 1 L 11 1 L 15 7 L 11 13 L 1 13 L 5 7 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  },
  BusinessFunction: (g) => {
    // Gear
    g.appendChild(svgEl("path", { d: "M 7 1 L 9 1 L 9.5 3 L 11.5 3.8 L 13 2.3 L 14.5 3.8 L 13 5.5 L 13.5 7 L 15 7.5 L 15 9.5 L 13.5 9.5 L 13 11 L 14.5 12.5 L 13 14 L 11.5 12.5 L 9.5 13 L 9 15 L 7 15 L 6.5 13 L 4.5 12.5 L 3 14 L 1.5 12.5 L 3 11 L 2.5 9.5 L 1 9.5 L 1 7.5 L 2.5 7 L 3 5.5 L 1.5 3.8 L 3 2.3 L 4.5 3.8 L 6.5 3 Z",
      fill: "none", stroke: "currentColor", "stroke-width": 0.8, transform: "scale(0.85) translate(1,0)" }));
    g.appendChild(svgEl("circle", { cx: 8, cy: 7, r: 2.5, fill: "none", stroke: "currentColor", "stroke-width": 0.8 }));
  },
  BusinessEvent: (g) => {
    // Signal shape (notched left, pointed right)
    g.appendChild(svgEl("path", { d: "M 3 1 L 11 1 L 15 7 L 11 13 L 3 13 L 3 1 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("path", { d: "M 3 1 Q 6 7 3 13", fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  },
  BusinessObject: (g) => {
    // Rectangle with header line
    g.appendChild(svgEl("rect", { x: 1, y: 1, width: 14, height: 12, rx: 1, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 1, y1: 5, x2: 15, y2: 5, stroke: "currentColor", "stroke-width": 1.2 }));
  },
  // Application
  ApplicationComponent: (g) => {
    // Component with two tabs
    g.appendChild(svgEl("rect", { x: 4, y: 1, width: 11, height: 12, rx: 1, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("rect", { x: 1, y: 3, width: 5, height: 3, rx: 0.5, fill: "none", stroke: "currentColor", "stroke-width": 1.0 }));
    g.appendChild(svgEl("rect", { x: 1, y: 8, width: 5, height: 3, rx: 0.5, fill: "none", stroke: "currentColor", "stroke-width": 1.0 }));
  },
  ApplicationInterface: (g) => {
    // Lollipop (circle + line)
    g.appendChild(svgEl("circle", { cx: 10, cy: 7, r: 4, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 2, y1: 7, x2: 6, y2: 7, stroke: "currentColor", "stroke-width": 1.2 }));
  },
  ApplicationService: (g) => {
    // Rounded rectangle
    g.appendChild(svgEl("rect", { x: 1, y: 2, width: 14, height: 10, rx: 5, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  },
  DataObject: (g) => {
    // Document with folded corner
    g.appendChild(svgEl("path", { d: "M 1 1 L 11 1 L 15 5 L 15 13 L 1 13 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("path", { d: "M 11 1 L 11 5 L 15 5", fill: "none", stroke: "currentColor", "stroke-width": 1.0 }));
  },
  // Technology
  Node: (g) => {
    // 3D box
    g.appendChild(svgEl("path", { d: "M 1 4 L 5 1 L 15 1 L 15 10 L 11 13 L 1 13 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 1, y1: 4, x2: 11, y2: 4, stroke: "currentColor", "stroke-width": 1.0 }));
    g.appendChild(svgEl("line", { x1: 11, y1: 4, x2: 15, y2: 1, stroke: "currentColor", "stroke-width": 1.0 }));
    g.appendChild(svgEl("line", { x1: 11, y1: 4, x2: 11, y2: 13, stroke: "currentColor", "stroke-width": 1.0 }));
  },
  Device: (g) => {
    // Box with pedestal
    g.appendChild(svgEl("path", { d: "M 1 4 L 5 1 L 15 1 L 15 9 L 11 12 L 1 12 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: 1, y1: 4, x2: 11, y2: 4, stroke: "currentColor", "stroke-width": 1.0 }));
    g.appendChild(svgEl("line", { x1: 11, y1: 4, x2: 15, y2: 1, stroke: "currentColor", "stroke-width": 1.0 }));
    g.appendChild(svgEl("line", { x1: 11, y1: 4, x2: 11, y2: 12, stroke: "currentColor", "stroke-width": 1.0 }));
    g.appendChild(svgEl("line", { x1: 4, y1: 14, x2: 12, y2: 14, stroke: "currentColor", "stroke-width": 1.5 }));
  },
  SystemSoftware: (g) => {
    // Circle with inner ring
    g.appendChild(svgEl("circle", { cx: 8, cy: 7, r: 6, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    g.appendChild(svgEl("circle", { cx: 8, cy: 7, r: 3, fill: "none", stroke: "currentColor", "stroke-width": 1.0 }));
  },
  TechnologyService: (g) => {
    // Rounded rectangle (same as AppService)
    g.appendChild(svgEl("rect", { x: 1, y: 2, width: 14, height: 10, rx: 5, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  },
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

  // Hollow triangle (larger, for Realization/Specialization)
  const triHollow = svgEl("marker", {
    id: "triangle-hollow", viewBox: "0 0 12 12", refX: "12", refY: "6",
    markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
  });
  triHollow.appendChild(svgEl("path", {
    d: "M 0 0 L 12 6 L 0 12 Z", fill: "#fff", stroke: "#666", "stroke-width": "1.5",
  }));
  defs.appendChild(triHollow);

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

  const hiddenLayers = new Set();
  const hiddenElementTypes = new Set();
  const hiddenRelTypes = new Set();
  let nestElements = true;

  function emitChange() {
    onFilterChange(hiddenLayers, hiddenElementTypes, hiddenRelTypes, nestElements);
  }

  function renderPanel() {
    panel.innerHTML = "";
    const elements = model.get("elements") || [];
    const relationships = model.get("relationships") || [];

    const header = document.createElement("div");
    header.className = "aam-filter-header";
    header.innerHTML = "<strong>Filter</strong>";
    panel.appendChild(header);

    const content = document.createElement("div");
    content.className = "aam-filter-content";

    // Nest toggle
    const nestSection = document.createElement("div");
    nestSection.className = "aam-filter-section aam-filter-nest-section";
    const nestItem = document.createElement("label");
    nestItem.className = "aam-filter-item aam-filter-nest-toggle";
    const nestCb = document.createElement("input");
    nestCb.type = "checkbox"; nestCb.checked = nestElements; nestCb.className = "aam-filter-checkbox";
    nestCb.addEventListener("change", () => { nestElements = nestCb.checked; emitChange(); });
    nestItem.appendChild(nestCb);
    const nestLbl = document.createElement("span");
    nestLbl.className = "aam-filter-name"; nestLbl.textContent = "Nest elements";
    nestItem.appendChild(nestLbl);
    nestSection.appendChild(nestItem);
    content.appendChild(nestSection);

    // Layers
    const layerSection = document.createElement("div");
    layerSection.className = "aam-filter-section";
    const layerHdr = document.createElement("div");
    layerHdr.className = "aam-filter-section-title";
    layerHdr.innerHTML = '<span>Layers</span>';
    addToggleLinks(layerHdr, LAYER_ORDER, hiddenLayers, () => { emitChange(); renderPanel(); });
    layerSection.appendChild(layerHdr);

    const layerCounts = {};
    elements.forEach((e) => { layerCounts[e.layer] = (layerCounts[e.layer] || 0) + 1; });
    for (const layer of LAYER_ORDER) {
      const count = layerCounts[layer] || 0;
      if (count === 0) continue;
      const colors = LAYER_COLORS[layer];
      layerSection.appendChild(createCheckboxItem({
        name: `${layer} Layer`, count, color: colors.fill, borderColor: colors.stroke,
        isHidden: hiddenLayers.has(layer),
        onToggle: (v) => { if (v) hiddenLayers.delete(layer); else hiddenLayers.add(layer); emitChange(); },
      }));
    }
    content.appendChild(layerSection);

    // Element types
    const elemSection = document.createElement("div");
    elemSection.className = "aam-filter-section";
    const elemHdr = document.createElement("div");
    elemHdr.className = "aam-filter-section-title";
    elemHdr.innerHTML = '<span>Elements</span>';
    const allET = [...new Set(elements.map((e) => e.type))];
    addToggleLinks(elemHdr, allET, hiddenElementTypes, () => { emitChange(); renderPanel(); });
    elemSection.appendChild(elemHdr);

    const typesByLayer = {};
    elements.forEach((e) => {
      if (!typesByLayer[e.layer]) typesByLayer[e.layer] = {};
      typesByLayer[e.layer][e.type] = (typesByLayer[e.layer][e.type] || 0) + 1;
    });
    for (const layer of LAYER_ORDER) {
      const types = typesByLayer[layer];
      if (!types) continue;
      const colors = LAYER_COLORS[layer];
      const sub = document.createElement("div");
      sub.className = "aam-filter-subheader"; sub.textContent = layer; sub.style.color = colors.text;
      elemSection.appendChild(sub);
      for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
        elemSection.appendChild(createCheckboxItem({
          name: formatType(type), count, color: colors.fill, borderColor: colors.stroke,
          badge: getTypeBadge(type), isHidden: hiddenElementTypes.has(type),
          onToggle: (v) => { if (v) hiddenElementTypes.delete(type); else hiddenElementTypes.add(type); emitChange(); },
        }));
      }
    }
    content.appendChild(elemSection);

    // Relationships
    const relSection = document.createElement("div");
    relSection.className = "aam-filter-section";
    const relHdr = document.createElement("div");
    relHdr.className = "aam-filter-section-title";
    relHdr.innerHTML = '<span>Relationships</span>';
    const allRT = [...new Set(relationships.map((r) => r.type))];
    addToggleLinks(relHdr, allRT, hiddenRelTypes, () => { emitChange(); renderPanel(); });
    relSection.appendChild(relHdr);

    const relCounts = {};
    relationships.forEach((r) => { relCounts[r.type] = (relCounts[r.type] || 0) + 1; });
    for (const [type, count] of Object.entries(relCounts).sort((a, b) => b[1] - a[1])) {
      const st = REL_STYLES[type] || {};
      relSection.appendChild(createCheckboxItem({
        name: type, count, color: REL_COLORS[type] || "#6b7280",
        borderColor: REL_COLORS[type] || "#6b7280", dash: st.dash,
        isHidden: hiddenRelTypes.has(type),
        onToggle: (v) => { if (v) hiddenRelTypes.delete(type); else hiddenRelTypes.add(type); emitChange(); },
      }));
    }
    content.appendChild(relSection);
    panel.appendChild(content);
  }

  model.on("change:elements", renderPanel);
  model.on("change:relationships", renderPanel);
  renderPanel();
  return { element: panel, render: renderPanel };
}

function addToggleLinks(header, allKeys, hiddenSet, callback) {
  if (allKeys.length < 2) return;
  const links = document.createElement("span");
  links.className = "aam-filter-toggles";
  const a = document.createElement("a"); a.textContent = "all"; a.href = "#";
  a.addEventListener("click", (e) => { e.preventDefault(); allKeys.forEach((k) => hiddenSet.delete(k)); callback(); });
  const n = document.createElement("a"); n.textContent = "none"; n.href = "#";
  n.addEventListener("click", (e) => { e.preventDefault(); allKeys.forEach((k) => hiddenSet.add(k)); callback(); });
  links.appendChild(a); links.appendChild(document.createTextNode(" / ")); links.appendChild(n);
  header.appendChild(links);
}

function createCheckboxItem({ name, count, color, borderColor, badge, dash, isHidden, onToggle }) {
  const item = document.createElement("div");
  item.className = "aam-filter-item" + (isHidden ? " aam-filter-hidden" : "");
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = !isHidden; cb.className = "aam-filter-checkbox";
  cb.addEventListener("change", () => { item.classList.toggle("aam-filter-hidden", !cb.checked); onToggle(cb.checked); });
  item.appendChild(cb);
  const sw = document.createElement("span");
  sw.className = "aam-filter-swatch"; sw.style.background = color; sw.style.borderColor = borderColor || color;
  if (dash) sw.style.borderStyle = "dashed";
  item.appendChild(sw);
  if (badge) {
    const b = document.createElement("span"); b.className = "aam-filter-badge"; b.textContent = badge;
    item.appendChild(b);
  }
  const nm = document.createElement("span"); nm.className = "aam-filter-name"; nm.textContent = name;
  item.appendChild(nm);
  const ct = document.createElement("span"); ct.className = "aam-filter-count"; ct.textContent = count;
  item.appendChild(ct);
  return item;
}

// ============================================================================
// Layout
// ============================================================================

const NESTING_REL_TYPES = new Set(["Composition", "Aggregation"]);
const CONTAINER_PAD_TOP = 28;
const CONTAINER_PAD = 14;
const CHILD_COLS = 3;
const CHILD_GAP = 10;
const LAYER_GAP = 60;
const LAYER_MARGIN = 50;

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

  function containerSize(parentId) {
    const ch = parentToChildren.get(parentId) || [];
    const cols = Math.min(ch.length, CHILD_COLS);
    const rows = Math.ceil(ch.length / CHILD_COLS);
    return {
      width: Math.max(cols * NODE_WIDTH + (cols - 1) * CHILD_GAP + CONTAINER_PAD * 2, NODE_WIDTH + CONTAINER_PAD * 2),
      height: Math.max(rows * NODE_HEIGHT + (rows - 1) * CHILD_GAP + CONTAINER_PAD_TOP + CONTAINER_PAD, NODE_HEIGHT + CONTAINER_PAD_TOP + CONTAINER_PAD),
    };
  }

  // --- Group top-level elements by layer ---
  const layerElements = {};
  for (const el of elements) {
    if (childToParent.has(el.id)) continue;
    if (!layerElements[el.layer]) layerElements[el.layer] = [];
    layerElements[el.layer].push(el);
  }

  // --- Collect cross-layer edge targets for sorting (minimize crossings) ---
  const crossLayerTargets = new Map(); // nodeId → [target x positions]
  // We'll populate this after first pass

  // --- Layout each layer with dagre LR ---
  const nodePositions = new Map();
  let currentY = LAYER_MARGIN;
  let maxWidth = 0;
  const orderedLayers = LAYER_ORDER.filter((l) => layerElements[l] && layerElements[l].length > 0);

  for (const layer of orderedLayers) {
    const layerEls = layerElements[layer];
    const layerIds = new Set(layerEls.map((e) => e.id));

    // Find within-layer edges
    const withinEdges = [];
    for (const rel of relationships) {
      if (nestedEdgeIds.has(rel.id)) continue;
      let src = rel.source, tgt = rel.target;
      if (childToParent.has(src)) src = childToParent.get(src);
      if (childToParent.has(tgt)) tgt = childToParent.get(tgt);
      if (src === tgt) continue;
      if (layerIds.has(src) && layerIds.has(tgt)) withinEdges.push({ src, tgt, rel });
    }

    // Find connected vs disconnected nodes
    const connectedIds = new Set();
    withinEdges.forEach(({ src, tgt }) => { connectedIds.add(src); connectedIds.add(tgt); });
    const connected = layerEls.filter((e) => connectedIds.has(e.id));
    const disconnected = layerEls.filter((e) => !connectedIds.has(e.id));

    let layerW = 0, layerH = 0;

    // Layout connected nodes with dagre LR
    if (connected.length > 0) {
      const g = new dagre.graphlib.Graph({ multigraph: true });
      g.setGraph({ rankdir: "LR", ranksep: 60, nodesep: 30, edgesep: 20, marginx: 20, marginy: 20 });
      g.setDefaultEdgeLabel(() => ({}));

      for (const el of connected) {
        const isP = parentIds.has(el.id);
        const sz = isP ? containerSize(el.id) : { width: NODE_WIDTH, height: NODE_HEIGHT };
        g.setNode(el.id, { label: el.name, width: sz.width, height: sz.height });
      }
      for (const { src, tgt, rel } of withinEdges) {
        g.setEdge(src, tgt, { relationship: rel }, rel.id);
      }
      dagre.layout(g);

      const gInfo = g.graph();
      layerW = gInfo.width || 0;
      layerH = gInfo.height || 0;

      for (const nodeId of g.nodes()) {
        const nd = g.node(nodeId);
        nodePositions.set(nodeId, {
          x: nd.x, y: nd.y + currentY,
          width: nd.width, height: nd.height,
          layer, _isParent: parentIds.has(nodeId),
        });
      }
    }

    // Layout disconnected nodes in a horizontal row below the dagre output
    if (disconnected.length > 0) {
      const gap = 20;
      const startY = currentY + layerH + (layerH > 0 ? 30 : 0);
      let rowX = 20;
      let rowH = 0;

      for (const el of disconnected) {
        const isP = parentIds.has(el.id);
        const sz = isP ? containerSize(el.id) : { width: NODE_WIDTH, height: NODE_HEIGHT };
        nodePositions.set(el.id, {
          x: rowX + sz.width / 2, y: startY + sz.height / 2,
          width: sz.width, height: sz.height,
          layer, _isParent: isP,
        });
        rowX += sz.width + gap;
        rowH = Math.max(rowH, sz.height);
      }
      layerW = Math.max(layerW, rowX);
      layerH += (layerH > 0 ? 30 : 0) + rowH;
    }

    maxWidth = Math.max(maxWidth, layerW);
    currentY += layerH + LAYER_GAP;
  }

  // --- Center layers ---
  for (const layer of orderedLayers) {
    const layerEls = layerElements[layer];
    let minX = Infinity, maxX = -Infinity;
    for (const el of layerEls) {
      const pos = nodePositions.get(el.id);
      if (pos) { minX = Math.min(minX, pos.x - pos.width / 2); maxX = Math.max(maxX, pos.x + pos.width / 2); }
    }
    const lw = maxX - minX;
    const ox = (maxWidth - lw) / 2 - minX + LAYER_MARGIN;
    for (const el of layerEls) {
      const pos = nodePositions.get(el.id);
      if (pos) pos.x += ox;
    }
  }

  // --- Position children inside parents ---
  for (const [pid, children] of parentToChildren) {
    const pp = nodePositions.get(pid);
    if (!pp) continue;
    const px = pp.x - pp.width / 2 + CONTAINER_PAD;
    const py = pp.y - pp.height / 2 + CONTAINER_PAD_TOP;
    children.forEach((cid, i) => {
      const col = i % CHILD_COLS, row = Math.floor(i / CHILD_COLS);
      const ce = elemById.get(cid);
      nodePositions.set(cid, {
        x: px + col * (NODE_WIDTH + CHILD_GAP) + NODE_WIDTH / 2,
        y: py + row * (NODE_HEIGHT + CHILD_GAP) + NODE_HEIGHT / 2,
        width: NODE_WIDTH, height: NODE_HEIGHT,
        layer: ce ? ce.layer : pp.layer, _isChild: true,
      });
    });
  }

  // --- Build edges with orthogonal routing ---
  const edgeList = [];
  for (const rel of relationships) {
    if (nestedEdgeIds.has(rel.id)) continue;
    if (!elementIds.has(rel.source) || !elementIds.has(rel.target)) continue;

    let src = rel.source, tgt = rel.target;
    if (childToParent.has(src)) src = childToParent.get(src);
    if (childToParent.has(tgt)) tgt = childToParent.get(tgt);
    if (src === tgt) continue;

    const sp = nodePositions.get(src), tp = nodePositions.get(tgt);
    if (!sp || !tp) continue;
    const se = elemById.get(src), te = elemById.get(tgt);
    if (!se || !te) continue;
    const sL = LAYER_RANK[se.layer] ?? 3, tL = LAYER_RANK[te.layer] ?? 3;

    let points;
    if (sL === tL) {
      // Same layer: horizontal routing (dagre handles this via within-layer edges)
      // Simple: right side of source → left side of target, with a jog if needed
      const sy = sp.y, ty = tp.y;
      const sx = sp.x + sp.width / 2, tx = tp.x - tp.width / 2;
      if (Math.abs(sy - ty) < 5) {
        points = [{ x: sx, y: sy }, { x: tx, y: ty }];
      } else {
        const midX = (sx + tx) / 2;
        points = [{ x: sx, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: tx, y: ty }];
      }
    } else {
      // Cross-layer: orthogonal V-H-V routing
      const goDown = sL < tL;
      const srcY = goDown ? sp.y + sp.height / 2 : sp.y - sp.height / 2;
      const tgtY = goDown ? tp.y - tp.height / 2 : tp.y + tp.height / 2;
      const midY = (srcY + tgtY) / 2;

      if (Math.abs(sp.x - tp.x) < 5) {
        // Vertically aligned: straight down
        points = [{ x: sp.x, y: srcY }, { x: tp.x, y: tgtY }];
      } else {
        // V-H-V: go down, jog horizontally, go down to target
        points = [
          { x: sp.x, y: srcY },
          { x: sp.x, y: midY },
          { x: tp.x, y: midY },
          { x: tp.x, y: tgtY },
        ];
      }
    }

    edgeList.push({ points, relationship: rel });
  }

  const totalW = maxWidth + LAYER_MARGIN * 2;
  const totalH = currentY - LAYER_GAP + LAYER_MARGIN;

  return { nodes: nodePositions, edges: edgeList, width: totalW, height: totalH };
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

  const svg = svgEl("svg", {
    width: "100%", height: "100%",
    viewBox: `0 0 ${layout.width} ${layout.height}`, class: "aam-svg",
  });
  svg.appendChild(buildMarkerDefs());
  const mainG = svgEl("g", { class: "aam-main" });
  svg.appendChild(mainG);

  drawLayerBands(mainG, layout, layout.width);

  // Containers (behind everything)
  const containersG = svgEl("g", { class: "aam-containers" });
  mainG.appendChild(containersG);
  for (const [id, nd] of layout.nodes) {
    const el = elements.find((e) => e.id === id);
    if (el && nd._isParent) drawContainerNode(containersG, nd, el, darkMode);
  }

  // Edges
  const edgesG = svgEl("g", { class: "aam-edges" });
  mainG.appendChild(edgesG);
  for (const edge of layout.edges) drawEdge(edgesG, edge, darkMode);

  // Leaf nodes
  const nodesG = svgEl("g", { class: "aam-nodes" });
  mainG.appendChild(nodesG);
  for (const [id, nd] of layout.nodes) {
    const el = elements.find((e) => e.id === id);
    if (el && !nd._isParent) drawNode(nodesG, nd, el, darkMode);
  }

  container.appendChild(svg);
  setupZoomPan(svg, mainG);
}

function drawLayerBands(parentG, layout, svgWidth) {
  const ext = {};
  for (const [, nd] of layout.nodes) {
    const l = nd.layer || "Other";
    if (nd._isChild) continue;
    if (!ext[l]) ext[l] = { minY: Infinity, maxY: -Infinity };
    ext[l].minY = Math.min(ext[l].minY, nd.y - nd.height / 2);
    ext[l].maxY = Math.max(ext[l].maxY, nd.y + nd.height / 2);
  }
  for (const [layer, e] of Object.entries(ext)) {
    const c = LAYER_COLORS[layer] || LAYER_COLORS.Other;
    const pad = 20, by = e.minY - pad - LAYER_LABEL_PAD, bh = e.maxY - e.minY + pad * 2 + LAYER_LABEL_PAD;
    parentG.appendChild(svgEl("rect", { x: 0, y: by, width: svgWidth, height: bh, fill: c.fill, opacity: "0.18", rx: "4" }));
    const lbl = svgEl("text", { x: 14, y: by + 18, class: "aam-layer-label", fill: c.text });
    lbl.textContent = `${layer} Layer`;
    parentG.appendChild(lbl);
  }
}

function drawNode(parentG, nd, el, darkMode) {
  const c = LAYER_COLORS[el.layer] || LAYER_COLORS.Other;
  const x = nd.x - NODE_WIDTH / 2, y = nd.y - NODE_HEIGHT / 2;
  const rx = nodeRx(el.type);

  const group = svgEl("g", { class: "aam-node", "data-id": el.id, transform: `translate(${x}, ${y})` });

  group.appendChild(svgEl("rect", {
    width: NODE_WIDTH, height: NODE_HEIGHT, rx,
    fill: c.fill, stroke: c.stroke, "stroke-width": "1.5", class: "aam-node-rect",
  }));

  // ArchiMate icon (top-right)
  const iconFn = ARCHIMATE_ICONS[el.type];
  if (iconFn) {
    const iconG = svgEl("g", { transform: `translate(${NODE_WIDTH - 20}, 2)`, color: c.text, opacity: "0.7" });
    iconFn(iconG);
    group.appendChild(iconG);
  }

  // Name
  const text = svgEl("text", {
    x: NODE_WIDTH / 2, y: NODE_HEIGHT / 2 + 1,
    "text-anchor": "middle", "dominant-baseline": "middle",
    class: "aam-node-label", fill: c.text,
  });
  text.textContent = truncate(el.name, 22);
  group.appendChild(text);

  // Type sublabel
  const sub = svgEl("text", {
    x: NODE_WIDTH / 2, y: NODE_HEIGHT - 8,
    "text-anchor": "middle", class: "aam-node-type", fill: c.text, opacity: "0.6",
  });
  sub.textContent = formatType(el.type);
  group.appendChild(sub);

  const title = svgEl("title");
  title.textContent = `${el.name}\n${formatType(el.type)} (${el.layer})\n${el.documentation || ""}`;
  group.appendChild(title);
  parentG.appendChild(group);
}

function drawContainerNode(parentG, nd, el, darkMode) {
  const c = LAYER_COLORS[el.layer] || LAYER_COLORS.Other;
  const w = nd.width, h = nd.height, x = nd.x - w / 2, y = nd.y - h / 2;
  const rx = nodeRx(el.type);

  const group = svgEl("g", { class: "aam-node aam-container", "data-id": el.id, transform: `translate(${x}, ${y})` });

  group.appendChild(svgEl("rect", {
    width: w, height: h, rx, fill: c.fill, stroke: c.stroke, "stroke-width": "1.5", opacity: "0.5", class: "aam-node-rect",
  }));
  // Header
  group.appendChild(svgEl("rect", { width: w, height: CONTAINER_PAD_TOP - 2, rx, fill: c.stroke, opacity: "0.2" }));
  group.appendChild(svgEl("rect", { x: 0, y: Math.min(rx, CONTAINER_PAD_TOP - 2), width: w, height: Math.max(0, CONTAINER_PAD_TOP - 2 - rx), fill: c.stroke, opacity: "0.2" }));

  const text = svgEl("text", { x: 8, y: CONTAINER_PAD_TOP / 2 + 1, "dominant-baseline": "middle", class: "aam-node-label", fill: c.text, "font-size": "11" });
  text.textContent = truncate(el.name, 30);
  group.appendChild(text);

  // Icon
  const iconFn = ARCHIMATE_ICONS[el.type];
  if (iconFn) {
    const iconG = svgEl("g", { transform: `translate(${w - 20}, 3)`, color: c.text, opacity: "0.7" });
    iconFn(iconG);
    group.appendChild(iconG);
  }

  const title = svgEl("title");
  title.textContent = `${el.name}\n${formatType(el.type)} (${el.layer})\n${el.documentation || ""}`;
  group.appendChild(title);
  parentG.appendChild(group);
}

function drawEdge(parentG, edgeData, darkMode) {
  const pts = edgeData.points || [];
  if (pts.length < 2) return;

  const rel = edgeData.relationship || {};
  const style = REL_STYLES[rel.type] || REL_STYLES.Serving;
  const strokeColor = darkMode ? "#aaa" : "#666";

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;

  const path = svgEl("path", { d, fill: "none", stroke: strokeColor, "stroke-width": "1.3", class: "aam-edge" });
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
  let vb = svg.viewBox.baseVal, isPanning = false, startPt = { x: 0, y: 0 }, scale = 1;

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const d = e.deltaY > 0 ? 1.1 : 0.9, pt = svgPoint(svg, e), ns = scale * d;
    if (ns < 0.1 || ns > 10) return;
    vb.x = pt.x - (pt.x - vb.x) * d; vb.y = pt.y - (pt.y - vb.y) * d;
    vb.width *= d; vb.height *= d; scale = ns;
  }, { passive: false });

  svg.addEventListener("mousedown", (e) => { if (e.button !== 0) return; isPanning = true; startPt = svgPoint(svg, e); svg.style.cursor = "grabbing"; });
  svg.addEventListener("mousemove", (e) => { if (!isPanning) return; const pt = svgPoint(svg, e); vb.x -= pt.x - startPt.x; vb.y -= pt.y - startPt.y; });
  svg.addEventListener("mouseup", () => { isPanning = false; svg.style.cursor = "grab"; });
  svg.addEventListener("mouseleave", () => { isPanning = false; svg.style.cursor = "grab"; });
  svg.style.cursor = "grab";
}

function svgPoint(svg, event) {
  const pt = svg.createSVGPoint(); pt.x = event.clientX; pt.y = event.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// ============================================================================
// Utilities
// ============================================================================

function truncate(s, n) { return !s ? "" : s.length > n ? s.slice(0, n - 1) + "\u2026" : s; }

function formatType(type) {
  return type.replace("Application", "App ").replace("Business", "Biz ").replace("Technology", "Tech ")
    .replace("System", "Sys ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

function getTypeBadge(type) {
  return ({
    ApplicationComponent: "AC", ApplicationInterface: "AI", ApplicationService: "AS", DataObject: "DO",
    BusinessActor: "BA", BusinessProcess: "BP", BusinessFunction: "BF", BusinessEvent: "BE", BusinessObject: "BO",
    Node: "Nd", Device: "Dv", SystemSoftware: "SS", TechnologyService: "TS",
  })[type] || "";
}

// ============================================================================
// Anywidget Render
// ============================================================================

function render({ model, el }) {
  const wrapper = document.createElement("div");
  wrapper.className = "aam-wrapper";
  el.appendChild(wrapper);

  const toolbar = document.createElement("div");
  toolbar.className = "aam-toolbar";
  toolbar.innerHTML = `
    <button class="aam-btn aam-btn-filter" title="Toggle filter panel">&#9776;</button>
    <span class="aam-title">ArchiMate Model</span>
    <span class="aam-legend">
      <span class="aam-legend-item"><span class="aam-dot" style="background:#FFFFB5;border-color:#C8C800"></span>Business</span>
      <span class="aam-legend-item"><span class="aam-dot" style="background:#B5FFFF;border-color:#00B2B2"></span>Application</span>
      <span class="aam-legend-item"><span class="aam-dot" style="background:#C9E7B7;border-color:#5BA83B"></span>Technology</span>
    </span>
    <button class="aam-btn aam-btn-fit" title="Fit to view">Fit</button>
    <button class="aam-btn aam-btn-dark" title="Toggle dark mode">&#9681;</button>
  `;
  wrapper.appendChild(toolbar);

  const contentArea = document.createElement("div");
  contentArea.className = "aam-content";
  wrapper.appendChild(contentArea);

  let hiddenLayers = new Set(), hiddenElemTypes = new Set(), hiddenRelTypes = new Set(), nestElements = true;

  const filterPanel = buildFilterPanel(model, (l, e, r, n) => {
    hiddenLayers = l; hiddenElemTypes = e; hiddenRelTypes = r; nestElements = n; rebuildDiagram();
  });
  filterPanel.element.classList.add("aam-panel-open");
  contentArea.appendChild(filterPanel.element);

  const graphContainer = document.createElement("div");
  graphContainer.className = "aam-graph-container";
  graphContainer.style.height = model.get("height") + "px";
  contentArea.appendChild(graphContainer);

  const details = document.createElement("div");
  details.className = "aam-details"; details.style.display = "none";
  wrapper.appendChild(details);

  function getFilteredData() {
    const ae = model.get("elements") || [], ar = model.get("relationships") || [];
    const els = ae.filter((e) => !hiddenLayers.has(e.layer) && !hiddenElemTypes.has(e.type));
    const vis = new Set(els.map((e) => e.id));
    const rels = ar.filter((r) => !hiddenRelTypes.has(r.type) && vis.has(r.source) && vis.has(r.target));
    return { elements: els, relationships: rels };
  }

  function rebuildDiagram() {
    const dm = model.get("dark_mode");
    wrapper.classList.toggle("aam-dark", dm);
    const { elements, relationships } = getFilteredData();
    renderDiagram(graphContainer, elements, relationships, dm, nestElements);

    const allEls = model.get("elements") || [];
    graphContainer.querySelectorAll(".aam-node").forEach((node) => {
      node.addEventListener("click", () => {
        const found = allEls.find((e) => e.id === node.dataset.id);
        if (found) { model.set("selected_element", { ...found }); model.save_changes(); showDetails(details, found); }
      });
    });
  }

  toolbar.querySelector(".aam-btn-filter").addEventListener("click", () => filterPanel.element.classList.toggle("aam-panel-open"));
  toolbar.querySelector(".aam-btn-fit").addEventListener("click", () => {
    const s = graphContainer.querySelector("svg");
    if (s) { const v = s.getAttribute("viewBox").split(" ").map(Number); s.setAttribute("viewBox", v.join(" ")); }
  });
  toolbar.querySelector(".aam-btn-dark").addEventListener("click", () => { model.set("dark_mode", !model.get("dark_mode")); model.save_changes(); });

  model.on("change:elements", rebuildDiagram);
  model.on("change:relationships", rebuildDiagram);
  model.on("change:dark_mode", rebuildDiagram);
  model.on("change:height", () => { graphContainer.style.height = model.get("height") + "px"; rebuildDiagram(); });
  rebuildDiagram();
}

function showDetails(container, el) {
  container.style.display = "block";
  container.innerHTML = `
    <div class="aam-details-header"><strong>${el.name}</strong><button class="aam-btn aam-details-close">&times;</button></div>
    <div class="aam-details-body">
      <div><span class="aam-detail-label">Type:</span> ${formatType(el.type)}</div>
      <div><span class="aam-detail-label">Layer:</span> ${el.layer}</div>
      <div><span class="aam-detail-label">ID:</span> <code>${el.id}</code></div>
      ${el.documentation ? `<div class="aam-detail-doc">${el.documentation}</div>` : ""}
    </div>`;
  container.querySelector(".aam-details-close").addEventListener("click", () => { container.style.display = "none"; });
}
