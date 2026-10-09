// Pure helpers for comparison styling, badges, theme and highlights (tested with node --test tests/js/)

const STATUSES = new Set(["partial", "changed", "only_a", "only_b", "ghost"]);
const BADGE_MAX = 26;

// CSS class for an element or relationship status; "stable" and unknown values get none
export function statusClass(status) {
  return STATUSES.has(status) ? `aam-status-${status.replace("_", "-")}` : "";
}

// Short single-line badge text ("2/3", "only in run 1"), cut to fit on an element
export function badgeText(item) {
  if (item.badge === undefined || item.badge === null) return "";
  const text = String(item.badge).replace(/\s+/g, " ").trim();
  return text.length > BADGE_MAX ? text.slice(0, BADGE_MAX - 1) + "…" : text;
}

// Dark or light: an explicit host theme ("light"/"dark") wins, then a dark class, then the operating system
export function resolveDark({ theme, darkClass, prefersDark }) {
  if (theme === "light") return false;
  if (theme === "dark") return true;
  return Boolean(darkClass || prefersDark);
}

// The ids the host asked to outline
export function highlightIds(ids) {
  return new Set(Array.isArray(ids) ? ids.map(String) : []);
}
