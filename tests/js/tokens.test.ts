// The shared anywidgets look: styles.css carries the design tokens' chrome (tests/js/fixtures/anywidgets-tokens.json
// is a copy of the generated tokens; `npm run sync-tokens -- <tokens.json>` rewrites the block from a newer one).
// ArchiMate's layer colours are the ArchiMate convention and stay. Run through tests/test_ui.py::test_javascript.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const UI = new URL("../../src/anywidget_archimate/ui/", import.meta.url);
const tokens = JSON.parse(readFileSync(new URL("./fixtures/anywidgets-tokens.json", import.meta.url), "utf8"));
const css = readFileSync(new URL("styles.css", UI), "utf8");

function block(selector: string): string {
  const synced = css.match(/\/\* design-tokens:start[\s\S]*?\/\* design-tokens:end \*\//)?.[0] ?? "";
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return synced.match(new RegExp(`(^|\\n)${escaped} \\{([^}]*)\\}`))?.[2] ?? "";
}
const value = (body: string, name: string) => body.match(new RegExp(`--${name}: ([^;]+);`))?.[1];

test("the synced block holds the token values for every chrome variable", () => {
  const expected: Record<string, string> = {
    bg: "background",
    "graph-bg": "background",
    "toolbar-bg": "surface",
    "detail-bg": "surface",
    "panel-bg": "surface",
    "btn-bg": "muted",
    "btn-hover": "border-strong",
    text: "foreground",
    border: "border",
    "font-mono": "font-mono",
    "radius-box": "radius-box",
  };
  for (const [selector, mode] of [[".aam-wrapper", "light"], [".aam-wrapper.aam-dark", "dark"]] as const) {
    const body = block(selector);
    assert.ok(body, `${selector} in the synced block`);
    for (const [name, token] of Object.entries(expected)) assert.equal(value(body, `aam-${name}`), tokens[mode][token], `${selector} --aam-${name}`);
  }
});

test("the panel width and the layer colours are not the tokens' business", () => {
  assert.match(css, /--aam-panel-width: 220px;/);
  assert.ok(!block(".aam-wrapper").includes("--aam-layer"), "layer colours stay out of the synced block");
});

test("no hard-coded indigo, blue or slate is left in the styles", () => {
  for (const banned of ["#6366f1", "#2f81f7", "#e2e8f0", "#0f172a"]) assert.ok(!css.includes(banned), `${banned} still used`);
});
