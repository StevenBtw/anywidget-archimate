// Tests for the widget's pure helpers. Run with: node --test tests/js/*.test.ts
// (pytest runs them too, see tests/test_ui.py).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DIAGRAM_CSS,
  STATUS_ACCENTS,
  badgeText,
  highlightIds,
  markerId,
  resolveDark,
  statusClass,
} from "../../src/anywidget_archimate/ui/status.ts";

test("each comparison status maps to its own class; stable and unknown get none", () => {
  assert.equal(statusClass("partial"), "aam-status-partial");
  assert.equal(statusClass("changed"), "aam-status-changed");
  assert.equal(statusClass("only_a"), "aam-status-only-a");
  assert.equal(statusClass("only_b"), "aam-status-only-b");
  assert.equal(statusClass("ghost"), "aam-status-ghost");
  assert.equal(statusClass("stable"), "");
  assert.equal(statusClass(undefined), "");
  assert.equal(statusClass("something else"), "");
});

test("badges are short single-line text", () => {
  assert.equal(badgeText({ badge: "2/3" }), "2/3");
  assert.equal(badgeText({ badge: "  only in run 1 \n" }), "only in run 1");
  assert.equal(badgeText({ badge: "a very long badge text that does not fit on the element" }), "a very long badge text th…");
  assert.equal(badgeText({}), "");
  assert.equal(badgeText({ badge: "" }), "");
  assert.equal(badgeText({ badge: "  " }), "");
  assert.equal(badgeText({ badge: 7 }), "7");
});

test("badges are cut by character, never inside a surrogate pair", () => {
  assert.equal(badgeText({ badge: "x".repeat(24) + "😀😀" }), "x".repeat(24) + "😀😀");
  assert.equal(badgeText({ badge: "x".repeat(24) + "😀😀😀" }), "x".repeat(24) + "😀…");
});

test("edge status rules never set a dash, so relationships keep their ArchiMate dash", () => {
  const edgeRules = DIAGRAM_CSS.split("}").filter((rule) => rule.includes(".aam-edge"));
  assert.ok(edgeRules.length >= 5);
  for (const rule of edgeRules) assert.doesNotMatch(rule, /stroke-dasharray/);
});

test("a recolored relationship points to arrowheads in its own color", () => {
  assert.equal(markerId("arrow-filled", "only_a"), "arrow-filled-only-a");
  assert.equal(markerId("arrow-filled", "changed"), "arrow-filled-changed");
  assert.equal(markerId("arrow-filled", "partial"), "arrow-filled");
  assert.equal(markerId("arrow-filled", undefined), "arrow-filled");
  assert.equal(markerId("arrow-filled", "constructor"), "arrow-filled");
});

test("a status color is shared by the edge line and a container's header band", () => {
  assert.deepEqual([...STATUS_ACCENTS.keys()].sort(), ["changed", "only_a", "only_b"]);
  for (const [status, color] of STATUS_ACCENTS) {
    assert.ok(DIAGRAM_CSS.includes(`.aam-edge.${statusClass(status)} { stroke: ${color}; }`), status);
    assert.ok(DIAGRAM_CSS.includes(`.aam-node.${statusClass(status)} .aam-node-header { fill: ${color}; }`), status);
  }
});

test("an explicit host theme wins over the operating system", () => {
  assert.equal(resolveDark({ theme: "light", darkClass: false, prefersDark: true }), false);
  assert.equal(resolveDark({ theme: "dark", darkClass: false, prefersDark: false }), true);
  assert.equal(resolveDark({ theme: undefined, darkClass: true, prefersDark: false }), true);
  assert.equal(resolveDark({ theme: undefined, darkClass: false, prefersDark: true }), true);
  assert.equal(resolveDark({ theme: "", darkClass: false, prefersDark: false }), false);
});

test("a light class wins over the operating system, but not over a dark class or data-theme", () => {
  assert.equal(resolveDark({ theme: undefined, darkClass: false, lightClass: true, prefersDark: true }), false);
  assert.equal(resolveDark({ theme: undefined, darkClass: true, lightClass: true, prefersDark: false }), true);
  assert.equal(resolveDark({ theme: "dark", darkClass: false, lightClass: true, prefersDark: false }), true);
});

test("highlight ids become a set of strings", () => {
  assert.deepEqual([...highlightIds(["n1", "n2", "n1"])], ["n1", "n2"]);
  assert.equal(highlightIds(null).size, 0);
  assert.equal(highlightIds("n1").size, 0);
});

test("status fills keep element labels readable in both themes (4.5:1 or more)", async () => {
  const { diagramCss } = await import("../../src/anywidget_archimate/ui/status.ts");
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [dark, bg, text] of [[false, "#ffffff", "#151a18"], [true, "#161a19", "#e6ebe8"]] as const) {
    const css = diagramCss(dark, bg);
    for (const status of ["changed", "only-a", "only-b"]) {
      const fill = new RegExp(`\.aam-status-${status} \.aam-node-rect \{ fill: (#[0-9a-f]{6})`, "i").exec(css)?.[1];
      assert.ok(fill, `${status} has a fill (${dark ? "dark" : "light"})`);
      assert.ok(contrast(text, fill!) >= 4.5, `${status} ${dark ? "dark" : "light"}: ${contrast(text, fill!).toFixed(2)}:1`);
    }
  }
});
