// The layered layout (src/anywidget_archimate/ui/layout.ts): nesting rules, nothing overlaps, children inside their
// parents, bands by role, orthogonal lines that never cross an element, folding. Run through
// tests/test_ui.py::test_javascript (or node --test tests/js/layout.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";

import { layeredLayout, nestingTree, roleOf, type Box, type LayeredLayout } from "../../src/anywidget_archimate/ui/layout.ts";
import type { ArchiElement, ArchiRelationship } from "../../src/anywidget_archimate/ui/types.ts";

const LAYERS = ["Motivation", "Strategy", "Business", "Application", "Technology", "Implementation", "Other"];
const sizeOf = (el: ArchiElement) => (/Junction$/.test(String(el.type)) ? { width: 12, height: 12 } : { width: 160, height: 50 });

/** A model shaped like a generated microservices model: three nesting levels, cross-layer realizations, data. */
function model(services = 4) {
  const els: ArchiElement[] = [];
  const rels: ArchiRelationship[] = [];
  let n = 0;
  const el = (id: string, type: string, layer: string) => els.push({ id, name: id, type, layer });
  const rel = (source: string, target: string, type: string) => rels.push({ id: `r${n++}`, source, target, type });
  el("customer", "BusinessActor", "Business");
  el("handling", "BusinessFunction", "Business");
  el("policy", "BusinessObject", "Business");
  rel("customer", "handling", "Assignment");
  el("node", "Node", "Technology");
  el("jvm", "SystemSoftware", "Technology");
  rel("node", "jvm", "Composition");
  for (let i = 0; i < services; i++) {
    const c = `comp${i}`;
    el(c, "ApplicationComponent", "Application");
    el(`${c}.api`, "ApplicationInterface", "Application");
    rel(c, `${c}.api`, "Composition");
    for (let j = 0; j < 3; j++) {
      el(`${c}.api.t${j}`, "ApplicationInterface", "Application");
      rel(`${c}.api`, `${c}.api.t${j}`, "Composition");
    }
    el(`${c}.svc`, "ApplicationService", "Application");
    rel(c, `${c}.svc`, "Realization");
    el(`${c}.fn`, "ApplicationFunction", "Application");
    rel(c, `${c}.fn`, "Assignment");
    el(`${c}.data`, "DataObject", "Application");
    rel(c, `${c}.data`, "Access");
    rel(`${c}.data`, "policy", "Realization"); // cross-layer: a line
    rel(`${c}.svc`, "handling", "Serving");
    el(`${c}.jar`, "Artifact", "Technology");
    rel("node", `${c}.jar`, "Assignment");
    rel(`${c}.jar`, c, "Realization"); // cross-layer: a line
    rel("jvm", c, "Serving");
    if (i) rel(`comp${i - 1}`, c, "Flow");
  }
  return { els, rels };
}

const layout = (m = model(), collapsed?: Set<string>) =>
  layeredLayout(m.els, m.rels, { nest: true, collapsed, layerOrder: LAYERS, sizeOf });

const boxOf = (l: LayeredLayout, id: string): Box => {
  const n = l.nodes.get(id)!;
  return { x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height };
};
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("structural relationships within a layer nest; across layers they stay lines", () => {
  const { els, rels } = model(1);
  const { parent, nested } = nestingTree(els, rels);
  assert.equal(parent.get("comp0.api"), "comp0", "composition");
  assert.equal(parent.get("comp0.api.t0"), "comp0.api", "composition, a level deeper");
  assert.equal(parent.get("comp0.fn"), "comp0", "assignment");
  assert.equal(parent.get("comp0.svc"), "comp0", "realization");
  assert.equal(parent.get("comp0.jar"), "node", "assignment in technology");
  assert.equal(parent.get("comp0"), undefined, "an artifact realizing a component is cross-layer");
  assert.equal(parent.get("policy"), undefined);
  const crossLayer = rels.find((r) => r.source === "comp0.jar" && r.target === "comp0")!;
  assert.ok(!nested.has(crossLayer.id));
});

test("an element nests in one parent, composition first, and never in its own descendant", () => {
  const els: ArchiElement[] = [
    { id: "a", type: "ApplicationComponent", layer: "Application" },
    { id: "b", type: "ApplicationComponent", layer: "Application" },
    { id: "s", type: "ApplicationService", layer: "Application" },
  ];
  const rels: ArchiRelationship[] = [
    { id: "r1", source: "b", target: "s", type: "Realization" },
    { id: "r2", source: "a", target: "s", type: "Composition" },
    { id: "r3", source: "a", target: "b", type: "Composition" },
    { id: "r4", source: "b", target: "a", type: "Aggregation" },
  ];
  const { parent, nested } = nestingTree(els, rels);
  assert.equal(parent.get("s"), "a", "composition wins over realization");
  assert.equal(parent.get("b"), "a");
  assert.equal(parent.get("a"), undefined, "no cycle");
  assert.ok(!nested.has("r1") && !nested.has("r4"), "the other relationships stay lines");
});

test("nothing overlaps: siblings and top-level elements keep apart, children sit inside their parents", () => {
  const l = layout(model(6));
  const ids = [...l.nodes.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = l.nodes.get(ids[i])!, b = l.nodes.get(ids[j])!;
      if (a.parent === b.parent) assert.ok(!overlap(boxOf(l, ids[i]), boxOf(l, ids[j])), `${ids[i]} overlaps ${ids[j]}`);
    }
    const n = l.nodes.get(ids[i])!;
    if (n.parent) {
      const c = boxOf(l, ids[i]), p = boxOf(l, n.parent);
      assert.ok(c.x >= p.x && c.y >= p.y + 20 && c.x + c.width <= p.x + p.width && c.y + c.height <= p.y + p.height,
        `${ids[i]} inside ${n.parent}, below its header`);
    }
  }
});

test("bands by role: services and interfaces above the applications; inside a container they take the top row", () => {
  assert.equal(roleOf("ApplicationService", "Application"), "external");
  assert.equal(roleOf("BusinessActor", "Business"), "actors");
  assert.equal(roleOf("ApplicationComponent", "Application"), "internal");
  const els: ArchiElement[] = [
    { id: "svc", type: "ApplicationService", layer: "Application" },
    { id: "comp", type: "ApplicationComponent", layer: "Application" },
    { id: "fn", type: "ApplicationFunction", layer: "Application" },
    { id: "api", type: "ApplicationInterface", layer: "Application" },
  ];
  const rels: ArchiRelationship[] = [
    { id: "r1", source: "comp", target: "fn", type: "Assignment" },
    { id: "r2", source: "comp", target: "api", type: "Composition" },
    { id: "r3", source: "svc", target: "comp", type: "Serving" },
  ];
  const l = layeredLayout(els, rels, { nest: true, layerOrder: LAYERS, sizeOf });
  assert.ok(l.nodes.get("svc")!.y < l.nodes.get("comp")!.y, "the service band is above the applications band");
  assert.ok(l.nodes.get("api")!.y < l.nodes.get("fn")!.y, "the interface above the function inside the component");
  assert.deepEqual(l.bands.map((b) => b.label), ["Application services and interfaces", "Applications and data"]);
});

test("lines are orthogonal, nested relationships draw no line, and no line crosses an element it does not belong to", () => {
  const m = model(6);
  const l = layout(m);
  const drawn = new Set(l.edges.map((e) => e.relationship.id));
  for (const id of l.nested) assert.ok(!drawn.has(id), `nested ${id} is not drawn`);
  const chain = (id: string) => { const ids = [id]; for (let q = l.nodes.get(id)!.parent; q; q = l.nodes.get(q)!.parent) ids.push(q); return ids; };
  for (const e of l.edges) {
    const { source, target } = e;
    // A line may run inside its own ends and the containers around them, never across any other element
    const own = new Set([...chain(source), ...chain(target)]);
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1], b = e.points[i];
      assert.ok(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, `orthogonal segment in ${e.relationship.id}`);
      const seg: Box = { x: Math.min(a.x, b.x) + 0.5, y: Math.min(a.y, b.y) + 0.5, width: Math.max(Math.abs(a.x - b.x) - 1, 0.01), height: Math.max(Math.abs(a.y - b.y) - 1, 0.01) };
      for (const [id] of l.nodes) {
        if (own.has(id)) continue;
        assert.ok(!overlap(seg, boxOf(l, id)), `${e.relationship.type} ${source} -> ${target} crosses ${id}`);
      }
    }
  }
});

test("a folded container is one box: its children are not drawn and their lines attach to it, once per type", () => {
  const m = model(3);
  const l = layout(m, new Set(["comp1"]));
  for (const id of ["comp1.api", "comp1.api.t0", "comp1.svc", "comp1.fn"]) assert.ok(!l.nodes.has(id), `${id} hidden`);
  const c = l.nodes.get("comp1")!;
  assert.equal(c.collapsed, true);
  assert.equal(c.hidden, 6);
  assert.equal(c.width, 160);
  const serving = l.edges.filter((e) => e.lifted && e.relationship.type === "Serving");
  assert.equal(serving.length, 1, "comp1.svc serving handling, lifted to comp1");
  assert.ok(l.edges.every((e) => e.points.length >= 2));
});

test("a large model keeps a landscape shape instead of one tall column", () => {
  const l = layout(model(10));
  const ratio = l.width / l.height;
  assert.ok(ratio > 0.7 && ratio < 3.2, `width / height ${ratio.toFixed(2)}`);
});

test("open view: the whole diagram when it is readable, else readable from the top, centred", async () => {
  const { openView, READABLE_SCALE } = await import("../../src/anywidget_archimate/ui/layout.ts");
  assert.equal(READABLE_SCALE, 0.9);
  // Fits at scale 1 (1000x600 in a 1000x600 box): the whole diagram
  assert.deepEqual(openView(1000, 600, 1000, 600), { x: 0, y: 0, width: 1000, height: 600 });
  // 3000x2000 in 900x600 fits at 0.3: open at 0.9, from the top, centred across
  const v = openView(3000, 2000, 900, 600);
  assert.equal(v.width, 1000);
  assert.equal(v.height, 600 / 0.9);
  assert.equal(v.y, 0);
  assert.equal(v.x, 1000);
  // No box yet (not laid out on the page): the whole diagram
  assert.deepEqual(openView(3000, 2000, 0, 0), { x: 0, y: 0, width: 3000, height: 2000 });
});

// A component with three interfaces, and an outside element related to some of them
function shared(served: number, bundle = true) {
  const els: ArchiElement[] = [
    { id: "c", type: "ApplicationComponent", layer: "Application" },
    { id: "i0", type: "ApplicationInterface", layer: "Application" },
    { id: "i1", type: "ApplicationInterface", layer: "Application" },
    { id: "i2", type: "ApplicationInterface", layer: "Application" },
    { id: "x", type: "BusinessFunction", layer: "Business" },
  ];
  const rels: ArchiRelationship[] = [0, 1, 2].map((i) => ({ id: `n${i}`, source: "c", target: `i${i}`, type: "Composition" }));
  for (let i = 0; i < served; i++) rels.push({ id: `s${i}`, source: `i${i}`, target: "x", type: "Serving" });
  return layeredLayout(els, rels, { nest: true, bundle, layerOrder: LAYERS, sizeOf });
}

test("when more than half of a container's children share a relationship, it is one line at the container", async () => {
  const { SHARED_SHARE } = await import("../../src/anywidget_archimate/ui/layout.ts");
  assert.equal(SHARED_SHARE, 0.5);
  const two = shared(2).edges.filter((e) => e.relationship.type === "Serving");
  assert.equal(two.length, 1, "2 of 3 is more than half");
  const l = shared(3);
  const serving = l.edges.filter((e) => e.relationship.type === "Serving");
  assert.equal(serving.length, 1);
  assert.deepEqual([serving[0].source, serving[0].target], ["c", "x"]);
  assert.deepEqual(serving[0].members.map((r) => r.id).sort(), ["s0", "s1", "s2"], "the underlying relationships, for hover");
});

test("half or fewer stay on the children; with relationships not nested, every one is drawn", () => {
  const partial = shared(1).edges.filter((e) => e.relationship.type === "Serving");
  assert.deepEqual(partial.map((e) => e.source).sort(), ["i0"]);
  assert.ok(partial.every((e) => e.members.length === 1));
  const all = shared(3, false).edges.filter((e) => e.relationship.type === "Serving");
  assert.deepEqual(all.map((e) => e.source).sort(), ["i0", "i1", "i2"]);
});

test("no element stretches the diagram: it is never wider than its widest row packed edge to edge", () => {
  const S = 36, margin = 40;
  for (const n of [2, 3, 6, 10]) {
    const m = model(n);
    // An element whose partners sit far apart, the kind that drifted out to the side
    m.els.push({ id: "log", name: "log", type: "DataObject", layer: "Application" });
    m.rels.push({ id: "x1", source: `comp${n - 1}`, target: "log", type: "Access" }, { id: "x2", source: "handling", target: "log", type: "Association" });
    const l = layeredLayout(m.els, m.rels, { nest: true, layerOrder: LAYERS, sizeOf });
    const rows = new Map<number, number>();
    for (const node of l.nodes.values()) {
      if (node.parent) continue;
      const top = Math.round(node.y - node.height / 2);
      rows.set(top, (rows.get(top) ?? -S) + node.width + S);
    }
    const widest = Math.max(...rows.values());
    assert.ok(l.width <= widest + 2 * margin + 1, `model(${n}): width ${l.width.toFixed(0)} vs widest row ${widest.toFixed(0)}`);
  }
});

/** Every line's segments against every element that is not one of its ends or around them: the crossings. */
function crossings(l: LayeredLayout): string[] {
  const chain = (id: string) => { const ids = [id]; for (let q = l.nodes.get(id)!.parent; q; q = l.nodes.get(q)!.parent) ids.push(q); return ids; };
  const found: string[] = [];
  for (const e of l.edges) {
    const own = new Set([...chain(e.source), ...chain(e.target)]);
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1], b = e.points[i];
      const seg: Box = { x: Math.min(a.x, b.x) + 0.5, y: Math.min(a.y, b.y) + 0.5, width: Math.max(Math.abs(a.x - b.x) - 1, 0.01), height: Math.max(Math.abs(a.y - b.y) - 1, 0.01) };
      for (const [id] of l.nodes) if (!own.has(id) && overlap(seg, boxOf(l, id))) found.push(`${e.relationship.id} x ${id}`);
    }
  }
  return found;
}

test("a nested element's line leaves its container past no sibling", () => {
  const els: ArchiElement[] = [
    { id: "app", type: "ApplicationComponent", layer: "Application" },
    ...["a1", "a2", "a3", "a4"].map((id) => ({ id, type: "ApplicationComponent", layer: "Application" })),
    { id: "node", type: "Node", layer: "Technology" },
    { id: "proc", type: "BusinessProcess", layer: "Business" },
  ];
  const rels: ArchiRelationship[] = [
    ...["a1", "a2", "a3", "a4"].map((id, i) => ({ id: `c${i}`, source: "app", target: id, type: "Composition" })),
    { id: "s1", source: "node", target: "a1", type: "Serving" },
    { id: "s2", source: "a4", target: "proc", type: "Serving" },
    { id: "s3", source: "a2", target: "node", type: "Flow" },
  ];
  const l = layeredLayout(els, rels, { nest: true, layerOrder: LAYERS, sizeOf });
  assert.deepEqual(crossings(l), []);
});

test("a crowded gap spills over to the next one instead of running lines into an element", () => {
  const els: ArchiElement[] = [{ id: "fn", type: "BusinessFunction", layer: "Business" }, { id: "dev", type: "Device", layer: "Technology" }];
  const rels: ArchiRelationship[] = [];
  for (let i = 0; i < 60; i++) {
    els.push({ id: `s${i}`, type: "ApplicationService", layer: "Application" }, { id: `c${i}`, type: "ApplicationComponent", layer: "Application" });
    rels.push({ id: `u${i}`, source: `s${i}`, target: "fn", type: "Serving" }, { id: `d${i}`, source: "dev", target: `c${i}`, type: "Serving" });
  }
  const l = layeredLayout(els, rels, { nest: true, layerOrder: LAYERS, sizeOf });
  assert.deepEqual(crossings(l), []);
});

test("a large model stays landscape and inside its frame: lanes are shared where lines do not overlap", () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const types: [string, string][] = [["BusinessActor", "Business"], ["BusinessProcess", "Business"], ["ApplicationService", "Application"],
    ["ApplicationComponent", "Application"], ["DataObject", "Application"], ["Node", "Technology"], ["SystemSoftware", "Technology"], ["Artifact", "Technology"]];
  const els: ArchiElement[] = Array.from({ length: 150 }, (_, i) => { const [type, layer] = types[i % types.length]; return { id: `e${i}`, type, layer }; });
  const rels: ArchiRelationship[] = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, source: `e${Math.floor(rnd() * 150)}`, target: `e${Math.floor(rnd() * 150)}`, type: ["Serving", "Flow", "Access", "Triggering"][i % 4] }));
  const l = layeredLayout(els, rels, { nest: true, layerOrder: LAYERS, sizeOf });
  const ratio = l.width / l.height;
  assert.ok(ratio > 0.7, `width / height ${ratio.toFixed(2)}`);
  for (const e of l.edges) for (const p of e.points) assert.ok(p.y <= l.height && p.y >= 0 && p.x >= 0 && p.x <= l.width, `${e.relationship.id} inside the frame`);
  assert.deepEqual(crossings(l), []);
});

test("lines between elements of the last band stay inside the diagram", () => {
  const els: ArchiElement[] = ["n1", "n2", "n3", "n4"].map((id) => ({ id, type: "Node", layer: "Technology" }));
  const rels: ArchiRelationship[] = [];
  for (let i = 0; i < 48; i++) rels.push({ id: `f${i}`, source: `n${(i % 4) + 1}`, target: `n${((i + 1) % 4) + 1}`, type: ["Flow", "Serving", "Triggering", "Association", "Access", "Realization"][Math.floor(i / 8)] });
  const l = layeredLayout(els, rels, { nest: false, layerOrder: LAYERS, sizeOf });
  for (const e of l.edges) for (const p of e.points) assert.ok(p.y <= l.height, `${e.relationship.id} at y ${p.y} in a ${l.height} high diagram`);
});
