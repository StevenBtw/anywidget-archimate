// ArchiMate elements in the shared anywidgets look: a ring in the layer's ArchiMate hue over a fill of the same hue
// at 38% composited onto the canvas (opaque, so lines behind never show through), as the graph widget draws nodes.

/** How much of the hue fills an element (the graph's node fill) */
export const INK_FILL = 0.38;

/** A CSS colour as six-digit hex: #rgb, #rrggbb, #rrggbbaa, rgb() or rgba() (alpha dropped); null for other forms. */
export function hexColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (long) return `#${long[1]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(v);
  if (rgb && rgb.slice(1, 4).every((c) => Number(c) <= 255)) {
    return "#" + rgb.slice(1, 4).map((c) => Number(c).toString(16).padStart(2, "0")).join("");
  }
  return null;
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** `color` at `alpha` over `background`, as an opaque #rrggbb. */
export function mixOver(color: string, background: string, alpha: number): string {
  const c = channels(color), b = channels(background);
  return "#" + c.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]).toString(16).padStart(2, "0")).join("");
}

/** An element's ring (the hue) and fill (the hue at INK_FILL over the canvas). */
export function inkColors(hue: string, background: string): { stroke: string; fill: string } {
  return { stroke: hue.toLowerCase(), fill: mixOver(hue, background, INK_FILL) };
}
