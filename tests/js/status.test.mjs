// Tests for the widget's pure helpers. Run with: node --test tests/js/*.test.mjs
// (pytest runs them too, see tests/test_ui.py).
import assert from "node:assert/strict";
import { test } from "node:test";

import { DIAGRAM_CSS, badgeText, highlightIds, resolveDark, statusClass } from "../../src/anywidget_archimate/ui/status.js";

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
