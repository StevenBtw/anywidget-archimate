// The ArchiMate look in the shared anywidgets style: elements drawn like graph nodes (a ring in the layer's
// ArchiMate hue over a 38% fill of it on the canvas), the relationship legend as line samples, the shared size rule
// and the details panel following the selection. Run through tests/test_ui.py::test_javascript.
import assert from "node:assert/strict";
import { test } from "node:test";

import { hexColor, mixOver, inkColors, INK_FILL } from "../../src/anywidget_archimate/ui/colors.ts";
import { relationSample } from "../../src/anywidget_archimate/ui/legend.ts";
import { wrapperSize } from "../../src/anywidget_archimate/ui/size.ts";

test("an element is a ring in its hue over 38% of it, opaque on the canvas", () => {
  assert.equal(INK_FILL, 0.38);
  assert.equal(mixOver("#00b2b2", "#ffffff", 0.38), "#9ee2e2");
  assert.deepEqual(inkColors("#00b2b2", "#ffffff"), { stroke: "#00b2b2", fill: "#9ee2e2" });
  assert.equal(inkColors("#00b2b2", "#161a19").fill, mixOver("#00b2b2", "#161a19", 0.38));
});

test("a relationship's legend sample is its line: dash pattern and its ends, in the given colour", () => {
  const realization = relationSample({ dash: "6 4", srcMarker: "", tgtMarker: "triangle-hollow" }, "#666666");
  assert.match(realization, /stroke-dasharray="6 4"/);
  assert.match(realization, /<polygon[^>]*fill="none"/);
  const composition = relationSample({ dash: "", srcMarker: "diamond-filled", tgtMarker: "" }, "#666666");
  assert.doesNotMatch(composition, /stroke-dasharray/);
  assert.match(composition, /<polygon[^>]*fill="#666666"/);
  assert.match(relationSample({ dash: "", srcMarker: "", tgtMarker: "" }, "#666666"), /^<svg[^>]*><line /);
});

test("the legend's line starts where its source marker ends, also at the dot of an assignment", () => {
  const x1 = (svg: string) => Number(/<line x1="([\d.]+)"/.exec(svg)?.[1]);
  assert.equal(x1(relationSample({ dash: "", srcMarker: "circle-filled", tgtMarker: "arrow-filled" }, "#666666")), 7.2, "the dot is r 2.2 at 5");
  assert.equal(x1(relationSample({ dash: "", srcMarker: "diamond-filled", tgtMarker: "" }, "#666666")), 9, "the diamond ends at 9");
});

test("a host's colour override reads as hex in the forms CSS allows for it; other forms keep the fallback", () => {
  assert.equal(hexColor("#1E1E3A"), "#1e1e3a");
  assert.equal(hexColor(" #abc "), "#aabbcc");
  assert.equal(hexColor("#11223380"), "#112233", "alpha dropped");
  assert.equal(hexColor("rgb(10, 20, 30)"), "#0a141e");
  assert.equal(hexColor("rgba(10, 20, 30, 0.5)"), "#0a141e");
  assert.equal(hexColor("rgb(10 20 30 / 50%)"), "#0a141e");
  const malformed = ["rgb(1,,2,3)", "rgb(1, 2 3)", "rgb(1 2 3, 0.5)", "rgb(1, 2, 3 / 0.5)", "rgb(,1,2,3)"];
  for (const other of ["", "teal", "rgb(300, 0, 0)", "color-mix(in srgb, red 50%, blue)", "#12345", ...malformed]) assert.equal(hexColor(other), null, other);
});

test("the shared size rule (the same file as the graph and vector widgets)", () => {
  assert.deepEqual(wrapperSize(0, 0), { width: "100%", aspectRatio: "16 / 10", minHeight: "360px", maxHeight: "80vh" });
  assert.deepEqual(wrapperSize(0, 500), { width: "100%", height: "500px" });
});

test("quiet lines keep the comparison readable: recoloured statuses full, partial under stable, ghost lowest", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../../src/anywidget_archimate/ui/styles.css", import.meta.url), "utf8");
  const opacity = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return Number(new RegExp(`${escaped}[^{]*\\{[^}]*opacity:\\s*([\\d.]+)`).exec(css)?.[1]);
  };
  const stable = opacity(".aam-lines-quiet .aam-edge");
  const partial = opacity(".aam-lines-quiet .aam-edge.aam-status-partial");
  const ghost = opacity(".aam-lines-quiet .aam-edge.aam-status-ghost");
  assert.ok(partial < stable, `partial ${partial} under stable ${stable}`);
  assert.ok(ghost < partial, `ghost ${ghost} under partial ${partial}`);
  for (const s of ["changed", "only-a", "only-b"]) assert.equal(opacity(`.aam-lines-quiet .aam-edge.aam-status-${s}`), 1, s);
});
