// Pure helpers for comparison styling, badges, theme and highlights (tested with node --test tests/js/)

const STATUSES = new Set(["partial", "changed", "only_a", "only_b", "ghost"]);
const BADGE_MAX = 26;

// Comparison styling and the badge font. The diagram SVG carries these in its own <style>, so the SVG and
// PNG exports keep them. Edge rules never set a dash: the dash belongs to the relationship type.
export const DIAGRAM_CSS = `
.aam-node-badge { font: 600 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; opacity: 0.85; }
.aam-node.aam-status-partial { opacity: 0.75; }
.aam-node.aam-status-partial .aam-node-rect { stroke-dasharray: 5 3; }
.aam-node.aam-status-changed .aam-node-rect { fill: #ffd98a; }
.aam-node.aam-status-only-a .aam-node-rect { fill: #ffb8b2; }
.aam-node.aam-status-only-b .aam-node-rect { fill: #bdf0c8; }
.aam-node.aam-status-ghost { opacity: 0.28; }
.aam-node.aam-status-ghost .aam-node-rect { stroke-dasharray: 4 3; }
.aam-edge.aam-status-partial { opacity: 0.5; }
.aam-edge.aam-status-ghost { opacity: 0.28; }
.aam-edge.aam-status-changed { stroke: #d4900f; }
.aam-edge.aam-status-only-a { stroke: #d1453b; }
.aam-edge.aam-status-only-b { stroke: #2e9b4f; }
`;

// CSS class for an element or relationship status; "stable" and unknown values get none
export function statusClass(status) {
  return STATUSES.has(status) ? `aam-status-${status.replace("_", "-")}` : "";
}

// Short single-line badge text ("2/3", "only in run 1"), cut by character (not UTF-16 unit) to fit on an element
export function badgeText(item) {
  if (item.badge === undefined || item.badge === null) return "";
  const chars = Array.from(String(item.badge).replace(/\s+/g, " ").trim());
  return chars.length > BADGE_MAX ? chars.slice(0, BADGE_MAX - 1).join("") + "…" : chars.join("");
}

// Dark or light: an explicit host theme ("light"/"dark") wins, then a dark class, then a light class,
// then the operating system
export function resolveDark({ theme, darkClass, lightClass, prefersDark }) {
  if (theme === "light") return false;
  if (theme === "dark") return true;
  if (darkClass) return true;
  if (lightClass) return false;
  return Boolean(prefersDark);
}

// The ids the host asked to outline
export function highlightIds(ids) {
  return new Set(Array.isArray(ids) ? ids.map(String) : []);
}
