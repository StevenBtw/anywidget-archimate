// Mounts the assembled widget module in jsdom with a plain-object model (get, set, on, off, save_changes),
// the way a host without Jupyter does. tests/test_ui.py writes the module and passes its path in
// AAM_WIDGET_MODULE; jsdom comes from `npm ci --prefix tests/js`. On CI both are required; elsewhere the
// tests are skipped without them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

let JSDOM = null;
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

// 15 elements over three layers, 10 relationships (no Composition or Aggregation, so nothing nests)
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
].map(([id, name, type, layer]) => ({ id, name, type, layer, documentation: "" }));

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
].map(([id, source, target, type]) => ({ id, source, target, type, name: "" }));

function makeModel(values) {
  const state = { width: "100%", height: 600, dark_mode: false, selected_element: null, highlight_ids: [], ...values };
  const handlers = new Map();
  return {
    get: (key) => state[key],
    set(key, value) {
      const changed = state[key] !== value;
      state[key] = value;
      if (changed) for (const fn of handlers.get(`change:${key}`) ?? []) fn();
    },
    on: (event, fn) => handlers.set(event, [...(handlers.get(event) ?? []), fn]),
    off: (event, fn) => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== fn)),
    save_changes() {},
    send() {},
    listenerCount: () => [...handlers.values()].reduce((n, list) => n + list.length, 0),
  };
}

// Render into #host (the body holds just that unless `body` says otherwise); returns what a test needs
async function mount({ values = {}, body = '<div id="host"></div>', htmlAttrs = "", prefersDark = false } = {}) {
  assert.equal(MISSING, null, MISSING);
  const dom = new JSDOM(`<!doctype html><html ${htmlAttrs}><body>${body}</body></html>`);
  dom.window.matchMedia = (query) => ({ matches: prefersDark && query.includes("dark"), addEventListener() {}, removeEventListener() {} });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver });
  const { default: widget } = await import(pathToFileURL(MODULE).href);
  const model = makeModel({ elements: ELEMENTS, relationships: RELATIONSHIPS, ...values });
  const el = dom.window.document.querySelector("#host");
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

test("renders every element and relationship of the model", { skip }, async () => {
  const { el, close } = await mount();
  try {
    const ids = [...el.querySelectorAll(".aam-node")].map((node) => node.dataset.id).sort();
    assert.deepEqual(ids, ELEMENTS.map((e) => e.id).sort());
    assert.equal(el.querySelectorAll("path.aam-edge").length, RELATIONSHIPS.length);
  } finally {
    close();
  }
});

test("comparison status and badges render, and relationships keep their ArchiMate dash", { skip }, async () => {
  const elements = ELEMENTS.map((e) =>
    e.id === "a1" ? { ...e, status: "changed", badge: "2/3" } : e.id === "a5" ? { ...e, status: "only_a", badge: "" } : { ...e, status: "stable", badge: "" },
  );
  const relStatus = { r6: "partial", r4: "only_b" };
  const relationships = RELATIONSHIPS.map((r) => ({ ...r, status: relStatus[r.id] ?? "stable" }));
  const { el, close } = await mount({ values: { elements, relationships } });
  try {
    const node = (id) => el.querySelector(`.aam-node[data-id="${id}"]`);
    assert.ok(node("a1").classList.contains("aam-status-changed"));
    assert.ok(node("a5").classList.contains("aam-status-only-a"));
    assert.doesNotMatch(node("b1").getAttribute("class"), /aam-status/);
    assert.equal(node("a1").querySelector(".aam-node-badge").textContent, "2/3");
    assert.equal(el.querySelectorAll(".aam-node-badge").length, 1);

    const partial = el.querySelectorAll("path.aam-edge.aam-status-partial");
    assert.equal(partial.length, 1);
    assert.equal(partial[0].getAttribute("stroke-dasharray"), "6 4"); // Flow's dash
    assert.equal(partial[0].getAttribute("marker-end"), "url(#arrow-filled)"); // faded, not recolored

    // A recolored relationship (only_b, Serving) ends in an arrowhead of its own color
    const onlyB = el.querySelector("path.aam-edge.aam-status-only-b");
    assert.equal(onlyB.getAttribute("marker-end"), "url(#arrow-hollow-only-b)");
    assert.equal(el.querySelector("#arrow-hollow-only-b path").getAttribute("stroke"), "#2e9b4f");

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
    const marked = (cls) => [...el.querySelectorAll(`.aam-node.${cls}`)].map((n) => n.dataset.id).sort();
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

test("a container's header band is marked so its status can color it", { skip }, async () => {
  const elements = [
    { id: "p", name: "Web shop", type: "ApplicationComponent", layer: "Application", documentation: "", status: "changed" },
    { id: "c", name: "Cart", type: "ApplicationComponent", layer: "Application", documentation: "" },
  ];
  const relationships = [{ id: "r", source: "p", target: "c", type: "Composition", name: "" }];
  const { el, close } = await mount({ values: { elements, relationships } });
  try {
    const container = el.querySelector('.aam-node.aam-container[data-id="p"]');
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
    assert.equal(el.querySelectorAll(".aam-highlight").length, 0);
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
    dom.window.document.querySelector("#pane").dataset.theme = "light";
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
