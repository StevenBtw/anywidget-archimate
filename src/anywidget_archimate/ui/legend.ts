// The filter panel's relationship legend: each type as a short sample of the line the diagram draws (its dash
// pattern and its ends, ArchiMate notation), not a colour the diagram never uses.

export interface RelStyle {
  dash: string;
  srcMarker: string;
  tgtMarker: string;
}

/** SVG markup (constants only, no data) for a 28x10 sample of a relationship line in `color`. */
export function relationSample(style: RelStyle, color: string): string {
  // The line starts where the source marker ends: the diamonds at 9, the dot (r 2.2 at 5) at 7.2
  const x1 = style.srcMarker === "circle-filled" ? 7.2 : style.srcMarker ? 9 : 1;
  const x2 = style.tgtMarker === "triangle-hollow" ? 19 : style.tgtMarker ? 21 : 27;
  const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : "";
  const parts = [`<line x1="${x1}" y1="5" x2="${x2}" y2="5" stroke="${color}" stroke-width="1.3"${dash}/>`];
  const src: Record<string, string> = {
    "diamond-filled": `<polygon points="1,5 5,2 9,5 5,8" fill="${color}" stroke="${color}"/>`,
    "diamond-hollow": `<polygon points="1,5 5,2 9,5 5,8" fill="none" stroke="${color}"/>`,
    "circle-filled": `<circle cx="5" cy="5" r="2.2" fill="${color}"/>`,
  };
  const tgt: Record<string, string> = {
    "arrow-filled": `<polygon points="21,1.5 27,5 21,8.5" fill="${color}" stroke="${color}"/>`,
    "arrow-hollow": `<polyline points="21,1.5 27,5 21,8.5" fill="none" stroke="${color}" stroke-width="1.3"/>`,
    "triangle-hollow": `<polygon points="19,1 27,5 19,9" fill="none" stroke="${color}"/>`,
  };
  if (src[style.srcMarker]) parts.push(src[style.srcMarker]);
  if (tgt[style.tgtMarker]) parts.push(tgt[style.tgtMarker]);
  return `<svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">${parts.join("")}</svg>`;
}
