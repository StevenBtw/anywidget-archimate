// Tests for the widget's pure helpers. Run with: node --test tests/js/*.test.mjs
// (pytest runs them too, see tests/test_ui.py).
import assert from "node:assert/strict";
import { test } from "node:test";

import { badgeText, highlightIds, resolveDark, statusClass } from "../../src/anywidget_archimate/ui/status.js";

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
  assert.equal(badgeText({ badge: "a very long badge text that does not fit on the element" }).length, 26);
  assert.equal(badgeText({}), "");
  assert.equal(badgeText({ badge: "" }), "");
  assert.equal(badgeText({ badge: "  " }), "");
  assert.equal(badgeText({ badge: 7 }), "7");
});

test("an explicit host theme wins over the operating system", () => {
  assert.equal(resolveDark({ theme: "light", darkClass: false, prefersDark: true }), false);
  assert.equal(resolveDark({ theme: "dark", darkClass: false, prefersDark: false }), true);
  assert.equal(resolveDark({ theme: undefined, darkClass: true, prefersDark: false }), true);
  assert.equal(resolveDark({ theme: undefined, darkClass: false, prefersDark: true }), true);
  assert.equal(resolveDark({ theme: "", darkClass: false, prefersDark: false }), false);
});

test("highlight ids become a set of strings", () => {
  assert.deepEqual([...highlightIds(["n1", "n2", "n1"])], ["n1", "n2"]);
  assert.equal(highlightIds(null).size, 0);
  assert.equal(highlightIds("n1").size, 0);
});
