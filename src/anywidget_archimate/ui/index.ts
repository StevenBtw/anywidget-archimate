// ArchiMate widget renderer
// The layered layout in layout.ts, drawn in vanilla SVG

import {
  STATUS_ACCENTS,
  diagramCss,
  badgeText,
  highlightIds,
  markerId,
  resolveDark,
  statusClass,
} from "./status.ts";
import type { ArchiElement, ArchiRelationship, WidgetModel } from "./types.ts";
import { layeredLayout, openView } from "./layout.ts";
import type { LayeredLayout, PlacedNode, RoutedEdge } from "./layout.ts";
import { inkColors, mixOver } from "./colors.ts";
import { relationSample } from "./legend.ts";
import { typeName } from "./names.ts";
import { ICONS } from "./icons.ts";
import { wrapperSize } from "./size.ts";

// The colours a diagram is drawn in: the canvas and text tokens of the theme (styles.css), read from the widget so a
// host's overrides apply; the fallbacks are the token values for a page without the stylesheet
interface DiagramTheme { dark: boolean; bg: string; text: string; edge: string }
function diagramTheme(container: HTMLElement, dark: boolean): DiagramTheme {
  // Through the element's own window (a test page's window is not the global one)
  const style = container.ownerDocument?.defaultView?.getComputedStyle(container);
  const hex = (name: string, fallback: string) => {
    const v = style?.getPropertyValue(name).trim() ?? "";
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  };
  const bg = hex("--aam-graph-bg", dark ? "#161a19" : "#ffffff");
  const text = hex("--aam-text", dark ? "#e6ebe8" : "#151a18");
  return { dark, bg, text, edge: mixOver(text, bg, 0.5) };
}

// ============================================================================
// Constants
// ============================================================================

interface LayerColors {
  fill: string;
  stroke: string;
  text: string;
}

// Archi standard colors; Plateau and Gap take the Implementation pink, so each band has one color
const LAYER_COLORS: Record<string, LayerColors> = {
  Motivation:     { fill: "#CCCCFF", stroke: "#8484E0", text: "#2E2E6B" },
  Strategy:       { fill: "#F5DEAA", stroke: "#C99A3B", text: "#5C4211" },
  Business:       { fill: "#FFFFB5", stroke: "#C8C800", text: "#555500" },
  Application:    { fill: "#B5FFFF", stroke: "#00B2B2", text: "#005555" },
  Technology:     { fill: "#C9E7B7", stroke: "#5BA83B", text: "#2D5A1E" },
  Implementation: { fill: "#FFE0E0", stroke: "#DA7F7F", text: "#6B2525" },
  Other:          { fill: "#E8E8E8", stroke: "#999999", text: "#333333" },
};

// Bands top to bottom: why (Motivation, Strategy), what and how (Business, Application, Technology), then change
const LAYER_ORDER: string[] = ["Motivation", "Strategy", "Business", "Application", "Technology", "Implementation", "Other"];
const LAYER_RANK: Record<string, number> = Object.fromEntries(LAYER_ORDER.map((layer, i) => [layer, i]));
// Other names for a layer, in lower case (Physical elements belong to Technology)
const LAYER_ALIASES: Record<string, string> = {
  "implementation & migration": "Implementation", "implementation and migration": "Implementation",
  implementation_migration: "Implementation", physical: "Technology",
};

// A layer named in any case ("application", "TECHNOLOGY") or by an alias is that layer; a missing or unknown one comes
// from the element's type, else it is Other
function normalizeLayer(layer: unknown, type: string): string {
  const key = String(layer ?? "").trim().toLowerCase();
  return LAYER_ORDER.find((l) => l.toLowerCase() === key) ?? LAYER_ALIASES[key] ?? ELEMENT_TYPES.get(type)?.layer ?? "Other";
}

// The model's elements, each with a layer the diagram and filter panel know and a type as text ("" when missing). A
// junction in Other moves to the layer most of the elements it joins share, so it sits between them.
function modelElements(model: WidgetModel): ArchiElement[] {
  const elements = ((model.get("elements") ?? []) as ArchiElement[]).map((e) => (LAYER_ORDER.includes(e.layer ?? "") && typeof e.type === "string"
    ? e
    : { ...e, layer: normalizeLayer(e.layer, String(e.type ?? "")), type: String(e.type ?? "") }));
  const layerOf = new Map(elements.filter((e) => !isJunction(e.type ?? "")).map((e) => [e.id, e.layer ?? "Other"]));
  const votes = new Map<string, Map<string, number>>();
  for (const r of (model.get("relationships") ?? []) as ArchiRelationship[]) {
    for (const [end, other] of [[r.source, r.target], [r.target, r.source]] as [string, string][]) {
      if (!layerOf.has(other)) continue;
      const count = votes.get(end) ?? new Map<string, number>();
      const otherLayer = layerOf.get(other) as string;
      count.set(otherLayer, (count.get(otherLayer) ?? 0) + 1);
      votes.set(end, count);
    }
  }
  return elements.map((e) => {
    if (!isJunction(e.type ?? "") || e.layer !== "Other" || !votes.has(e.id)) return e;
    const [layer] = [...votes.get(e.id) as Map<string, number>].sort((a, b) => b[1] - a[1] || LAYER_RANK[a[0]] - LAYER_RANK[b[0]])[0];
    return { ...e, layer };
  });
}

// Every ArchiMate 3.2 element type: its layer, filter badge, icon shape and whether it is behavior (rounded corners).
// Archi writes a junction as "Junction", the Open Exchange Format as "AndJunction" or "OrJunction".
interface ElementTypeInfo {
  layer: string;
  badge: string;
  icon: string;
  behavior: boolean;
}
const ELEMENT_TYPE_ROWS: [type: string, layer: string, badge: string, icon: string, behavior?: boolean][] = [
  ["Stakeholder", "Motivation", "Sh", "role"], ["Driver", "Motivation", "Dr", "driver"],
  ["Assessment", "Motivation", "As", "assessment"], ["Goal", "Motivation", "Go", "goal"],
  ["Outcome", "Motivation", "Oc", "outcome"], ["Principle", "Motivation", "Pr", "principle"],
  ["Requirement", "Motivation", "Rq", "requirement"], ["Constraint", "Motivation", "Cs", "constraint"],
  ["Meaning", "Motivation", "Mn", "meaning"], ["Value", "Motivation", "Va", "value"],

  ["Resource", "Strategy", "Rs", "resource"], ["Capability", "Strategy", "Cp", "capability", true],
  ["ValueStream", "Strategy", "VS", "valueStream", true], ["CourseOfAction", "Strategy", "CA", "courseOfAction", true],

  ["BusinessActor", "Business", "BA", "actor"], ["BusinessRole", "Business", "BR", "role"],
  ["BusinessCollaboration", "Business", "BCo", "collaboration"], ["BusinessInterface", "Business", "BI", "interface"],
  ["BusinessProcess", "Business", "BP", "process", true], ["BusinessFunction", "Business", "BF", "function", true],
  ["BusinessInteraction", "Business", "BX", "interaction", true], ["BusinessEvent", "Business", "BE", "event", true],
  ["BusinessService", "Business", "BS", "service", true], ["BusinessObject", "Business", "BO", "object"],
  ["Contract", "Business", "Ct", "contract"], ["Representation", "Business", "Rp", "representation"],
  ["Product", "Business", "Pd", "product"],

  ["ApplicationComponent", "Application", "AC", "component"], ["ApplicationCollaboration", "Application", "ACo", "collaboration"],
  ["ApplicationInterface", "Application", "AI", "interface"], ["ApplicationFunction", "Application", "AF", "function", true],
  ["ApplicationInteraction", "Application", "AX", "interaction", true], ["ApplicationProcess", "Application", "AP", "process", true],
  ["ApplicationEvent", "Application", "AE", "event", true], ["ApplicationService", "Application", "AS", "service", true],
  ["DataObject", "Application", "DO", "dataObject"],

  ["Node", "Technology", "Nd", "node"], ["Device", "Technology", "Dv", "device"],
  ["SystemSoftware", "Technology", "SS", "systemSoftware"], ["TechnologyCollaboration", "Technology", "TCo", "collaboration"],
  ["TechnologyInterface", "Technology", "TI", "interface"], ["Path", "Technology", "Pa", "path"],
  ["CommunicationNetwork", "Technology", "CN", "network"], ["TechnologyFunction", "Technology", "TF", "function", true],
  ["TechnologyProcess", "Technology", "TP", "process", true], ["TechnologyInteraction", "Technology", "TX", "interaction", true],
  ["TechnologyEvent", "Technology", "TE", "event", true], ["TechnologyService", "Technology", "TS", "service", true],
  ["Artifact", "Technology", "Ar", "artifact"],
  ["Equipment", "Technology", "Eq", "equipment"], ["Facility", "Technology", "Fa", "facility"],
  ["DistributionNetwork", "Technology", "DN", "distribution"], ["Material", "Technology", "Ma", "material"],

  ["WorkPackage", "Implementation", "WP", "workPackage", true], ["Deliverable", "Implementation", "Dl", "deliverable"],
  ["ImplementationEvent", "Implementation", "IE", "event", true], ["Plateau", "Implementation", "Pl", "plateau"],
  ["Gap", "Implementation", "Gp", "gap"],

  ["Location", "Other", "Lo", "location"], ["Grouping", "Other", "Gr", "grouping"],
  ["Junction", "Other", "Jn", "junction"], ["AndJunction", "Other", "Jn", "junction"], ["OrJunction", "Other", "Jn", "junction"],
];
const ELEMENT_TYPES = new Map<string, ElementTypeInfo>(
  ELEMENT_TYPE_ROWS.map(([type, layer, badge, icon, behavior = false]) => [type, { layer, badge, icon, behavior }]),
);

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const JUNCTION_SIZE = 12;

function nodeRx(type: string): number { return ELEMENT_TYPES.get(type)?.behavior ? 14 : 4; }
function isJunction(type: string): boolean { return ELEMENT_TYPES.get(type)?.icon === "junction"; }
// The size an element takes in the layout: a junction is a small dot that relationships attach to
function nodeSize(el: ArchiElement): { width: number; height: number } {
  return isJunction(el.type ?? "") ? { width: JUNCTION_SIZE, height: JUNCTION_SIZE } : { width: NODE_WIDTH, height: NODE_HEIGHT };
}

// Relationship visual config
interface RelStyle {
  dash: string;
  srcMarker: string;
  tgtMarker: string;
}
const REL_STYLES: Record<string, RelStyle> = {
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

// ============================================================================
// ArchiMate Icons (SVG shapes in ArchiMate notation, rendered in a 16x14 box in the top-right corner)
// ============================================================================

type SvgAttrs = Record<string, string | number | undefined | null>;
const ICON_STROKE: SvgAttrs = { fill: "none", stroke: "currentColor", "stroke-width": 1.2 };
const iconPath = (g: SVGGElement, d: string, extra: SvgAttrs = {}) => g.appendChild(svgEl("path", { d, ...ICON_STROKE, ...extra }));
const iconCircle = (g: SVGGElement, cx: number, cy: number, r: number, extra: SvgAttrs = {}) => g.appendChild(svgEl("circle", { cx, cy, r, ...ICON_STROKE, ...extra }));
const iconLine = (g: SVGGElement, x1: number, y1: number, x2: number, y2: number, width = 1.2, extra: SvgAttrs = {}) =>
  g.appendChild(svgEl("line", { x1, y1, x2, y2, stroke: "currentColor", "stroke-width": width, ...extra }));
const iconRect = (g: SVGGElement, x: number, y: number, width: number, height: number, rx = 0, extra: SvgAttrs = {}) =>
  g.appendChild(svgEl("rect", { x, y, width, height, rx, ...ICON_STROKE, ...extra }));
const DOT: SvgAttrs = { fill: "currentColor", stroke: "none" };

const ICON_SHAPES: Record<string, (g: SVGGElement) => void> = {
  // Active structure
  actor: (g) => {
    iconCircle(g, 8, 3, 2.5);
    iconLine(g, 8, 5.5, 8, 10); iconLine(g, 4, 7, 12, 7);
    iconLine(g, 8, 10, 5, 14); iconLine(g, 8, 10, 11, 14);
  },
  role: (g) => {
    // A cylinder on its side
    iconPath(g, "M 12 2 H 4 A 2.5 5 0 0 0 4 12 H 12");
    g.appendChild(svgEl("ellipse", { cx: 12, cy: 7, rx: 2.5, ry: 5, ...ICON_STROKE }));
  },
  collaboration: (g) => { iconCircle(g, 5.8, 7, 4.5); iconCircle(g, 10.2, 7, 4.5); },
  interface: (g) => { iconCircle(g, 10, 7, 4); iconLine(g, 2, 7, 6, 7); },
  component: (g) => {
    iconRect(g, 4, 1, 11, 12, 1);
    iconRect(g, 1, 3, 5, 3, 0.5, { "stroke-width": 1.0 }); iconRect(g, 1, 8, 5, 3, 0.5, { "stroke-width": 1.0 });
  },
  node: (g) => {
    iconPath(g, "M 1 4 L 5 1 L 15 1 L 15 10 L 11 13 L 1 13 Z");
    iconLine(g, 1, 4, 11, 4, 1.0); iconLine(g, 11, 4, 15, 1, 1.0); iconLine(g, 11, 4, 11, 13, 1.0);
  },
  device: (g) => {
    iconPath(g, "M 1 4 L 5 1 L 15 1 L 15 9 L 11 12 L 1 12 Z");
    iconLine(g, 1, 4, 11, 4, 1.0); iconLine(g, 11, 4, 15, 1, 1.0); iconLine(g, 11, 4, 11, 12, 1.0);
    iconLine(g, 4, 14, 12, 14, 1.5);
  },
  systemSoftware: (g) => { iconCircle(g, 8, 7, 6); iconCircle(g, 8, 7, 3, { "stroke-width": 1.0 }); },
  path: (g) => {
    iconLine(g, 2.5, 7, 13.5, 7, 1.2, { "stroke-dasharray": "2 1.5" });
    iconPath(g, "M 4.5 4 L 1.5 7 L 4.5 10"); iconPath(g, "M 11.5 4 L 14.5 7 L 11.5 10");
  },
  network: (g) => {
    iconPath(g, "M 1.5 11 L 5 3 L 14.5 3 L 11 11 Z");
    for (const [cx, cy] of [[1.5, 11], [5, 3], [14.5, 3], [11, 11]]) iconCircle(g, cx, cy, 1.4, DOT);
  },
  equipment: (g) => {
    // Two cogs
    iconCircle(g, 6, 8.5, 3.6, { "stroke-width": 2.2, "stroke-dasharray": "1.4 1.2" });
    iconCircle(g, 6, 8.5, 1.3, { "stroke-width": 1.0 });
    iconCircle(g, 12, 3.5, 2.4, { "stroke-width": 1.8, "stroke-dasharray": "1.2 1" });
  },
  facility: (g) => iconPath(g, "M 1 13 V 5 L 5 8 V 5 L 9 8 V 1 H 12.5 V 13 Z"),
  distribution: (g) => {
    iconLine(g, 3, 5, 13, 5); iconLine(g, 3, 9, 13, 9);
    iconPath(g, "M 4 2 L 1 7 L 4 12"); iconPath(g, "M 12 2 L 15 7 L 12 12");
  },
  location: (g) => {
    iconPath(g, "M 8 13.5 C 5 9.5 3 7.5 3 5 A 5 5 0 0 1 13 5 C 13 7.5 11 9.5 8 13.5 Z");
    iconCircle(g, 8, 5, 1.8, { "stroke-width": 1.0 });
  },
  // Behavior
  process: (g) => iconPath(g, "M 1 4.5 H 9 V 1.5 L 15 7 L 9 12.5 V 9.5 H 1 Z"),
  function: (g) => iconPath(g, "M 2 5 L 8 1 L 14 5 L 14 13 L 8 9 L 2 13 Z"),
  interaction: (g) => { iconPath(g, "M 7 2 A 5 5 0 0 0 7 12 Z"); iconPath(g, "M 9 2 A 5 5 0 0 1 9 12 Z"); },
  event: (g) => {
    iconPath(g, "M 3 1 L 11 1 L 15 7 L 11 13 L 3 13 L 3 1 Z");
    iconPath(g, "M 3 1 Q 6 7 3 13");
  },
  service: (g) => iconRect(g, 1, 2, 14, 10, 5),
  valueStream: (g) => iconPath(g, "M 1 1 L 11 1 L 15 7 L 11 13 L 1 13 L 5 7 Z"),
  capability: (g) => {
    // Three steps
    iconPath(g, "M 1 13 V 9 H 5.5 V 5 H 10 V 1 H 15 V 13 Z");
    iconLine(g, 5.5, 9, 15, 9, 0.8); iconLine(g, 10, 5, 15, 5, 0.8);
    iconLine(g, 5.5, 9, 5.5, 13, 0.8); iconLine(g, 10, 5, 10, 13, 0.8);
  },
  courseOfAction: (g) => {
    iconCircle(g, 11.5, 4, 3); iconCircle(g, 11.5, 4, 1, DOT);
    iconPath(g, "M 1.5 13.5 Q 2 6.5 8 5.5"); iconPath(g, "M 5.8 3.6 L 8.3 5.4 L 6.3 7.8");
  },
  workPackage: (g) => {
    // A circular arrow
    iconPath(g, "M 13.5 7 A 5.5 5.5 0 1 1 9.8 1.8");
    iconPath(g, "M 7.6 0.4 L 10.1 2 L 8.2 4.4");
  },
  // Passive structure and other
  object: (g) => { iconRect(g, 1, 1, 14, 12, 1); iconLine(g, 1, 5, 15, 5); },
  contract: (g) => { iconRect(g, 1, 1, 14, 12, 1); iconLine(g, 1, 5, 15, 5); iconLine(g, 1, 9, 15, 9, 1.0); },
  representation: (g) => { iconPath(g, "M 1 1 H 15 V 11 Q 11.5 8.5 8 11 T 1 11 Z"); iconLine(g, 1, 4.5, 15, 4.5, 1.0); },
  deliverable: (g) => iconPath(g, "M 1 1 H 15 V 11 Q 11.5 8.5 8 11 T 1 11 Z"),
  product: (g) => { iconRect(g, 1, 1, 14, 12, 1); iconRect(g, 1, 1, 7, 3.5, 0, { "stroke-width": 1.0 }); },
  dataObject: (g) => {
    iconPath(g, "M 1 1 L 11 1 L 15 5 L 15 13 L 1 13 Z");
    iconPath(g, "M 11 1 L 11 5 L 15 5", { "stroke-width": 1.0 });
  },
  artifact: (g) => {
    iconPath(g, "M 3 1 L 10 1 L 13 4 L 13 13 L 3 13 Z");
    iconPath(g, "M 10 1 L 10 4 L 13 4", { "stroke-width": 1.0 });
  },
  material: (g) => {
    iconPath(g, "M 4.5 1 H 11.5 L 15 7 L 11.5 13 H 4.5 L 1 7 Z");
    iconLine(g, 5.5, 3.5, 10.5, 3.5, 0.9); iconLine(g, 5.5, 10.5, 10.5, 10.5, 0.9);
  },
  grouping: (g) => iconPath(g, "M 1 4 V 13 H 15 V 4 H 8 V 1 H 1 V 4 H 8", { "stroke-dasharray": "2 1.3" }),
  plateau: (g) => { iconLine(g, 5, 3, 15, 3, 1.6); iconLine(g, 3, 7, 13, 7, 1.6); iconLine(g, 1, 11, 11, 11, 1.6); },
  gap: (g) => {
    g.appendChild(svgEl("ellipse", { cx: 8, cy: 7, rx: 6, ry: 5, ...ICON_STROKE }));
    iconLine(g, 1, 5.5, 15, 5.5, 0.9); iconLine(g, 1, 8.5, 15, 8.5, 0.9);
  },
  // Motivation
  driver: (g) => {
    iconCircle(g, 8, 7, 5.5); iconCircle(g, 8, 7, 1.5, DOT);
    iconLine(g, 8, 0.5, 8, 13.5, 0.9); iconLine(g, 1.5, 7, 14.5, 7, 0.9);
    iconLine(g, 3.4, 2.4, 12.6, 11.6, 0.9); iconLine(g, 12.6, 2.4, 3.4, 11.6, 0.9);
  },
  assessment: (g) => { iconCircle(g, 6.5, 5.5, 4.5); iconLine(g, 9.8, 8.8, 14, 13, 1.8); },
  goal: (g) => { iconCircle(g, 8, 7, 6); iconCircle(g, 8, 7, 3.5); iconCircle(g, 8, 7, 1.2, DOT); },
  outcome: (g) => {
    iconCircle(g, 7, 8, 5.5); iconCircle(g, 7, 8, 3); iconCircle(g, 7, 8, 1, DOT);
    iconLine(g, 7, 8, 14.5, 0.5, 1.0); iconPath(g, "M 11.5 0.8 L 14.5 0.5 L 14.2 3.5", { "stroke-width": 1.0 });
  },
  principle: (g) => { iconRect(g, 3, 1, 10, 12, 1); iconLine(g, 8, 3.5, 8, 8.5, 1.6); iconCircle(g, 8, 10.7, 0.9, DOT); },
  requirement: (g) => iconPath(g, "M 4 2 H 15 L 12 12 H 1 Z"),
  constraint: (g) => { iconPath(g, "M 4 2 H 15 L 12 12 H 1 Z"); iconLine(g, 7, 2, 4, 12, 1.0); },
  meaning: (g) => iconPath(g, "M 4.5 12 A 3 3 0 0 1 3 6.5 A 3.5 3.5 0 0 1 9 3.5 A 3 3 0 0 1 14 6.5 A 3 3 0 0 1 12 12 Z"),
  value: (g) => g.appendChild(svgEl("ellipse", { cx: 8, cy: 7, rx: 6.5, ry: 4.5, ...ICON_STROKE })),
  resource: (g) => {
    // A battery
    iconRect(g, 1, 3, 12, 8, 1.5); iconRect(g, 13, 5.5, 2, 3, 0, { "stroke-width": 1.0 });
    for (const x of [4, 7, 10]) iconLine(g, x, 5, x, 9, 1.0);
  },
};

// The icon drawing for an element type, if it has one (a junction is drawn on its own)
function iconFor(type: string): ((g: SVGGElement) => void) | undefined { return ICON_SHAPES[ELEMENT_TYPES.get(type)?.icon ?? ""]; }

// ============================================================================
// SVG Helpers
// ============================================================================

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: SvgAttrs = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  }
  return el;
}

// querySelector, but the widget's own markup is always there: fail loudly instead of on a null
function qs<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`widget markup is missing ${selector}`);
  return found;
}

function buildMarkerDefs(theme: DiagramTheme): SVGDefsElement {
  const defs = svgEl("defs");

  // One set per line color: the default grey, and the color of each status that recolors an edge
  // Heads in the theme's line colour; a hollow head is filled with the canvas, so it reads in either theme
  for (const [status, color] of [[null, theme.edge], ...STATUS_ACCENTS] as [string | null, string][]) {
    const arrowFilled = svgEl("marker", {
      id: markerId("arrow-filled", status), viewBox: "0 0 10 10", refX: "10", refY: "5",
      markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse",
    });
    arrowFilled.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 Z", fill: color }));
    defs.appendChild(arrowFilled);

    const arrowHollow = svgEl("marker", {
      id: markerId("arrow-hollow", status), viewBox: "0 0 10 10", refX: "10", refY: "5",
      markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse",
    });
    arrowHollow.appendChild(svgEl("path", {
      d: "M 0 0 L 10 5 L 0 10 Z", fill: theme.bg, stroke: color, "stroke-width": "1.5",
    }));
    defs.appendChild(arrowHollow);

    // Hollow triangle (larger, for Realization/Specialization)
    const triHollow = svgEl("marker", {
      id: markerId("triangle-hollow", status), viewBox: "0 0 12 12", refX: "12", refY: "6",
      markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
    });
    triHollow.appendChild(svgEl("path", {
      d: "M 0 0 L 12 6 L 0 12 Z", fill: theme.bg, stroke: color, "stroke-width": "1.5",
    }));
    defs.appendChild(triHollow);

    const diamondFilled = svgEl("marker", {
      id: markerId("diamond-filled", status), viewBox: "0 0 12 12", refX: "6", refY: "6",
      markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
    });
    diamondFilled.appendChild(svgEl("path", { d: "M 0 6 L 6 0 L 12 6 L 6 12 Z", fill: color }));
    defs.appendChild(diamondFilled);

    const diamondHollow = svgEl("marker", {
      id: markerId("diamond-hollow", status), viewBox: "0 0 12 12", refX: "6", refY: "6",
      markerWidth: "10", markerHeight: "10", orient: "auto-start-reverse",
    });
    diamondHollow.appendChild(svgEl("path", {
      d: "M 0 6 L 6 0 L 12 6 L 6 12 Z", fill: theme.bg, stroke: color, "stroke-width": "1.5",
    }));
    defs.appendChild(diamondHollow);

    const circleFilled = svgEl("marker", {
      id: markerId("circle-filled", status), viewBox: "0 0 10 10", refX: "5", refY: "5",
      markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse",
    });
    circleFilled.appendChild(svgEl("circle", { cx: "5", cy: "5", r: "4", fill: color }));
    defs.appendChild(circleFilled);
  }

  return defs;
}

// ============================================================================
// Filter Sidebar
// ============================================================================

function buildFilterPanel(
  model: WidgetModel,
  onFilterChange: (layers: Set<string>, elementTypes: Set<string>, relTypes: Set<string>, nest: boolean, nestRelations: boolean) => void,
): { element: HTMLDivElement; render: () => void; dispose: () => void } {
  const panel = document.createElement("div");
  panel.className = "aam-filter-panel";

  const hiddenLayers = new Set<string>();
  const hiddenElementTypes = new Set<string>();
  const hiddenRelTypes = new Set<string>();
  let nestElements = true;
  // Relationships most children of a container share are one line at the container (layout.ts SHARED_SHARE)
  let nestRelations = true;

  function emitChange() {
    onFilterChange(hiddenLayers, hiddenElementTypes, hiddenRelTypes, nestElements, nestRelations);
  }

  function renderPanel() {
    panel.innerHTML = "";
    const elements = modelElements(model);
    const relationships = (model.get("relationships") ?? []) as ArchiRelationship[];

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
    const relItem = document.createElement("label");
    relItem.className = "aam-filter-item aam-filter-nest-toggle";
    relItem.title = "A relationship most of a container's children share is drawn once, at the container";
    const relCb = document.createElement("input");
    relCb.type = "checkbox"; relCb.checked = nestRelations; relCb.className = "aam-filter-checkbox";
    relCb.addEventListener("change", () => { nestRelations = relCb.checked; emitChange(); });
    const relLbl = document.createElement("span");
    relLbl.className = "aam-filter-name"; relLbl.textContent = "Nest relationships";
    relItem.append(relCb, relLbl);
    nestSection.appendChild(relItem);
    content.appendChild(nestSection);

    // Layers
    const layerSection = document.createElement("div");
    layerSection.className = "aam-filter-section";
    const layerHdr = document.createElement("div");
    layerHdr.className = "aam-filter-section-title";
    layerHdr.innerHTML = '<span>Layers</span>';
    addToggleLinks(layerHdr, LAYER_ORDER, hiddenLayers, () => { emitChange(); renderPanel(); });
    layerSection.appendChild(layerHdr);

    const layerCounts: Record<string, number> = {};
    elements.forEach((e) => { layerCounts[e.layer ?? ""] = (layerCounts[e.layer ?? ""] || 0) + 1; });
    for (const layer of LAYER_ORDER) {
      const count = layerCounts[layer] || 0;
      if (count === 0) continue;
      const colors = LAYER_COLORS[layer];
      layerSection.appendChild(createCheckboxItem({
        name: `${layer} Layer`, count, color: colors.stroke, borderColor: colors.stroke,
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
    const allET = [...new Set(elements.map((e) => e.type ?? ""))];
    addToggleLinks(elemHdr, allET, hiddenElementTypes, () => { emitChange(); renderPanel(); });
    elemSection.appendChild(elemHdr);

    const typesByLayer: Record<string, Record<string, number>> = {};
    elements.forEach((e) => {
      const layer = e.layer ?? "";
      if (!typesByLayer[layer]) typesByLayer[layer] = {};
      typesByLayer[layer][e.type ?? ""] = (typesByLayer[layer][e.type ?? ""] || 0) + 1;
    });
    for (const layer of LAYER_ORDER) {
      const types = typesByLayer[layer];
      if (!types) continue;
      const colors = LAYER_COLORS[layer];
      const sub = document.createElement("div");
      sub.className = "aam-filter-subheader"; sub.textContent = layer;
      sub.style.setProperty("--aam-layer-text", colors.text); sub.style.setProperty("--aam-layer-text-dark", colors.stroke);
      elemSection.appendChild(sub);
      for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
        elemSection.appendChild(createCheckboxItem({
          name: formatType(type) || "(no type)", count, color: colors.stroke, borderColor: colors.stroke,
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
    const allRT = [...new Set(relationships.map((r) => r.type ?? ""))];
    addToggleLinks(relHdr, allRT, hiddenRelTypes, () => { emitChange(); renderPanel(); });
    relSection.appendChild(relHdr);

    const relCounts: Record<string, number> = {};
    relationships.forEach((r) => { relCounts[r.type ?? ""] = (relCounts[r.type ?? ""] || 0) + 1; });
    for (const [type, count] of Object.entries(relCounts).sort((a, b) => b[1] - a[1])) {
      const st = REL_STYLES[type] ?? { dash: "", srcMarker: "", tgtMarker: "" };
      relSection.appendChild(createCheckboxItem({
        name: type, count, color: "", sample: relationSample(st, "currentColor"),
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
  const dispose = () => {
    model.off("change:elements", renderPanel);
    model.off("change:relationships", renderPanel);
  };
  return { element: panel, render: renderPanel, dispose };
}

function addToggleLinks(header: HTMLElement, allKeys: string[], hiddenSet: Set<string>, callback: () => void): void {
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

function createCheckboxItem({ name, count, color, borderColor, badge, sample, isHidden, onToggle }: {
  name: string;
  count: number;
  color: string;
  borderColor?: string;
  badge?: string;
  // SVG markup of a relationship's line (legend.ts; constants only, no data)
  sample?: string;
  isHidden: boolean;
  onToggle: (checked: boolean) => void;
}): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "aam-filter-item" + (isHidden ? " aam-filter-hidden" : "");
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = !isHidden; cb.className = "aam-filter-checkbox";
  cb.addEventListener("change", () => { item.classList.toggle("aam-filter-hidden", !cb.checked); onToggle(cb.checked); });
  item.appendChild(cb);
  const sw = document.createElement("span");
  if (sample) {
    // A relationship: a sample of its line (dash pattern and ends), as the diagram draws it
    sw.className = "aam-filter-line";
    sw.innerHTML = sample;
  } else {
    // A layer or element type: drawn like the element, a ring in the hue over 38% of it
    sw.className = "aam-filter-swatch";
    sw.style.background = `color-mix(in srgb, ${color} 38%, var(--aam-panel-bg))`;
    sw.style.borderColor = borderColor || color;
  }
  item.appendChild(sw);
  if (badge) {
    const b = document.createElement("span"); b.className = "aam-filter-badge"; b.textContent = badge;
    item.appendChild(b);
  }
  const nm = document.createElement("span"); nm.className = "aam-filter-name"; nm.textContent = name;
  item.appendChild(nm);
  const ct = document.createElement("span"); ct.className = "aam-filter-count"; ct.textContent = String(count);
  item.appendChild(ct);
  return item;
}

// A container's header band (the label row above its children; layout.ts SPACING.containerHead)
const CONTAINER_PAD_TOP = 28;

// ============================================================================
// Rendering
// ============================================================================

// Draws the diagram fitted to the container; returns the SVG, its fitted viewBox and its layout key, or null
// when there is nothing to draw
function renderDiagram(
  container: HTMLElement,
  elements: ArchiElement[],
  relationships: ArchiRelationship[],
  darkMode: boolean,
  nestElements: boolean,
  collapsed: Set<string> = new Set(),
  nestRelations = true,
): { svg: SVGSVGElement; fit: string; key: string } | null {
  container.innerHTML = "";
  if (!elements.length) {
    container.innerHTML = '<div class="aam-empty">Nothing to show yet. Open a model file, or use <code>.load_xml(path)</code> or <code>ArchiMate.from_xml(path)</code> in Python.</div>';
    return null;
  }

  const layout = layeredLayout(elements, relationships, {
    nest: nestElements, collapsed, bundle: nestRelations, layerOrder: LAYER_ORDER,
    sizeOf: (el) => (isJunction(el.type ?? "") ? { width: JUNCTION_SIZE, height: JUNCTION_SIZE } : nodeSize(el)),
  });

  const svg = svgEl("svg", {
    width: "100%", height: "100%",
    // Lines quiet until their element is hovered or selected (styles.css .aam-lines-quiet)
    viewBox: `0 0 ${layout.width} ${layout.height}`, class: "aam-svg aam-lines-quiet",
  });
  const style = svgEl("style");
  // Comparison styling for the theme (status fills that keep labels readable in dark)
  style.textContent = diagramCss(darkMode, diagramTheme(container, darkMode).bg);
  svg.appendChild(style);
  svg.appendChild(buildMarkerDefs(diagramTheme(container, darkMode)));
  const mainG = svgEl("g", { class: "aam-main" });
  svg.appendChild(mainG);

  const theme = diagramTheme(container, darkMode);
  drawLayerBands(mainG, layout, theme);

  // Containers behind everything, outer ones first
  const byId = new Map(elements.map((e) => [e.id, e]));
  const containersG = svgEl("g", { class: "aam-containers" });
  mainG.appendChild(containersG);
  const containers = [...layout.nodes].filter(([, nd]) => nd.container).sort((a, b) => a[1].depth - b[1].depth);
  for (const [id, nd] of containers) {
    const el = byId.get(id);
    if (el) drawContainerNode(containersG, nd, el, theme);
  }

  // Edges
  const edgesG = svgEl("g", { class: "aam-edges" });
  mainG.appendChild(edgesG);
  const nameOf = (id: string) => String(elements.find((e) => e.id === id)?.name || id);
  // A line's chain: its drawn ends and every container around them, so hovering a container lights its children's lines
  const chainOf = (id: string) => {
    const ids: string[] = [];
    for (let q: string | null | undefined = id; q; q = layout.nodes.get(q)?.parent) ids.push(q);
    return ids;
  };
  for (const edge of layout.edges) drawEdge(edgesG, edge, theme, nameOf, [...new Set([...chainOf(edge.source), ...chainOf(edge.target)])]);

  // Leaf nodes
  const nodesG = svgEl("g", { class: "aam-nodes" });
  mainG.appendChild(nodesG);
  for (const [id, nd] of layout.nodes) {
    const el = byId.get(id);
    if (el && !nd.container) (isJunction(el.type ?? "") ? drawJunction : drawNode)(nodesG, nd, el, theme);
  }

  container.appendChild(svg);
  setupZoomPan(svg, layout.width);
  return { svg, fit: `0 0 ${layout.width} ${layout.height}`, key: layoutKey(layout) };
}

// Every element's id and box, and the diagram size: equal keys mean a redraw moved nothing (status, badge and
// theme never move anything)
function layoutKey(layout: LayeredLayout): string {
  const boxes = [...layout.nodes].map(([id, nd]) => `${id}:${nd.x},${nd.y},${nd.width},${nd.height}`);
  return `${layout.width}x${layout.height};${boxes.join(";")}`;
}

// One band per role row of a layer (actors, services, processes; services and interfaces, applications and data;
// technology services, infrastructure), a faint tint of the layer's hue with its label at the top left
function drawLayerBands(parentG: SVGGElement, layout: LayeredLayout, theme: DiagramTheme): void {
  for (const band of layout.bands) {
    const c = LAYER_COLORS[band.layer] || LAYER_COLORS.Other;
    parentG.appendChild(svgEl("rect", {
      x: 12, y: band.y0, width: layout.width - 24, height: band.y1 - band.y0,
      fill: mixOver(c.stroke, theme.bg, theme.dark ? 0.09 : 0.07), rx: "3", class: "aam-band",
    }));
    if (!band.label) continue;
    const lbl = svgEl("text", { x: 22, y: band.y0 + 15, class: "aam-layer-label", "data-layer": band.layer, fill: theme.dark ? c.stroke : c.text });
    lbl.textContent = band.label;
    parentG.appendChild(lbl);
  }
}

// The fold marker of a container: a small square with "-" (fold) or "+" (unfold), handled in render()
function foldMarker(id: string, x: number, y: number, folded: boolean, theme: DiagramTheme): SVGGElement {
  const g = svgEl("g", { class: "aam-fold", "data-fold": id, transform: `translate(${x}, ${y})` });
  g.appendChild(svgEl("rect", { width: 12, height: 12, rx: 2, fill: theme.bg, stroke: theme.edge, "stroke-width": "1" }));
  g.appendChild(svgEl("path", { d: folded ? "M3 6h6M6 3v6" : "M3 6h6", stroke: theme.text, "stroke-width": "1.4" }));
  const title = svgEl("title");
  title.textContent = folded ? "Unfold" : "Fold";
  g.appendChild(title);
  return g;
}

function drawNode(parentG: SVGGElement, nd: PlacedNode, el: ArchiElement, theme: DiagramTheme): void {
  const c = LAYER_COLORS[el.layer ?? "Other"] ?? LAYER_COLORS.Other;
  // Ink: a ring in the layer's ArchiMate hue over 38% of it on the canvas, text in the theme's text colour
  const ink = inkColors(c.stroke, theme.bg);
  const x = nd.x - NODE_WIDTH / 2, y = nd.y - NODE_HEIGHT / 2;
  const rx = nodeRx(el.type ?? "");

  const group = svgEl("g", { class: `aam-node ${statusClass(el.status)}`.trim(), "data-id": el.id, transform: `translate(${x}, ${y})` });

  if (nd.collapsed) {
    // Folded: a second outline behind, as a stack of what it holds
    group.appendChild(svgEl("rect", { x: 4, y: 4, width: NODE_WIDTH, height: NODE_HEIGHT, rx, fill: ink.fill, stroke: ink.stroke, "stroke-width": "1.5", opacity: "0.6" }));
  }
  group.appendChild(svgEl("rect", {
    width: NODE_WIDTH, height: NODE_HEIGHT, rx,
    fill: ink.fill, stroke: ink.stroke, "stroke-width": "2", class: "aam-node-rect",
  }));
  if (nd.collapsed) {
    group.appendChild(foldMarker(el.id, 5, 5, true, theme));
    const count = svgEl("text", { x: NODE_WIDTH - 6, y: NODE_HEIGHT - 6, "text-anchor": "end", class: "aam-node-type", fill: theme.text, opacity: "0.7" });
    count.textContent = `+${nd.hidden}`;
    group.appendChild(count);
  }

  // ArchiMate icon (top-right)
  const iconFn = iconFor(el.type ?? "");
  if (iconFn) {
    const iconG = svgEl("g", { class: "aam-node-icon", transform: `translate(${NODE_WIDTH - 20}, 2)`, color: theme.text, opacity: "0.7" });
    iconFn(iconG);
    group.appendChild(iconG);
  }

  // Name
  const text = svgEl("text", {
    x: NODE_WIDTH / 2, y: NODE_HEIGHT / 2 + 1,
    "text-anchor": "middle", "dominant-baseline": "middle",
    class: "aam-node-label", fill: theme.text,
  });
  text.textContent = truncate(el.name, 22);
  group.appendChild(text);

  // Type sublabel
  const sub = svgEl("text", {
    x: NODE_WIDTH / 2, y: NODE_HEIGHT - 8,
    "text-anchor": "middle", class: "aam-node-type", fill: theme.text, opacity: "0.6",
  });
  sub.textContent = formatType(el.type);
  group.appendChild(sub);

  const badge = badgeText(el);
  if (badge) {
    const b = svgEl("text", { x: 6, y: 10, class: "aam-node-badge", fill: theme.text });
    b.textContent = badge;
    group.appendChild(b);
  }

  const title = svgEl("title");
  title.textContent = `${el.name}\n${formatType(el.type)} (${el.layer})${badge ? "\n" + badge : ""}\n${el.documentation || ""}`;
  group.appendChild(title);
  parentG.appendChild(group);
}

// A junction is a small dot, filled for And and hollow for Or
function drawJunction(parentG: SVGGElement, nd: PlacedNode, el: ArchiElement, theme: DiagramTheme): void {
  const color = theme.text;
  const group = svgEl("g", { class: `aam-node aam-junction ${statusClass(el.status)}`.trim(), "data-id": el.id, transform: `translate(${nd.x}, ${nd.y})` });
  const or = el.type === "OrJunction";
  group.appendChild(svgEl("circle", {
    r: JUNCTION_SIZE / 2, fill: or ? "none" : color, stroke: color, "stroke-width": "1.5", "pointer-events": "all",
  }));
  const title = svgEl("title");
  title.textContent = [el.name, formatType(el.type), el.documentation].filter(Boolean).join("\n");
  group.appendChild(title);
  parentG.appendChild(group);
}

function drawContainerNode(parentG: SVGGElement, nd: PlacedNode, el: ArchiElement, theme: DiagramTheme): void {
  const c = LAYER_COLORS[el.layer ?? "Other"] ?? LAYER_COLORS.Other;
  // A container is a lighter ink (its children carry the 38% fill); its header a little stronger
  const body = mixOver(c.stroke, theme.bg, 0.14), head = mixOver(c.stroke, theme.bg, 0.3);
  const w = nd.width, h = nd.height, x = nd.x - w / 2, y = nd.y - h / 2;
  const rx = nodeRx(el.type ?? "");

  const group = svgEl("g", { class: `aam-node aam-container ${statusClass(el.status)}`.trim(), "data-id": el.id, transform: `translate(${x}, ${y})` });

  group.appendChild(svgEl("rect", {
    width: w, height: h, rx, fill: body, stroke: c.stroke, "stroke-width": "2", class: "aam-node-rect",
  }));
  // Header (a status that recolors the body recolors the header too, see DIAGRAM_CSS)
  group.appendChild(svgEl("rect", { x: 1, y: 1, width: w - 2, height: CONTAINER_PAD_TOP - 3, rx, fill: head, class: "aam-node-header" }));
  group.appendChild(svgEl("rect", { x: 1, y: Math.min(rx, CONTAINER_PAD_TOP - 3), width: w - 2, height: Math.max(0, CONTAINER_PAD_TOP - 2 - rx), fill: head, class: "aam-node-header" }));

  group.appendChild(foldMarker(el.id, 6, (CONTAINER_PAD_TOP - 12) / 2, false, theme));
  const text = svgEl("text", { x: 24, y: CONTAINER_PAD_TOP / 2 + 1, "dominant-baseline": "middle", class: "aam-node-label", fill: theme.text, "font-size": "11" });
  text.textContent = truncate(el.name, 30);
  group.appendChild(text);

  // Icon
  const iconFn = iconFor(el.type ?? "");
  if (iconFn) {
    const iconG = svgEl("g", { class: "aam-node-icon", transform: `translate(${w - 20}, 3)`, color: theme.text, opacity: "0.7" });
    iconFn(iconG);
    group.appendChild(iconG);
  }

  const badge = badgeText(el);
  if (badge) {
    const b = svgEl("text", { x: 8, y: CONTAINER_PAD_TOP + 10, class: "aam-node-badge", fill: theme.text });
    b.textContent = badge;
    group.appendChild(b);
  }

  const title = svgEl("title");
  title.textContent = `${el.name}\n${formatType(el.type)} (${el.layer})${badge ? "\n" + badge : ""}\n${el.documentation || ""}`;
  group.appendChild(title);
  parentG.appendChild(group);
}

function drawEdge(parentG: SVGGElement, edgeData: RoutedEdge, theme: DiagramTheme, nameOf: (id: string) => string, chain: string[] = []): void {
  const pts = edgeData.points || [];
  if (pts.length < 2) return;

  const rel = edgeData.relationship || {};
  const style = REL_STYLES[rel.type ?? ""] ?? REL_STYLES.Serving;
  const strokeColor = theme.edge;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;

  // The drawn ends (a container when lifted or shared), so a line can follow its elements (hover, selection)
  const path = svgEl("path", {
    d, fill: "none", stroke: strokeColor, "stroke-width": "1.3", class: `aam-edge ${statusClass(rel.status)}`.trim(),
    "data-source": edgeData.source, "data-target": edgeData.target, "data-chain": chain.join(" "),
  });
  if (style.dash) path.setAttribute("stroke-dasharray", style.dash);
  if (style.srcMarker) path.setAttribute("marker-start", `url(#${markerId(style.srcMarker, rel.status)})`);
  if (style.tgtMarker) path.setAttribute("marker-end", `url(#${markerId(style.tgtMarker, rel.status)})`);

  const members = edgeData.members ?? [rel];
  if (members.length < 2) {
    const title = svgEl("title");
    title.textContent = `${rel.type}${rel.name ? ": " + rel.name : ""}`;
    path.appendChild(title);
    parentG.appendChild(path);
    return;
  }
  // Shared (several relationships drawn once): a little heavier, the relationships listed, a wider hover target
  path.setAttribute("stroke-width", "1.9");
  const group = svgEl("g", { class: "aam-edge-shared", "data-ends": [...new Set(members.flatMap((m) => [m.source, m.target]))].join(" ") });
  const title = svgEl("title");
  title.textContent = `${members.length} ${rel.type} relationships\n` + members.map((m) => `${nameOf(m.source)} \u2192 ${nameOf(m.target)}`).join("\n");
  group.appendChild(title);
  group.appendChild(path);
  group.appendChild(svgEl("path", { d, fill: "none", stroke: "transparent", "stroke-width": "10", class: "aam-edge-hit" }));
  parentG.appendChild(group);
}

// ============================================================================
// Zoom & Pan
// ============================================================================

function setupZoomPan(svg: SVGSVGElement, fitWidth: number): void {
  let vb = svg.viewBox.baseVal, isPanning = false, startPt = { x: 0, y: 0 };

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    // The zoom level follows from the view, so the limits hold after a kept view or Fit
    const d = e.deltaY > 0 ? 1.1 : 0.9, pt = svgPoint(svg, e), ns = (vb.width * d) / fitWidth;
    if (ns < 0.1 || ns > 10) return;
    vb.x = pt.x - (pt.x - vb.x) * d; vb.y = pt.y - (pt.y - vb.y) * d;
    vb.width *= d; vb.height *= d;
  }, { passive: false });

  svg.addEventListener("mousedown", (e) => { if (e.button !== 0) return; isPanning = true; startPt = svgPoint(svg, e); svg.style.cursor = "grabbing"; });
  svg.addEventListener("mousemove", (e) => { if (!isPanning) return; const pt = svgPoint(svg, e); vb.x -= pt.x - startPt.x; vb.y -= pt.y - startPt.y; });
  svg.addEventListener("mouseup", () => { isPanning = false; svg.style.cursor = "grab"; });
  svg.addEventListener("mouseleave", () => { isPanning = false; svg.style.cursor = "grab"; });
  svg.style.cursor = "grab";
}

function svgPoint(svg: SVGSVGElement, event: MouseEvent | WheelEvent): DOMPoint {
  const pt = svg.createSVGPoint(); pt.x = event.clientX; pt.y = event.clientY;
  const ctm = svg.getScreenCTM();
  return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
}

// ============================================================================
// Utilities
// ============================================================================

function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

function truncate(s: string | null | undefined, n: number): string { return !s ? "" : s.length > n ? s.slice(0, n - 1) + "\u2026" : s; }

// A type's name without its layer prefix (names.ts)
function formatType(type: string | null | undefined): string {
  return typeName(type);
}

function getTypeBadge(type: string): string {
  return ELEMENT_TYPES.get(type)?.badge ?? "";
}

// ============================================================================
// Anywidget Render
// ============================================================================

// Above 0 while a view writes the page's theme into dark_mode. It lives on globalThis, not in this module, so views
// from another copy of the module (a cell run again, a reconnect) ignore the write too; anywidget-graph and
// anywidget-vector use the same key, which is harmless since it is only above 0 during a synchronous write.
const THEME_WRITES = Symbol.for("anywidget.theme-writes");

function render({ model, el }: { model: WidgetModel; el: HTMLElement }): () => void {
  const wrapper = document.createElement("div");
  wrapper.className = "aam-wrapper";
  el.appendChild(wrapper);

  // Auto-detect host theme: an explicit data-theme of "light" or "dark" (closest ancestor, then html, then body)
  // wins over a dark/dark-theme class, which wins over a light class, which wins over prefers-color-scheme
  function detectHostDark() {
    const html = document.documentElement, body = document.body;
    const host = el.closest ? el.closest('[data-theme="light"], [data-theme="dark"]') : null;
    const theme = ([host, html, body] as (HTMLElement | null)[]).map((n) => n?.dataset.theme).find((t) => t === "light" || t === "dark");
    const darkClass = [html, body].some((n) => n && (n.classList.contains("dark") || n.classList.contains("dark-theme")));
    const lightClass = [html, body].some((n) => n && n.classList.contains("light"));
    const prefersDark = Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    return resolveDark({ theme, darkClass, lightClass, prefersDark });
  }

  // Follow the page's theme until dark_mode is chosen: given from Python (_theme_explicit), set by the host later, or
  // switched in the toolbar. The widget's own updates while following are not a choice (THEME_WRITES, seen by every
  // view, since another view of the same widget sees this view's update too).
  const themeWrites = globalThis as unknown as Record<PropertyKey, number | undefined>;
  function syncTheme() {
    if (model.get("_theme_explicit")) return;
    const dark = detectHostDark();
    if (model.get("dark_mode") !== dark) {
      themeWrites[THEME_WRITES] = (themeWrites[THEME_WRITES] ?? 0) + 1;
      try {
        model.set("dark_mode", dark);
      } finally {
        themeWrites[THEME_WRITES] = (themeWrites[THEME_WRITES] ?? 1) - 1;
      }
      model.save_changes();
    }
  }
  // Any other change to dark_mode is a choice; it is kept in the model, so later views of the widget respect it too
  function onDarkModeChange() {
    if ((themeWrites[THEME_WRITES] ?? 0) > 0 || model.get("_theme_explicit")) return;
    model.set("_theme_explicit", true);
    model.save_changes();
  }
  syncTheme();

  // data-theme anywhere in the page (any ancestor of the widget may carry it), plus html and body classes and style
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], subtree: true });
  const rootObserver = new MutationObserver(syncTheme);
  for (const node of [document.documentElement, document.body]) {
    if (node) rootObserver.observe(node, { attributes: true, attributeFilter: ["class", "style"] });
  }

  // Also listen for OS-level theme changes
  const colorScheme = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  colorScheme?.addEventListener("change", syncTheme);

  const toolbar = document.createElement("div");
  toolbar.className = "aam-toolbar";
  // Icon buttons like the graph and vector widgets (fixed markup; the icons are constants); SVG and PNG in one menu
  toolbar.innerHTML = `
    <button class="aam-btn aam-btn-icon aam-btn-filter" title="Filter" aria-label="Filter">${ICONS.sidebar}</button>
    <span class="aam-title">ArchiMate Model</span>
    <span class="aam-legend"></span>
    <input type="file" class="aam-file-input" accept=".xml,.archimate" style="display:none">
    <button class="aam-btn aam-btn-icon aam-btn-upload" title="Open an .xml or .archimate file" aria-label="Open a model file">${ICONS.upload}</button>
    <span class="aam-export">
      <button class="aam-btn aam-btn-icon aam-btn-export" title="Export" aria-label="Export" aria-haspopup="menu">${ICONS.download}</button>
      <span class="aam-export-menu" role="menu" hidden>
        <button class="aam-menu-item aam-btn-export-svg" role="menuitem">SVG</button>
        <button class="aam-menu-item aam-btn-export-png" role="menuitem">PNG, 2x</button>
      </span>
    </span>
    <button class="aam-btn aam-btn-icon aam-btn-fit" title="Fit the whole model" aria-label="Fit the whole model">${ICONS.zoomFit}</button>
    <button class="aam-btn aam-btn-icon aam-btn-dark" title="Light or dark" aria-label="Light or dark"></button>
  `;
  // The theme button shows the theme it switches to
  const darkBtn = qs<HTMLElement>(toolbar, ".aam-btn-dark");
  const showThemeIcon = () => { darkBtn.innerHTML = model.get("dark_mode") ? ICONS.sun : ICONS.moon; };
  showThemeIcon();
  // The export menu opens under its button and closes on a choice or a click elsewhere
  const exportMenu = qs<HTMLElement>(toolbar, ".aam-export-menu");
  qs(toolbar, ".aam-btn-export").addEventListener("click", (e) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; });
  exportMenu.addEventListener("click", () => { exportMenu.hidden = true; });
  const closeExportMenu = () => { exportMenu.hidden = true; };
  document.addEventListener("click", closeExportMenu);
  wrapper.appendChild(toolbar);

  const contentArea = document.createElement("div");
  contentArea.className = "aam-content";
  wrapper.appendChild(contentArea);

  let hiddenLayers = new Set(), hiddenElemTypes = new Set(), hiddenRelTypes = new Set(), nestElements = true, nestRelations = true;
  // Containers folded to one box (their relationships attach to it); kept until unfolded
  const folded = new Set<string>();

  const filterPanel = buildFilterPanel(model, (l, e, r, n, b) => {
    hiddenLayers = l; hiddenElemTypes = e; hiddenRelTypes = r; nestElements = n; nestRelations = b; rebuildDiagram();
  });
  // The filter panel starts open when the widget is wide enough to keep the diagram readable beside it
  // (decided on the widget's first real size, below: a host may attach it after render)
  contentArea.appendChild(filterPanel.element);

  const graphContainer = document.createElement("div");
  graphContainer.className = "aam-graph-container";
  contentArea.appendChild(graphContainer);
  // A height given sizes the row of filter panel and diagram (the diagram stretches to it, a long panel scrolls);
  // without one the widget takes the shared rule (size.ts) and the row fills it
  function applySize() {
    const height = Number(model.get("height")) || 0;
    for (const name of ["aspectRatio", "minHeight", "maxHeight", "height"] as const) wrapper.style[name] = "";
    if (height > 0) {
      contentArea.style.height = height + "px";
      wrapper.classList.remove("aam-sized");
    } else {
      contentArea.style.height = "";
      const { aspectRatio, minHeight, maxHeight } = wrapperSize(0, 0);
      Object.assign(wrapper.style, { aspectRatio, minHeight, maxHeight });
      wrapper.classList.add("aam-sized");
    }
  }
  applySize();

  // Details: a panel beside the diagram that opens on a selection and closes when it clears
  const details = document.createElement("div");
  details.className = "aam-details"; details.style.display = "none";
  contentArea.appendChild(details);
  function followSelection() {
    const selected = model.get("selected_element") as ArchiElement | null;
    // show_details false: the host shows the selection itself (undefined, from an older host, shows them)
    if (selected && model.get("show_details") !== false) showDetails(details, selected, () => { model.set("selected_element", null); model.save_changes(); });
    else details.style.display = "none";
  }

  function getFilteredData(): { elements: ArchiElement[]; relationships: ArchiRelationship[] } {
    const ae = modelElements(model), ar = (model.get("relationships") ?? []) as ArchiRelationship[];
    const els = ae.filter((e) => !hiddenLayers.has(e.layer ?? "") && !hiddenElemTypes.has(e.type ?? ""));
    const vis = new Set(els.map((e) => e.id));
    const rels = ar.filter((r) => !hiddenRelTypes.has(r.type ?? "") && vis.has(r.source) && vis.has(r.target));
    return { elements: els, relationships: rels };
  }

  // The fitted viewBox and layout key of the diagram on screen
  let fitView: string | null = null, shownKey: string | null = null;

  // Toolbar legend: the layers in the model, in band order
  function updateLegend() {
    const present = new Set(modelElements(model).map((e) => e.layer ?? ""));
    qs(toolbar, ".aam-legend").replaceChildren(...LAYER_ORDER.filter((l) => present.has(l)).map((layer) => {
      const item = document.createElement("span"); item.className = "aam-legend-item";
      const dot = document.createElement("span"); dot.className = "aam-dot";
      // Drawn like the elements: a ring in the layer hue over 38% of it
      dot.style.background = `color-mix(in srgb, ${LAYER_COLORS[layer].stroke} 38%, var(--aam-toolbar-bg))`; dot.style.borderColor = LAYER_COLORS[layer].stroke;
      item.append(dot, layer);
      return item;
    }));
  }

  function rebuildDiagram() {
    updateLegend();
    const dm = model.get("dark_mode");
    wrapper.classList.toggle("aam-dark", dm);
    const { elements, relationships } = getFilteredData();
    const view = graphContainer.querySelector("svg.aam-svg")?.getAttribute("viewBox");
    const drawn = renderDiagram(graphContainer, elements, relationships, dm, nestElements, folded, nestRelations);
    // A redraw that moves nothing (a theme switch, a status-only update) keeps the zoom and pan; any other refits
    if (drawn && view && drawn.key === shownKey) {
      drawn.svg.setAttribute("viewBox", view);
    } else if (drawn) {
      // A new or moved diagram opens readable (layout.ts openView); Fit shows the whole of it
      const [, , w, h] = drawn.fit.split(" ").map(Number);
      const v = openView(w, h, graphContainer.clientWidth, graphContainer.clientHeight);
      drawn.svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.width} ${v.height}`);
    }
    fitView = drawn?.fit ?? null;
    shownKey = drawn?.key ?? null;

    const allEls = (model.get("elements") ?? []) as ArchiElement[];
    // Lines light up for the hovered element and the selected one (their own and their children's)
    graphContainer.querySelectorAll<HTMLElement>(".aam-node").forEach((node) => {
      node.addEventListener("mouseenter", () => { hovered = node.dataset.id ?? null; lightLines(); });
      node.addEventListener("mouseleave", () => { hovered = null; lightLines(); });
    });
    lightLines();
    // Hovering a shared line marks the elements its relationships join
    graphContainer.querySelectorAll<SVGGElement>(".aam-edge-shared").forEach((line) => {
      const ends = new Set((line.dataset.ends ?? "").split(" "));
      const mark = (on: boolean) => graphContainer.querySelectorAll<HTMLElement>(".aam-node").forEach((node) => {
        node.classList.toggle("aam-member", on && ends.has(node.dataset.id ?? ""));
      });
      line.addEventListener("mouseenter", () => mark(true));
      line.addEventListener("mouseleave", () => mark(false));
    });
    graphContainer.querySelectorAll<SVGGElement>(".aam-fold").forEach((marker) => {
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = marker.dataset.fold ?? "";
        if (folded.has(id)) folded.delete(id); else folded.add(id);
        rebuildDiagram();
      });
    });
    graphContainer.querySelectorAll<HTMLElement>(".aam-node").forEach((node) => {
      node.addEventListener("click", () => {
        const found = allEls.find((e) => e.id === node.dataset.id);
        if (found) { model.set("selected_element", { ...found }); model.save_changes(); followSelection(); applyMarks(); }
      });
    });
    applyMarks();
  }

  // The element whose lines are lit while the pointer is on it
  let hovered: string | null = null;
  function lightLines() {
    const selected = model.get("selected_element") as ArchiElement | null;
    const on = new Set([hovered, selected && selected.id != null ? String(selected.id) : null].filter((v): v is string => Boolean(v)));
    graphContainer.querySelectorAll<SVGElement>("path.aam-edge").forEach((line) => {
      const chain = (line.dataset.chain ?? "").split(" ");
      line.classList.toggle("aam-focus", chain.some((id) => on.has(id)));
    });
  }

  // Outline the selected element (clicked, or set by the host by id) and the host's highlight_ids
  function applyMarks() {
    const selected = model.get("selected_element") as ArchiElement | null;
    const selectedId = selected && selected.id != null ? String(selected.id) : null;
    const marked = highlightIds(model.get("highlight_ids"));
    graphContainer.querySelectorAll<HTMLElement>(".aam-node").forEach((node) => {
      node.classList.toggle("aam-selected", node.dataset.id === selectedId);
      node.classList.toggle("aam-highlight", marked.has(node.dataset.id ?? ""));
    });
  }

  qs(toolbar, ".aam-btn-filter").addEventListener("click", () => filterPanel.element.classList.toggle("aam-panel-open"));
  qs(toolbar, ".aam-btn-fit").addEventListener("click", () => {
    const s = graphContainer.querySelector("svg.aam-svg");
    if (s && fitView) s.setAttribute("viewBox", fitView);
  });
  qs(toolbar, ".aam-btn-dark").addEventListener("click", () => { model.set("dark_mode", !model.get("dark_mode")); model.save_changes(); });

  // Upload
  const fileInput = qs<HTMLInputElement>(toolbar, ".aam-file-input");
  qs(toolbar, ".aam-btn-upload").addEventListener("click", () => { fileInput.value = ""; fileInput.click(); });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { model.set("_upload_xml", reader.result); model.save_changes(); };
    reader.readAsText(file);
  });

  // Export SVG
  qs(toolbar, ".aam-btn-export-svg").addEventListener("click", () => {
    const svg = graphContainer.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // Inline key styles so the SVG is self-contained
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      .aam-node-label { font: 600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .aam-node-type { font: 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .aam-layer-label { font: 700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
    `;
    clone.insertBefore(style, clone.firstChild);
    // Set explicit dimensions from viewBox
    const vb = clone.getAttribute("viewBox");
    if (vb) { const [,,w,h] = vb.split(" "); clone.setAttribute("width", w); clone.setAttribute("height", h); }
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    downloadBlob(blob, "archimate-diagram.svg");
  });

  // Export PNG
  qs(toolbar, ".aam-btn-export-png").addEventListener("click", () => {
    const svg = graphContainer.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      .aam-node-label { font: 600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .aam-node-type { font: 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .aam-layer-label { font: 700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
    `;
    clone.insertBefore(style, clone.firstChild);
    const vb = clone.getAttribute("viewBox");
    let w = 1200, h = 800;
    if (vb) { const parts = vb.split(" "); w = Math.ceil(Number(parts[2]) * 2); h = Math.ceil(Number(parts[3]) * 2); }
    clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h));
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = diagramTheme(graphContainer, Boolean(model.get("dark_mode"))).bg;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => { if (b) downloadBlob(b, "archimate-diagram.png"); }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });

  const listeners: [string, () => void][] = [
    ["change:elements", rebuildDiagram],
    ["change:relationships", rebuildDiagram],
    ["change:dark_mode", rebuildDiagram],
    ["change:dark_mode", onDarkModeChange],
    ["change:selected_element", applyMarks],
    ["change:selected_element", followSelection],
    ["change:show_details", followSelection],
    ["change:selected_element", () => lightLines()],
    ["change:dark_mode", showThemeIcon],
    ["change:highlight_ids", applyMarks],
    ["change:height", () => { applySize(); rebuildDiagram(); }],
  ];
  for (const [event, fn] of listeners) model.on(event, fn);
  rebuildDiagram();

  // The first real size decides the opening: the filter panel opens in a wide widget, and the diagram takes its
  // readable opening view. Now, or when the host attaches the widget later (then a ResizeObserver reports it).
  let opened = false;
  function openOnce(): boolean {
    if (opened || !wrapper.clientWidth) return opened;
    opened = true;
    if (wrapper.clientWidth >= 900) filterPanel.element.classList.add("aam-panel-open");
    const svg = graphContainer.querySelector("svg.aam-svg");
    if (svg && fitView && svg.getAttribute("viewBox") === fitView) {
      const [, , w, h] = fitView.split(" ").map(Number);
      const v = openView(w, h, graphContainer.clientWidth, graphContainer.clientHeight);
      svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.width} ${v.height}`);
    }
    return true;
  }
  const sizeWatch = !openOnce() && typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => { if (openOnce()) sizeWatch?.disconnect(); })
    : null;
  sizeWatch?.observe(wrapper);

  // Once the host removes the widget, stop listening to the model and following the page theme
  return () => {
    for (const [event, fn] of listeners) model.off(event, fn);
    document.removeEventListener("click", closeExportMenu);
    filterPanel.dispose();
    themeObserver.disconnect();
    sizeWatch?.disconnect();
    rootObserver.disconnect();
    colorScheme?.removeEventListener("change", syncTheme);
  };
}

function showDetails(container: HTMLElement, el: ArchiElement, onClose: () => void): void {
  container.style.display = "block";
  // Fixed markup only: model values go in as text, so markup in a name or documentation stays inert
  container.innerHTML = `
    <div class="aam-details-header"><strong></strong><button class="aam-btn aam-btn-icon aam-details-close" title="Close" aria-label="Close">${ICONS.close}</button></div>
    <div class="aam-details-body"></div>`;
  qs(container, ".aam-details-header strong").textContent = el.name ?? "";
  const body = qs(container, ".aam-details-body");
  const row = (label: string, value: Node | string) => {
    const div = document.createElement("div");
    const lbl = document.createElement("span"); lbl.className = "aam-detail-label"; lbl.textContent = `${label}:`;
    div.append(lbl, " ", value);
    body.appendChild(div);
  };
  row("Type", formatType(el.type));
  row("Layer", el.layer ?? "");
  const code = document.createElement("code"); code.textContent = el.id ?? "";
  row("ID", code);
  if (el.documentation) {
    const doc = document.createElement("div"); doc.className = "aam-detail-doc"; doc.textContent = el.documentation;
    body.appendChild(doc);
  }
  qs(container, ".aam-details-close").addEventListener("click", () => { container.style.display = "none"; onClose(); });
}

export default { render };
