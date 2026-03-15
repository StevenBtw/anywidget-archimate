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

// Dagre rank (top=0) per layer
const LAYER_RANK = { Business: 0, Application: 1, Technology: 2, Other: 3 };

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const NODE_RX = 6;
const LAYER_LABEL_PAD = 30;

// ArchiMate relationship visual config
const REL_STYLES = {
  Composition:  { dash: "",       srcMarker: "diamond-filled",  tgtMarker: "" },
  Aggregation:  { dash: "",       srcMarker: "diamond-hollow",  tgtMarker: "" },
  Assignment:   { dash: "",       srcMarker: "circle-filled",   tgtMarker: "arrow-filled" },
  Realization:  { dash: "6 4",    srcMarker: "",                tgtMarker: "arrow-hollow" },
  Serving:      { dash: "",       srcMarker: "",                tgtMarker: "arrow-hollow" },
  Access:       { dash: "4 3",    srcMarker: "",                tgtMarker: "arrow-hollow" },
  Flow:         { dash: "6 4",    srcMarker: "",                tgtMarker: "arrow-filled" },
  Triggering:   { dash: "",       srcMarker: "",                tgtMarker: "arrow-filled" },
  Association:  { dash: "",       srcMarker: "",                tgtMarker: "" },
  Specialization:{ dash: "",      srcMarker: "",                tgtMarker: "arrow-hollow" },
  Influence:    { dash: "6 4",    srcMarker: "",                tgtMarker: "arrow-hollow" },
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

  // Arrow filled (solid triangle)
  const arrowFilled = svgEl("marker", {
    id: "arrow-filled", viewBox: "0 0 10 10", refX: "10", refY: "5",
    markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse",
  });
  const afPath = svgEl("path", { d: "M 0 0 L 10 5 L 0 10 Z", fill: "#666" });
  arrowFilled.appendChild(afPath);
  defs.appendChild(arrowFilled);

  // Arrow hollow (open triangle)
  const arrowHollow = svgEl("marker", {
    id: "arrow-hollow", viewBox: "0 0 10 10", refX: "10", refY: "5",
    markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse",
  });
  const ahPath = svgEl("path", {
    d: "M 0 0 L 10 5 L 0 10 Z", fill: "#fff", stroke: "#666", "stroke-width": "1.5",
  });
  arrowHollow.appendChild(ahPath);
  defs.appendChild(arrowHollow);

  // Diamond filled
  const diamondFilled = svgEl("marker", {
    id: "diamond-filled", viewBox: "0 0 12 12", refX: "6", refY: "6",
    markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
  });
  const dfPath = svgEl("path", { d: "M 0 6 L 6 0 L 12 6 L 6 12 Z", fill: "#666" });
  diamondFilled.appendChild(dfPath);
  defs.appendChild(diamondFilled);

  // Diamond hollow
  const diamondHollow = svgEl("marker", {
    id: "diamond-hollow", viewBox: "0 0 12 12", refX: "6", refY: "6",
    markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
  });
  const dhPath = svgEl("path", {
    d: "M 0 6 L 6 0 L 12 6 L 6 12 Z", fill: "#fff", stroke: "#666", "stroke-width": "1.5",
  });
  diamondHollow.appendChild(dhPath);
  defs.appendChild(diamondHollow);

  // Circle filled
  const circleFilled = svgEl("marker", {
    id: "circle-filled", viewBox: "0 0 10 10", refX: "5", refY: "5",
    markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse",
  });
  const cfCircle = svgEl("circle", { cx: "5", cy: "5", r: "4", fill: "#666" });
  circleFilled.appendChild(cfCircle);
  defs.appendChild(circleFilled);

  return defs;
}

// ============================================================================
// Layout
// ============================================================================

function computeLayout(elements, relationships) {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "TB",
    ranksep: 80,
    nodesep: 40,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Build a set of element IDs for validation
  const elementIds = new Set(elements.map((e) => e.id));

  // Add nodes with rank hints (layer → rank)
  for (const el of elements) {
    g.setNode(el.id, {
      label: el.name,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layer: el.layer,
      rank: LAYER_RANK[el.layer] ?? 3,
    });
  }

  // Add edges (only for valid source/target)
  for (const rel of relationships) {
    if (elementIds.has(rel.source) && elementIds.has(rel.target)) {
      g.setEdge(rel.source, rel.target, { relationship: rel }, rel.id);
    }
  }

  dagre.layout(g);
  return g;
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

  // Create SVG
  const svg = svgEl("svg", {
    width: "100%",
    height: "100%",
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    class: "aam-svg",
  });

  // Marker definitions
  svg.appendChild(buildMarkerDefs());

  // Main group for zoom/pan
  const mainG = svgEl("g", { class: "aam-main" });
  svg.appendChild(mainG);

  // Draw layer bands
  drawLayerBands(mainG, g, elements, svgWidth);

  // Draw edges
  const edgesG = svgEl("g", { class: "aam-edges" });
  mainG.appendChild(edgesG);

  for (const e of g.edges()) {
    const edgeData = g.edge(e);
    drawEdge(edgesG, edgeData, darkMode);
  }

  // Draw nodes
  const nodesG = svgEl("g", { class: "aam-nodes" });
  mainG.appendChild(nodesG);

  for (const nodeId of g.nodes()) {
    const nodeData = g.node(nodeId);
    const el = elements.find((e) => e.id === nodeId);
    if (el && nodeData) {
      drawNode(nodesG, nodeData, el, darkMode);
    }
  }

  container.appendChild(svg);

  // Add zoom/pan
  setupZoomPan(svg, mainG);
}

function drawLayerBands(parentG, g, elements, svgWidth) {
  // Group nodes by layer and find vertical extents
  const layerExtents = {};
  for (const nodeId of g.nodes()) {
    const nd = g.node(nodeId);
    if (!nd) continue;
    const layer = nd.layer || "Other";
    if (!layerExtents[layer]) {
      layerExtents[layer] = { minY: Infinity, maxY: -Infinity };
    }
    layerExtents[layer].minY = Math.min(layerExtents[layer].minY, nd.y - nd.height / 2);
    layerExtents[layer].maxY = Math.max(layerExtents[layer].maxY, nd.y + nd.height / 2);
  }

  for (const [layer, ext] of Object.entries(layerExtents)) {
    const colors = LAYER_COLORS[layer] || LAYER_COLORS.Other;
    const pad = 20;
    const bandY = ext.minY - pad - LAYER_LABEL_PAD;
    const bandH = ext.maxY - ext.minY + pad * 2 + LAYER_LABEL_PAD;

    const rect = svgEl("rect", {
      x: 0, y: bandY,
      width: svgWidth,
      height: bandH,
      fill: colors.fill,
      opacity: "0.18",
      rx: "4",
    });
    parentG.appendChild(rect);

    // Layer label
    const label = svgEl("text", {
      x: 14,
      y: bandY + 18,
      class: "aam-layer-label",
      fill: colors.text,
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
    class: "aam-node",
    "data-id": el.id,
    transform: `translate(${x}, ${y})`,
  });

  // Background rect
  const rect = svgEl("rect", {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    rx: NODE_RX,
    fill: colors.fill,
    stroke: colors.stroke,
    "stroke-width": "1.5",
    class: "aam-node-rect",
  });
  group.appendChild(rect);

  // Type icon badge (small rounded rect in top-right)
  const badge = getTypeBadge(el.type);
  if (badge) {
    const badgeG = svgEl("g", { transform: `translate(${NODE_WIDTH - 24}, 4)` });
    const badgeRect = svgEl("rect", {
      width: 20, height: 14, rx: 2,
      fill: colors.stroke, opacity: "0.25",
    });
    badgeG.appendChild(badgeRect);
    const badgeText = svgEl("text", {
      x: 10, y: 11,
      "text-anchor": "middle",
      "font-size": "8",
      fill: colors.text,
      "font-weight": "bold",
    });
    badgeText.textContent = badge;
    badgeG.appendChild(badgeText);
    group.appendChild(badgeG);
  }

  // Name label (truncated)
  const text = svgEl("text", {
    x: NODE_WIDTH / 2,
    y: NODE_HEIGHT / 2 + 1,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    class: "aam-node-label",
    fill: colors.text,
  });
  text.textContent = truncate(el.name, 22);
  group.appendChild(text);

  // Type sublabel
  const subtext = svgEl("text", {
    x: NODE_WIDTH / 2,
    y: NODE_HEIGHT - 8,
    "text-anchor": "middle",
    class: "aam-node-type",
    fill: colors.text,
    opacity: "0.6",
  });
  subtext.textContent = formatType(el.type);
  group.appendChild(subtext);

  // Tooltip
  const title = svgEl("title");
  title.textContent = `${el.name}\n${formatType(el.type)} (${el.layer})\n${el.documentation || ""}`;
  group.appendChild(title);

  parentG.appendChild(group);
}

function drawEdge(parentG, edgeData, darkMode) {
  const points = edgeData.points || [];
  if (points.length < 2) return;

  const rel = edgeData.relationship || {};
  const style = REL_STYLES[rel.type] || REL_STYLES.Serving;
  const strokeColor = darkMode ? "#aaa" : "#666";

  // Build path from dagre points
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }

  const path = svgEl("path", {
    d,
    fill: "none",
    stroke: strokeColor,
    "stroke-width": "1.5",
    class: "aam-edge",
  });

  if (style.dash) {
    path.setAttribute("stroke-dasharray", style.dash);
  }
  if (style.srcMarker) {
    path.setAttribute("marker-start", `url(#${style.srcMarker})`);
  }
  if (style.tgtMarker) {
    path.setAttribute("marker-end", `url(#${style.tgtMarker})`);
  }

  // Tooltip
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

    // Zoom toward cursor
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

  svg.addEventListener("mouseup", () => {
    isPanning = false;
    svg.style.cursor = "grab";
  });

  svg.addEventListener("mouseleave", () => {
    isPanning = false;
    svg.style.cursor = "grab";
  });

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
  // "ApplicationComponent" → "App Component"
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
    ApplicationComponent: "AC",
    ApplicationInterface: "AI",
    ApplicationService: "AS",
    DataObject: "DO",
    BusinessActor: "BA",
    BusinessProcess: "BP",
    BusinessFunction: "BF",
    BusinessEvent: "BE",
    BusinessObject: "BO",
    Node: "Nd",
    Device: "Dv",
    SystemSoftware: "SS",
    TechnologyService: "TS",
  };
  return badges[type] || "";
}

// ============================================================================
// Anywidget Render
// ============================================================================

function render({ model, el }) {
  // Create wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "aam-wrapper";
  el.appendChild(wrapper);

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "aam-toolbar";
  toolbar.innerHTML = `
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

  // Graph container
  const graphContainer = document.createElement("div");
  graphContainer.className = "aam-graph-container";
  graphContainer.style.height = model.get("height") + "px";
  wrapper.appendChild(graphContainer);

  // Details panel (hidden by default)
  const details = document.createElement("div");
  details.className = "aam-details";
  details.style.display = "none";
  wrapper.appendChild(details);

  function rebuild() {
    const elements = model.get("elements") || [];
    const relationships = model.get("relationships") || [];
    const darkMode = model.get("dark_mode");

    if (darkMode) {
      wrapper.classList.add("aam-dark");
    } else {
      wrapper.classList.remove("aam-dark");
    }

    renderDiagram(graphContainer, elements, relationships, darkMode);

    // Attach click handlers to nodes
    graphContainer.querySelectorAll(".aam-node").forEach((node) => {
      node.addEventListener("click", () => {
        const id = node.dataset.id;
        const el = elements.find((e) => e.id === id);
        if (el) {
          model.set("selected_element", { ...el });
          model.save_changes();
          showDetails(details, el);
        }
      });
    });
  }

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
  model.on("change:elements", rebuild);
  model.on("change:relationships", rebuild);
  model.on("change:dark_mode", rebuild);
  model.on("change:height", () => {
    graphContainer.style.height = model.get("height") + "px";
    rebuild();
  });

  // Initial render
  rebuild();
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
