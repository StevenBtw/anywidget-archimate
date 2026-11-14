// Mounts the assembled widget module in jsdom with a plain-object model (get, set, on, off, save_changes),
// the way a host without Jupyter does. tests/test_ui.py writes the module and passes its path in
// AAM_WIDGET_MODULE; jsdom comes from `npm ci --prefix tests/js`. On CI both are required; elsewhere the
// tests are skipped without them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { openView } from "../../src/anywidget_archimate/ui/layout.ts";

type JSDOMType = import("jsdom").JSDOM;
let JSDOM: typeof import("jsdom").JSDOM | null = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  // not installed
}
const MODULE = process.env.AAM_WIDGET_MODULE;
const MISSING = !MODULE
  ? "AAM_WIDGET_MODULE is not set (tests/test_ui.py sets it)"
  : !JSDOM
    ? "jsdom is not installed (npm ci --prefix tests/js)"
    : null;
const skip = process.env.CI ? false : (MISSING ?? false);

// 15 elements over three layers, 10 relationships; three are structural within a layer and draw as nesting
// (r1 actor assigned to process, r5 component realizing service, r9 node realizing service)
const ELEMENTS = [
  ["b1", "Customer", "BusinessActor", "Business"],
  ["b2", "Place order", "BusinessProcess", "Business"],
  ["b3", "Sales", "BusinessFunction", "Business"],
  ["b4", "Order received", "BusinessEvent", "Business"],
  ["b5", "Order", "BusinessObject", "Business"],
  ["a1", "Web shop", "ApplicationComponent", "Application"],
  ["a2", "Order API", "ApplicationInterface", "Application"],
  ["a3", "Ordering", "ApplicationService", "Application"],
  ["a4", "Order record", "DataObject", "Application"],
  ["a5", "Billing", "ApplicationComponent", "Application"],
  ["t1", "App server", "Node", "Technology"],
  ["t2", "Database server", "Device", "Technology"],
  ["t3", "PostgreSQL", "SystemSoftware", "Technology"],
  ["t4", "Hosting", "TechnologyService", "Technology"],
  ["t5", "Backup server", "Node", "Technology"],
].map(([id, name, type, layer]: string[]) => ({ id, name, type, layer, documentation: "" }));

const RELATIONSHIPS = [
  ["r1", "b1", "b2", "Assignment"],
  ["r2", "b4", "b2", "Triggering"],
  ["r3", "b2", "b5", "Access"],
  ["r4", "a3", "b2", "Serving"],
  ["r5", "a1", "a3", "Realization"],
  ["r6", "a1", "a5", "Flow"],
  ["r7", "a1", "a4", "Access"],
  ["r8", "t4", "a1", "Serving"],
  ["r9", "t1", "t4", "Realization"],
  ["r10", "t3", "t2", "Association"],
].map(([id, source, target, type]: string[]) => ({ id, source, target, type, name: "" }));

type TestModel = ReturnType<typeof makeModel>;

function makeModel(values: Record<string, unknown> = {}) {
  const state: Record<string, any> = { width: "100%", height: 600, dark_mode: false, selected_element: null, highlight_ids: [], ...values };
  const handlers = new Map<string, (() => void)[]>();
  return {
    get: (key: string) => state[key],
    set(key: string, value: any) {
      const changed = state[key] !== value;
      state[key] = value;
      if (changed) for (const fn of handlers.get(`change:${key}`) ?? []) fn();
    },
    on: (event: string, fn: () => void) => handlers.set(event, [...(handlers.get(event) ?? []), fn]),
    off: (event: string, fn: () => void) => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== fn)),
    save_changes() {},
    send() {},
    listenerCount: () => [...handlers.values()].reduce((n, list) => n + list.length, 0),
  };
}

// Render into #host (the body holds just that unless `body` says otherwise); returns what a test needs
async function mount({ values = {}, body = '<div id="host"></div>', htmlAttrs = "", prefersDark = false }: {
  values?: Record<string, unknown>;
  body?: string;
  htmlAttrs?: string;
  prefersDark?: boolean;
} = {}) {
  if (!JSDOM || !MODULE) assert.fail(MISSING ?? "jsdom or AAM_WIDGET_MODULE missing");
  const dom = new JSDOM(`<!doctype html><html ${htmlAttrs}><body>${body}</body></html>`);
  dom.window.matchMedia = ((query: string) => ({
    matches: prefersDark && query.includes("dark"),
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof dom.window.matchMedia;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver });
  const widget = (await import(pathToFileURL(MODULE as string).href)).default as {
    render: (args: { model: TestModel; el: HTMLElement }) => () => void;
  };
  const model = makeModel({ elements: ELEMENTS, relationships: RELATIONSHIPS, ...values });
  const el = dom.window.document.querySelector("#host") as HTMLElement;
  const cleanup = widget.render({ model, el });
  assert.equal(typeof cleanup, "function", "render returns a cleanup function");
  let cleaned = false;
  const unmount = () => {
    if (!cleaned) cleanup();
    cleaned = true;
  };
  const close = () => {
    unmount();
    dom.window.close();
  };
  return { dom, model, el, unmount, close };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// jsdom has no layout, so map client coordinates 1:1 onto the diagram to let wheel events zoom
function stubScreen(dom: JSDOMType): void {
  const proto = dom.window.SVGSVGElement.prototype as any;
  proto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } });
  proto.getScreenCTM = () => ({ inverse: () => null });
}

// querySelector, but a test that cannot find its node should fail on the spot
// The layers with a band (from their labels' data-layer): sorted by name, or top to bottom with order "y"
function layersShown(root: ParentNode, order: "name" | "y" = "name"): string[] {
  const labels = [...root.querySelectorAll<SVGElement>(".aam-layer-label")]
    .sort((a, b) => Number(a.getAttribute("y")) - Number(b.getAttribute("y")));
  const layers = [...new Set(labels.map((l) => l.getAttribute("data-layer") ?? ""))];
  return order === "y" ? layers : layers.sort();
}

// The top of a layer: its first band label
function layerTop(root: ParentNode, layer: string): number {
  return Math.min(...[...root.querySelectorAll<SVGElement>(`.aam-layer-label[data-layer="${layer}"]`)].map((l) => Number(l.getAttribute("y"))));
}

function q<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`test markup is missing ${selector}`);
  return found;
}

const view = (el: Element): string => q(el, "svg.aam-svg").getAttribute("viewBox") ?? "";
const viewWidth = (el: Element): number => Number(view(el).split(" ")[2]);

// Scroll over the diagram: negative steps zoom in, positive zoom out
function wheel(dom: JSDOMType, el: Element, steps: number): void {
  const svg = q<SVGSVGElement>(el, "svg.aam-svg");
  for (let i = 0; i < Math.abs(steps); i++) {
    svg.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY: Math.sign(steps) * 100, clientX: 100, clientY: 100, cancelable: true }));
  }
}

test("renders every element and relationship of the model", { skip }, async () => {
  const { el, close } = await mount();
  try {
    const ids = [...el.querySelectorAll<HTMLElement>(".aam-node")].map((node) => node.dataset.id).sort();
    assert.deepEqual(ids, ELEMENTS.map((e) => e.id).sort());
    const nested = new Set(["r1", "r5", "r9"]);
    assert.equal(el.querySelectorAll<SVGElement>("path.aam-edge").length, RELATIONSHIPS.length - nested.size);
    // A nested pair: the parent is a container and the child is drawn inside it
    for (const [parent, child] of [["b1", "b2"], ["a1", "a3"], ["t1", "t4"]]) {
      assert.ok(el.querySelector(`.aam-container[data-id="${parent}"]`), `${parent} is a container`);
      assert.ok(el.querySelector(`.aam-nodes .aam-node[data-id="${child}"]`), `${child} is drawn`);
    }
  } finally {
    close();
  }
});

test("comparison status and badges render, and relationships keep their ArchiMate dash", { skip }, async () => {
  const elements = ELEMENTS.map((e) =>
    e.id === "a1" ? { ...e, status: "changed", badge: "2/3" } : e.id === "a5" ? { ...e, status: "only_a", badge: "" } : { ...e, status: "stable", badge: "" },
  );
  const relStatus: Record<string, string> = { r6: "partial", r4: "only_b" };
  const relationships = RELATIONSHIPS.map((r) => ({ ...r, status: relStatus[r.id] ?? "stable" }));
  const { el, close } = await mount({ values: { elements, relationships } });
  try {
    const node = (id: string): HTMLElement => q<HTMLElement>(el, `.aam-node[data-id="${id}"]`);
    assert.ok(node("a1").classList.contains("aam-status-changed"));
    assert.ok(node("a5").classList.contains("aam-status-only-a"));
    assert.doesNotMatch(node("b1").getAttribute("class") ?? "", /aam-status/);
    assert.equal(q(node("a1"), ".aam-node-badge").textContent, "2/3");
    assert.equal(el.querySelectorAll<HTMLElement>(".aam-node-badge").length, 1);

    const partial = el.querySelectorAll<SVGElement>("path.aam-edge.aam-status-partial");
    assert.equal(partial.length, 1);
    assert.equal(partial[0].getAttribute("stroke-dasharray"), "6 4"); // Flow's dash
    assert.equal(partial[0].getAttribute("marker-end"), "url(#arrow-filled)"); // faded, not recolored

    // A recolored relationship (only_b, Serving) ends in an arrowhead of its own color
    const onlyB = q<SVGElement>(el, "path.aam-edge.aam-status-only-b");
    assert.equal(onlyB.getAttribute("marker-end"), "url(#arrow-hollow-only-b)");
    assert.equal(q<SVGElement>(el, "#arrow-hollow-only-b path").getAttribute("stroke"), "#2e9b4f");

    // The comparison styling travels with the SVG, so SVG and PNG exports keep it
    const style = el.querySelector("svg.aam-svg > style");
    assert.ok(style, "the diagram SVG carries its own style element");
    assert.match(style.textContent, /\.aam-status-changed/);
    assert.match(style.textContent, /\.aam-node-badge/);
  } finally {
    close();
  }
});

test("the host can select one element and highlight several", { skip }, async () => {
  const { el, model, close } = await mount();
  try {
    const marked = (cls: string) => [...el.querySelectorAll<HTMLElement>(`.aam-node.${cls}`)].map((n) => n.dataset.id).sort();
    model.set("selected_element", { id: "a2" });
    model.set("highlight_ids", ["t1", "t3"]);
    assert.deepEqual(marked("aam-selected"), ["a2"]);
    assert.deepEqual(marked("aam-highlight"), ["t1", "t3"]);

    model.set("elements", [...ELEMENTS]); // a rebuild keeps the marks
    assert.deepEqual(marked("aam-selected"), ["a2"]);
    assert.deepEqual(marked("aam-highlight"), ["t1", "t3"]);
  } finally {
    close();
  }
});

test("a theme switch or a status-only update keeps the zoom and pan", { skip }, async () => {
  const { dom, el, model, close } = await mount();
  try {
    stubScreen(dom);
    const fitted = view(el);
    wheel(dom, el, -3);
    const zoomed = view(el);
    assert.notEqual(zoomed, fitted);

    model.set("dark_mode", true);
    assert.ok(q<HTMLElement>(el, ".aam-wrapper").classList.contains("aam-dark"));
    assert.equal(view(el), zoomed);

    model.set("elements", ELEMENTS.map((e) => ({ ...e, status: "changed", badge: "2/3" })));
    model.set("relationships", RELATIONSHIPS.map((r) => ({ ...r, status: "partial" })));
    assert.equal(el.querySelectorAll<HTMLElement>(".aam-node.aam-status-changed").length, ELEMENTS.length);
    assert.equal(view(el), zoomed);

    model.set("height", 400);
    assert.equal(view(el), zoomed);
  } finally {
    close();
  }
});

test("the zoom limit holds across a redraw that keeps the view", { skip }, async () => {
  const { dom, el, model, close } = await mount();
  try {
    stubScreen(dom);
    const fittedWidth = viewWidth(el);
    wheel(dom, el, -40);
    model.set("dark_mode", true);
    wheel(dom, el, -40);
    assert.ok(viewWidth(el) >= fittedWidth * 0.1 - 1e-9, `zoomed to ${viewWidth(el)} of ${fittedWidth}`);
  } finally {
    close();
  }
});

test("Fit returns to the whole diagram, and a change that moves elements refits", { skip }, async () => {
  const { dom, el, model, close } = await mount();
  try {
    stubScreen(dom);
    const fitted = view(el);
    wheel(dom, el, -3);
    q<HTMLElement>(el, ".aam-btn-fit").click();
    assert.equal(view(el), fitted);

    wheel(dom, el, 2);
    model.set("elements", ELEMENTS.filter((e) => e.layer !== "Technology"));
    assert.match(view(el), /^0 0 [\d.]+ [\d.]+$/);
    assert.notEqual(view(el), fitted);
  } finally {
    close();
  }
});

test("a container's header band is marked so its status can color it", { skip }, async () => {
  const elements = [
    { id: "p", name: "Web shop", type: "ApplicationComponent", layer: "Application", documentation: "", status: "changed" },
    { id: "c", name: "Cart", type: "ApplicationComponent", layer: "Application", documentation: "" },
  ];
  const relationships = [{ id: "r", source: "p", target: "c", type: "Composition", name: "" }];
  const { el, close } = await mount({ values: { elements, relationships } });
  try {
    const container = q<HTMLElement>(el, '.aam-node.aam-container[data-id="p"]');
    assert.ok(container.classList.contains("aam-status-changed"));
    assert.equal(container.querySelectorAll(".aam-node-header").length, 2);
  } finally {
    close();
  }
});

test("removing the widget detaches it from the model", { skip }, async () => {
  const { el, model, unmount, close } = await mount();
  try {
    assert.ok(model.listenerCount() > 0);
    unmount();
    assert.equal(model.listenerCount(), 0);
    model.set("highlight_ids", ["t1"]); // no longer reaches the removed view
    assert.equal(el.querySelectorAll<HTMLElement>(".aam-highlight").length, 0);
  } finally {
    close();
  }
});

test("an ancestor data-theme other than light or dark does not hide the page's theme", { skip }, async () => {
  const { model, close } = await mount({ htmlAttrs: 'data-theme="dark"', body: '<div data-theme="cupcake"><div id="host"></div></div>' });
  try {
    assert.equal(model.get("dark_mode"), true);
  } finally {
    close();
  }
});

test("the widget follows a theme change on an ancestor, not only on html and body", { skip }, async () => {
  const { dom, model, close } = await mount({ body: '<section id="pane" data-theme="dark"><div id="host"></div></section>' });
  try {
    assert.equal(model.get("dark_mode"), true);
    q<HTMLElement>(dom.window.document, "#pane").dataset.theme = "light";
    await settle();
    assert.equal(model.get("dark_mode"), false);
  } finally {
    close();
  }
});

test("a light class on the page wins over a dark operating system", { skip }, async () => {
  const { model, close } = await mount({ htmlAttrs: 'class="light"', prefersDark: true });
  try {
    assert.equal(model.get("dark_mode"), false);
  } finally {
    close();
  }
});

test("the details panel shows markup in element data as text, not as HTML", { skip }, async () => {
  const hostile = {
    id: "<b>id</b>",
    name: "<img src=x onerror=alert(1)>",
    type: "ApplicationComponent",
    layer: "Application",
    documentation: "<script>bad()</script>",
  };
  const { dom, el, close } = await mount({ values: { elements: [hostile], relationships: [] } });
  try {
    const node = [...el.querySelectorAll<HTMLElement>(".aam-node")].find((n) => n.dataset.id === hostile.id);
    if (!node) assert.fail("node not found");
    node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    const details = q<HTMLElement>(el, ".aam-details");
    assert.equal(details.style.display, "block");
    assert.equal(details.querySelectorAll("img, b, script").length, 0);
    for (const value of [hostile.id, hostile.name, hostile.layer, hostile.documentation]) {
      assert.ok(details.textContent.includes(value), `details text holds ${value} literally`);
    }
  } finally {
    close();
  }
});

test("layer names match in any case; a missing layer comes from the type, and an unknown one is Other", { skip }, async () => {
  const elements = [
    { id: "x1", name: "Web shop", type: "ApplicationComponent", layer: "application", documentation: "" },
    { id: "x2", name: "App server", type: "Node", layer: "TECHNOLOGY", documentation: "" },
    { id: "x3", name: "Growth", type: "Capability", layer: "Strategy", documentation: "" },
    { id: "x4", name: "Loose", type: "Node", documentation: "" },
    { id: "x5", name: "Thing", type: "Gadget", layer: "Nowhere", documentation: "" },
  ];
  const { el, close } = await mount({ values: { elements, relationships: [] } });
  try {
    const ids = [...el.querySelectorAll<HTMLElement>(".aam-node")].map((node) => node.dataset.id).sort();
    assert.deepEqual(ids, ["x1", "x2", "x3", "x4", "x5"]);
    // A missing layer comes from the type (Node is Technology); an unknown layer and type is Other
    assert.deepEqual(layersShown(el), ["Application", "Other", "Strategy", "Technology"]);
  } finally {
    close();
  }
});

test("an element without a type, or with a type that is not text, still draws with the rest", { skip }, async () => {
  const elements = [
    { id: "y1", name: "Web shop", type: "ApplicationComponent", layer: "Application", documentation: "" },
    { id: "y2", name: "No type", layer: "Application", documentation: "" },
    { id: "y3", name: "Numeric type", type: 42, layer: "Business", documentation: "" },
  ];
  const { el, close } = await mount({ values: { elements, relationships: [] } });
  try {
    const ids = [...el.querySelectorAll<HTMLElement>(".aam-node")].map((node) => node.dataset.id).sort();
    assert.deepEqual(ids, ["y1", "y2", "y3"]);
  } finally {
    close();
  }
});

test("the filter panel names a missing type and hides elements by a type that is not text", { skip }, async () => {
  const elements = [
    { id: "z1", name: "Web shop", type: "ApplicationComponent", layer: "Application", documentation: "" },
    { id: "z2", name: "No type", layer: "Application", documentation: "" },
    { id: "z3", name: "Numeric type", type: 42, layer: "Business", documentation: "" },
  ];
  const { el, close } = await mount({ values: { elements, relationships: [] } });
  try {
    const names = [...el.querySelectorAll<HTMLElement>(".aam-filter-item .aam-filter-name")].map((n) => n.textContent);
    assert.ok(!names.includes("undefined"), `no "undefined" entry in ${names}`);
    assert.ok(names.includes("(no type)"));
    const checkbox = (name: string): HTMLInputElement => {
      const item = [...el.querySelectorAll<HTMLElement>(".aam-filter-item")].find((i) => i.querySelector(".aam-filter-name")?.textContent === name);
      if (!item) throw new Error(`no filter item named ${name}`);
      return q<HTMLInputElement>(item, "input");
    };
    checkbox("(no type)").click();
    checkbox("42").click();
    const ids = [...el.querySelectorAll<HTMLElement>(".aam-node")].map((node) => node.dataset.id);
    assert.deepEqual(ids, ["z1"]);
  } finally {
    close();
  }
});

test("layer band labels switch to the brighter layer color in dark mode", { skip }, async () => {
  const { model, el, close } = await mount({ values: { dark_mode: false } });
  try {
    const fill = () => el.querySelector<HTMLElement>('.aam-layer-label[data-layer="Business"]')?.getAttribute("fill");
    assert.equal(fill(), "#555500");
    model.set("dark_mode", true);
    assert.equal(fill(), "#C8C800");
  } finally {
    close();
  }
});

test("a dark_mode passed from Python wins over the page theme and stays when the page changes", { skip }, async () => {
  const { dom, model, el, close } = await mount({
    values: { dark_mode: false, _theme_explicit: true },
    body: '<section id="pane" data-theme="dark"><div id="host"></div></section>',
  });
  try {
    assert.equal(model.get("dark_mode"), false);
    assert.equal(q<HTMLElement>(el, ".aam-wrapper").classList.contains("aam-dark"), false);
    q<HTMLElement>(dom.window.document, "#pane").dataset.theme = "light";
    await settle();
    q<HTMLElement>(dom.window.document, "#pane").dataset.theme = "dark";
    await settle();
    assert.equal(model.get("dark_mode"), false);
  } finally {
    close();
  }
});

test("following the page continues after the widget's own theme updates", { skip }, async () => {
  const { dom, model, close } = await mount({ body: '<section id="pane" data-theme="dark"><div id="host"></div></section>' });
  try {
    const pane = q<HTMLElement>(dom.window.document, "#pane");
    for (const [theme, dark] of [["light", false], ["dark", true], ["light", false]] as [string, boolean][]) {
      pane.dataset.theme = theme;
      await settle();
      assert.equal(model.get("dark_mode"), dark, `follows data-theme="${theme}"`);
    }
    assert.equal(model.get("_theme_explicit"), undefined);
  } finally {
    close();
  }
});

test("a dark_mode the host sets after render stops following the page, also for later views", { skip }, async () => {
  const { dom, model, close } = await mount({ body: '<section id="pane" data-theme="dark"><div id="host"></div></section>' });
  try {
    model.set("dark_mode", false);
    assert.equal(model.get("_theme_explicit"), true);
    const pane = q<HTMLElement>(dom.window.document, "#pane");
    pane.dataset.theme = "light";
    await settle();
    pane.dataset.theme = "dark";
    await settle();
    assert.equal(model.get("dark_mode"), false);
  } finally {
    close();
  }
});

test("two views of one widget both keep following the page", { skip }, async () => {
  const { dom, model, close } = await mount({ htmlAttrs: 'data-theme="dark"' });
  const { default: widget } = await import(pathToFileURL(MODULE as string).href);
  const second = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(second);
  const cleanupSecond = widget.render({ model, el: second });
  try {
    const html = dom.window.document.documentElement;
    for (const [theme, dark] of [["light", false], ["dark", true]] as [string, boolean][]) {
      html.dataset.theme = theme;
      await settle();
      assert.equal(model.get("dark_mode"), dark, `follows data-theme="${theme}"`);
    }
    assert.equal(model.get("_theme_explicit"), undefined);
  } finally {
    cleanupSecond();
    close();
  }
});

test("views from two copies of the module, each with its own model proxy, keep following the page", { skip }, async () => {
  const { dom, model, close } = await mount({ htmlAttrs: 'data-theme="dark"' });
  // A second copy of the module (a cell run again, a reconnect) and a per-view proxy, as anywidget hands each view
  const { default: copy } = await import(`${pathToFileURL(MODULE as string).href}?copy=2`);
  const proxy = { ...model, get: (k: string) => model.get(k), set: (k: string, v: any) => model.set(k, v), on: (e: string, f: () => void) => model.on(e, f), off: (e: string, f: () => void) => model.off(e, f) };
  const second = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(second);
  const cleanupSecond = copy.render({ model: proxy, el: second });
  try {
    const html = dom.window.document.documentElement;
    for (const [theme, dark] of [["light", false], ["dark", true]] as [string, boolean][]) {
      html.dataset.theme = theme;
      await settle();
      assert.equal(model.get("dark_mode"), dark, `follows data-theme="${theme}"`);
    }
    assert.equal(model.get("_theme_explicit"), undefined);
  } finally {
    cleanupSecond();
    close();
  }
});

test("the height sizes the diagram and filter panel row, so a long filter panel scrolls inside it", { skip }, async () => {
  const { model, el, close } = await mount({ values: { height: 300 } });
  try {
    const row = q<HTMLElement>(el, ".aam-content");
    assert.equal(row.style.height, "300px");
    assert.equal(q<HTMLElement>(el, ".aam-graph-container").style.height, "");
    model.set("height", 450);
    assert.equal(row.style.height, "450px");
  } finally {
    close();
  }
});

// Every ArchiMate 3.2 element type and its layer (Physical elements belong to Technology; Junction, Grouping and
// Location to Other)
const ALL_TYPES = {
  Motivation: ["Stakeholder", "Driver", "Assessment", "Goal", "Outcome", "Principle", "Requirement", "Constraint", "Meaning", "Value"],
  Strategy: ["Resource", "Capability", "ValueStream", "CourseOfAction"],
  Business: ["BusinessActor", "BusinessRole", "BusinessCollaboration", "BusinessInterface", "BusinessProcess", "BusinessFunction",
    "BusinessInteraction", "BusinessEvent", "BusinessService", "BusinessObject", "Contract", "Representation", "Product"],
  Application: ["ApplicationComponent", "ApplicationCollaboration", "ApplicationInterface", "ApplicationFunction",
    "ApplicationInteraction", "ApplicationProcess", "ApplicationEvent", "ApplicationService", "DataObject"],
  Technology: ["Node", "Device", "SystemSoftware", "TechnologyCollaboration", "TechnologyInterface", "Path", "CommunicationNetwork",
    "TechnologyFunction", "TechnologyProcess", "TechnologyInteraction", "TechnologyEvent", "TechnologyService", "Artifact",
    "Equipment", "Facility", "DistributionNetwork", "Material"],
  Implementation: ["WorkPackage", "Deliverable", "ImplementationEvent", "Plateau", "Gap"],
  Other: ["Location", "Grouping", "AndJunction", "OrJunction"],
};
const JUNCTIONS = new Set(["AndJunction", "OrJunction", "Junction"]);
const translateOf = (node: Element): number[] => {
  const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(node.getAttribute("transform") ?? "");
  if (!m) throw new Error("node without a translate");
  return m.slice(1).map(Number);
};

test("every ArchiMate 3.2 element type draws in its own layer band, with an icon and a filter badge", { skip }, async () => {
  // No layer given: the widget takes it from the type
  const elements = Object.values(ALL_TYPES).flat().map((type) => ({ id: type, name: type, type, documentation: "" }));
  const { el, close } = await mount({ values: { elements, relationships: [] } });
  try {
    assert.equal(el.querySelectorAll<HTMLElement>(".aam-node").length, elements.length);
    // Bands top to bottom: Motivation, Strategy, Business, Application, Technology, Implementation, Other
    // A layer's bands (by role) start at its first label; layers follow each other top to bottom
    assert.deepEqual(layersShown(el, "y"), Object.keys(ALL_TYPES));
    const top = Object.keys(ALL_TYPES).map((layer) => layerTop(el, layer));
    for (const [i, [layer, types]] of Object.entries(ALL_TYPES).entries()) {
      for (const type of types) {
        const node = q<HTMLElement>(el, `.aam-node[data-id="${type}"]`);
        const y = translateOf(node)[1];
        assert.ok(y > top[i] && (i + 1 === top.length || y < top[i + 1]), `${type} sits in the ${layer} band`);
        if (!JUNCTIONS.has(type)) assert.ok(node.querySelector(".aam-node-icon"), `${type} has an icon`);
      }
    }
    for (const item of el.querySelectorAll<HTMLElement>(".aam-filter-item")) {
      const name = item.querySelector(".aam-filter-name")?.textContent;
      if (!name || name.endsWith(" Layer") || name === "Nest elements" || name === "Nest relationships") continue;
      assert.ok(item.querySelector(".aam-filter-badge")?.textContent, `${name} has a filter badge`);
    }
  } finally {
    close();
  }
});

test("a junction draws as a small dot, filled for And and hollow for Or, and relationships attach to it", { skip }, async () => {
  const elements = [
    { id: "a1", name: "Billing", type: "ApplicationComponent", layer: "Application", documentation: "" },
    { id: "j1", name: "", type: "AndJunction", layer: "Other", documentation: "" },
    { id: "j2", name: "", type: "OrJunction", layer: "Other", documentation: "" },
    { id: "a2", name: "Shipping", type: "ApplicationComponent", layer: "Application", documentation: "" },
  ];
  const relationships = [
    { id: "r1", source: "a1", target: "j1", type: "Triggering", name: "" },
    { id: "r2", source: "j1", target: "a2", type: "Triggering", name: "" },
  ];
  const { el, close } = await mount({ values: { elements, relationships } });
  try {
    const and = q<HTMLElement>(el, '.aam-junction[data-id="j1"]'), or = q<HTMLElement>(el, '.aam-junction[data-id="j2"]');
    assert.ok(and && or, "both junctions are drawn as junctions");
    assert.equal(and.querySelector("rect"), null);
    assert.notEqual(q<SVGCircleElement>(and, "circle").getAttribute("fill"), "none");
    assert.equal(q<SVGCircleElement>(or, "circle").getAttribute("fill"), "none");
    assert.ok(Number(q<SVGCircleElement>(and, "circle").getAttribute("r")) <= 8);
    // Both relationships end within a few pixels of the dot's center
    const [cx, cy] = translateOf(and);
    const ends = [...el.querySelectorAll<SVGElement>(".aam-edge")].map((path) => {
      const nums = (path.getAttribute("d") ?? "").match(/-?[\d.]+/g);
      if (!nums) throw new Error("edge without a path");
      return nums.map(Number);
    });
    const touches = ends.filter((n) => [[n[0], n[1]], [n.at(-2), n.at(-1)]].some(([x = 0, y = 0]) => Math.hypot(x - cx, y - cy) <= 10));
    assert.equal(touches.length, 2);
  } finally {
    close();
  }
});

test("the toolbar legend lists the layers in the model, in band order", { skip }, async () => {
  const { model, el, close } = await mount();
  try {
    const legend = () => [...el.querySelectorAll<HTMLElement>(".aam-legend-item")].map((item) => item.textContent);
    assert.deepEqual(legend(), ["Business", "Application", "Technology"]);
    model.set("elements", [
      { id: "g", name: "Grow", type: "Goal", documentation: "" },
      { id: "c", name: "Sell", type: "Capability", documentation: "" },
    ]);
    assert.deepEqual(legend(), ["Motivation", "Strategy"]);
  } finally {
    close();
  }
});

test("layer aliases: Implementation & Migration and Physical", { skip }, async () => {
  const elements = [
    { id: "w1", name: "Upgrade", type: "WorkPackage", layer: "Implementation & Migration", documentation: "" },
    { id: "w2", name: "Rollout", type: "Deliverable", layer: "implementation_migration", documentation: "" },
    { id: "e1", name: "Robot", type: "Equipment", layer: "Physical", documentation: "" },
  ];
  const { el, close } = await mount({ values: { elements, relationships: [] } });
  try {
    assert.deepEqual(layersShown(el), ["Implementation", "Technology"]);
  } finally {
    close();
  }
});

test("a junction sits in the band of the elements it joins", { skip }, async () => {
  const elements = [
    { id: "p1", name: "Order", type: "BusinessProcess", documentation: "" },
    { id: "p2", name: "Pack", type: "BusinessProcess", documentation: "" },
    { id: "p3", name: "Ship", type: "BusinessProcess", documentation: "" },
    { id: "a1", name: "Shop", type: "ApplicationComponent", documentation: "" },
    { id: "j", name: "", type: "AndJunction", documentation: "" },
  ];
  const relationships = [
    { id: "r1", source: "p1", target: "j", type: "Triggering", name: "" },
    { id: "r2", source: "j", target: "p2", type: "Triggering", name: "" },
    { id: "r3", source: "j", target: "p3", type: "Triggering", name: "" },
    { id: "r4", source: "a1", target: "j", type: "Serving", name: "" },
  ];
  const { el, close } = await mount({ values: { elements, relationships } });
  try {
    assert.deepEqual(layersShown(el), ["Application", "Business"]);
    const businessTop = layerTop(el, "Business");
    const applicationTop = layerTop(el, "Application");
    const y = translateOf(q<HTMLElement>(el, '.aam-junction[data-id="j"]'))[1];
    assert.ok(y > businessTop && y < applicationTop, "the junction is in the Business band");
  } finally {
    close();
  }
});

test("with no height the widget takes the shared size rule; the diagram row then fills it", { skip }, async () => {
  const { el, close } = await mount({ values: { height: 0 } });
  try {
    const wrapper = q<HTMLElement>(el, ".aam-wrapper");
    assert.equal(wrapper.style.aspectRatio, "16 / 10");
    assert.equal(wrapper.style.minHeight, "360px");
    assert.equal(wrapper.style.maxHeight, "80vh");
    assert.equal(q<HTMLElement>(el, ".aam-content").style.height, "");
  } finally {
    close();
  }
});

test("details are a panel beside the diagram that follows the selection", { skip }, async () => {
  const { model, dom, el, close } = await mount({ values: { elements: ELEMENTS, relationships: RELATIONSHIPS } });
  try {
    const details = q<HTMLElement>(el, ".aam-details");
    assert.equal(details.parentElement, q<HTMLElement>(el, ".aam-content"), "inside the diagram row, not below it");
    assert.equal(details.style.display, "none");
    const node = el.querySelector<HTMLElement>(".aam-node")!;
    node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.equal(details.style.display, "block");
    model.set("selected_element", null);
    assert.equal(details.style.display, "none", "closes when the selection clears");
    model.set("selected_element", { ...ELEMENTS[0] });
    assert.equal(details.style.display, "block", "opens for a selection the host makes");
  } finally {
    close();
  }
});

test("SVG and PNG export sit in one menu behind an export button", { skip }, async () => {
  const { el, close } = await mount();
  try {
    const menu = q<HTMLElement>(el, ".aam-export-menu");
    assert.ok(menu.querySelector(".aam-btn-export-svg") && menu.querySelector(".aam-btn-export-png"));
    assert.equal(menu.hidden, true);
    q<HTMLElement>(el, ".aam-btn-export").click();
    assert.equal(menu.hidden, false);
  } finally {
    close();
  }
});

test("the toolbar is icon buttons with names for screen readers, no text glyphs", { skip }, async () => {
  const { el, close } = await mount();
  try {
    for (const cls of ["filter", "upload", "export", "fit", "dark"]) {
      const btn = q<HTMLElement>(el, `.aam-btn-${cls}`);
      assert.ok(btn.querySelector("svg"), `${cls} has an icon`);
      assert.equal(btn.textContent?.trim(), "", `${cls} has no text glyph`);
      assert.ok(btn.getAttribute("aria-label"), `${cls} has a name`);
    }
  } finally {
    close();
  }
});

// A component whose three interfaces all serve one function: one line at the component when relationships nest
const SHARED_ELEMENTS = [
  { id: "c", name: "Shop", type: "ApplicationComponent", layer: "Application", documentation: "" },
  { id: "i0", name: "REST", type: "ApplicationInterface", layer: "Application", documentation: "" },
  { id: "i1", name: "Web", type: "ApplicationInterface", layer: "Application", documentation: "" },
  { id: "i2", name: "Admin", type: "ApplicationInterface", layer: "Application", documentation: "" },
  { id: "x", name: "Sales", type: "BusinessFunction", layer: "Business", documentation: "" },
];
const SHARED_RELATIONSHIPS = [
  ...[0, 1, 2].map((i) => ({ id: `n${i}`, source: "c", target: `i${i}`, type: "Composition", name: "" })),
  ...[0, 1, 2].map((i) => ({ id: `s${i}`, source: `i${i}`, target: "x", type: "Serving", name: "" })),
];

test("relationships the children share are one line at the container; Nest relationships off draws each", { skip }, async () => {
  const { dom, el, close } = await mount({ values: { elements: SHARED_ELEMENTS, relationships: SHARED_RELATIONSHIPS } });
  try {
    assert.equal(el.querySelectorAll("path.aam-edge").length, 1);
    const toggle = [...el.querySelectorAll<HTMLElement>(".aam-filter-nest-toggle")].find((item) => item.textContent?.includes("Nest relationships"));
    const box = toggle?.querySelector<HTMLInputElement>("input");
    assert.ok(box && box.checked, "the Nest relationships toggle is on by default");
    box.checked = false;
    box.dispatchEvent(new dom.window.Event("change"));
    assert.equal(el.querySelectorAll("path.aam-edge").length, 3);
  } finally {
    close();
  }
});

test("hovering a shared line marks the elements it stands for and names the relationships", { skip }, async () => {
  const { dom, el, close } = await mount({ values: { elements: SHARED_ELEMENTS, relationships: SHARED_RELATIONSHIPS } });
  try {
    const line = q<SVGGElement>(el, ".aam-edge-shared");
    assert.match(line.querySelector("title")?.textContent ?? "", /3 Serving relationships/);
    line.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
    const marked = [...el.querySelectorAll<HTMLElement>(".aam-node.aam-member")].map((n) => n.dataset.id).sort();
    assert.deepEqual(marked, ["i0", "i1", "i2", "x"]);
    line.dispatchEvent(new dom.window.MouseEvent("mouseleave"));
    assert.equal(el.querySelectorAll(".aam-node.aam-member").length, 0);
  } finally {
    close();
  }
});

test("lines are quiet until an element is hovered or selected; then its own lines (and its children's) light up", { skip }, async () => {
  const { model, dom, el, close } = await mount({ values: { elements: SHARED_ELEMENTS, relationships: SHARED_RELATIONSHIPS } });
  try {
    assert.ok(q<SVGElement>(el, "svg.aam-svg").classList.contains("aam-lines-quiet"));
    const lit = () => el.querySelectorAll("path.aam-edge.aam-focus").length;
    assert.equal(lit(), 0);
    // The component's line (shared by its interfaces) lights up when the component is hovered
    const comp = q<HTMLElement>(el, '.aam-node[data-id="c"]');
    comp.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
    assert.equal(lit(), 1);
    comp.dispatchEvent(new dom.window.MouseEvent("mouseleave"));
    assert.equal(lit(), 0);
    // ... and when an interface it stands for is hovered or selected
    const child = q<HTMLElement>(el, '.aam-node[data-id="i0"]');
    child.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
    assert.equal(lit(), 1, "the interface's relationship is the shared line");
    child.dispatchEvent(new dom.window.MouseEvent("mouseleave"));
    model.set("selected_element", { id: "i1" });
    assert.equal(lit(), 1, "selecting an interface lights the shared line");
    model.set("selected_element", null);
    assert.equal(lit(), 0);
    // With relationships not nested, hovering the container lights its children's lines too
    const toggle = [...el.querySelectorAll<HTMLElement>(".aam-filter-nest-toggle")].find((i) => i.textContent?.includes("Nest relationships"))!;
    const box = toggle.querySelector<HTMLInputElement>("input")!;
    box.checked = false;
    box.dispatchEvent(new dom.window.Event("change"));
    q<HTMLElement>(el, '.aam-node[data-id="c"]').dispatchEvent(new dom.window.MouseEvent("mouseenter"));
    assert.equal(lit(), 3);
    q<HTMLElement>(el, '.aam-node[data-id="c"]').dispatchEvent(new dom.window.MouseEvent("mouseleave"));
    // A selection keeps its lines lit
    model.set("selected_element", { ...SHARED_ELEMENTS[4] });
    assert.equal(lit(), 3, "the function x has three lines");
    model.set("selected_element", null);
    assert.equal(lit(), 0);
  } finally {
    close();
  }
});

test("an empty widget says how to fill it, in the words the other widgets use", { skip }, async () => {
  const { el, close } = await mount({ values: { elements: [], relationships: [] } });
  try {
    assert.equal(q<HTMLElement>(el, ".aam-empty").textContent,
      "Nothing to show yet. Open a model file, or use .load_xml(path) or ArchiMate.from_xml(path) in Python.");
  } finally {
    close();
  }
});

test("a host selection by id alone shows the model's element, also when it was made before the widget was shown", { skip }, async () => {
  const { model, el, close } = await mount({ values: { elements: ELEMENTS, relationships: RELATIONSHIPS, selected_element: { id: "a1" } } });
  try {
    const details = q<HTMLElement>(el, ".aam-details");
    assert.equal(details.style.display, "block", "open on mount");
    assert.equal(q<HTMLElement>(details, ".aam-details-header strong").textContent, "Web shop");
    model.set("selected_element", { id: "t3" });
    assert.equal(q<HTMLElement>(details, ".aam-details-header strong").textContent, "PostgreSQL");
  } finally {
    close();
  }
});

test("a fold marker is a button for the keyboard: Enter folds, Space unfolds", { skip }, async () => {
  const { dom, el, close } = await mount({ values: { elements: SHARED_ELEMENTS, relationships: SHARED_RELATIONSHIPS } });
  try {
    const marker = () => q<SVGGElement>(el, '.aam-fold[data-fold="c"]');
    assert.equal(marker().getAttribute("role"), "button");
    assert.equal(marker().getAttribute("tabindex"), "0");
    assert.equal(marker().getAttribute("aria-label"), "Fold Shop");
    marker().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(el.querySelector('.aam-node[data-id="i0"]'), null, "folded: the children are not drawn");
    assert.equal(marker().getAttribute("aria-label"), "Unfold Shop");
    assert.equal(dom.window.document.activeElement, marker(), "the keyboard stays on the marker");
    marker().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
    assert.ok(el.querySelector('.aam-node[data-id="i0"]'), "unfolded again");
  } finally {
    close();
  }
});

test("show_details false: a selection still reaches the host, the widget's own details stay closed", { skip }, async () => {
  const { model, dom, el, close } = await mount({ values: { elements: ELEMENTS, relationships: RELATIONSHIPS, show_details: false } });
  try {
    const node = el.querySelector<HTMLElement>('.aam-nodes .aam-node[data-id="b4"]')!;
    node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.equal((model.get("selected_element") as { id: string } | null)?.id, "b4");
    assert.equal(q<HTMLElement>(el, ".aam-details").style.display, "none");
  } finally {
    close();
  }
});

test("arrowheads are drawn in the line colour, hollow ones filled with the canvas, in both themes", { skip }, async () => {
  for (const dark of [false, true]) {
    const { el, close } = await mount({ values: { elements: ELEMENTS, relationships: RELATIONSHIPS, dark_mode: dark, _theme_explicit: true } });
    try {
      const line = q<SVGElement>(el, "path.aam-edge").getAttribute("stroke");
      const marker = (id: string) => q<SVGElement>(el, `marker#${id} path`);
      assert.equal(marker("arrow-filled").getAttribute("fill"), line, "a filled head in the line's colour");
      assert.equal(marker("arrow-hollow").getAttribute("stroke"), line);
      assert.notEqual(marker("arrow-hollow").getAttribute("fill"), "#fff", "no white blob on a dark canvas");
      assert.equal(marker("arrow-hollow").getAttribute("fill"), dark ? "#161a19" : "#ffffff");
    } finally {
      close();
    }
  }
});

test("a widget attached after render decides its opening view and filter on its first real size", { skip }, async () => {
  const callbacks: (() => void)[] = [];
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver = class { constructor(cb: () => void) { callbacks.push(cb); } observe() {} disconnect() {} };
  const { dom, el, close } = await mount();
  try {
    const panel = q<HTMLElement>(el, ".aam-filter-panel");
    assert.equal(panel.classList.contains("aam-panel-open"), false, "no size yet: closed");
    const svg = q<SVGElement>(el, "svg.aam-svg");
    const before = svg.getAttribute("viewBox") ?? "";
    // The host puts the widget on the page: it gets a size, wide but too low to read the whole diagram fitted
    for (const prop of ["clientWidth", "clientHeight"]) {
      Object.defineProperty(dom.window.HTMLElement.prototype, prop, { configurable: true, get() { return prop === "clientWidth" ? 1200 : 120; } });
    }
    callbacks.forEach((cb) => cb());
    assert.equal(panel.classList.contains("aam-panel-open"), true, "wide enough: the filter opens");
    const [, , w, h] = before.split(" ").map(Number);
    const v = openView(w, h, 1200, 120);
    assert.notEqual(`${v.x} ${v.y} ${v.width} ${v.height}`, before, "this size needs an opening view other than the fit");
    assert.equal(svg.getAttribute("viewBox"), `${v.x} ${v.y} ${v.width} ${v.height}`, "the diagram opens readable, from the top");
  } finally {
    delete g.ResizeObserver;
    close();
  }
});
