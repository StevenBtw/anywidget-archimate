// The ArchiMate diagram's layout, after the layered view architects draw by hand (e.g. Hosiaisluoma's "Layered
// View"): each layer is a stack of labelled bands by role (business actors, business services, processes; application
// services and interfaces, applications and data; technology services, infrastructure), elements line up in columns
// so relationships run straight between the bands, and a structural relationship within a layer (composition,
// aggregation, assignment, realization) is drawn as nesting, so its line disappears. A container's own services and
// interfaces sit on its top row. Containers are sized from their real children, so nested levels never overlap, and
// can be folded to one box (their relationships then attach to it). Lines are orthogonal and run in the gaps between
// bands and between elements, never through an element.
//
// Pure: no DOM, so tests/js runs it in Node. index.ts draws what it returns.
import type { ArchiElement, ArchiRelationship } from "./types.ts";

export interface Box { x: number; y: number; width: number; height: number }

/** A placed element: its centre and size, its layer, and its place in the nesting. */
export interface PlacedNode {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: string;
  depth: number;
  parent: string | null;
  /** Has visible children drawn inside it */
  container: boolean;
  /** A folded container: drawn as one box; `hidden` elements are inside it */
  collapsed: boolean;
  hidden: number;
}

export interface RoutedEdge {
  points: { x: number; y: number }[];
  /** The relationship drawn (the first of `members`); its type sets the line's notation */
  relationship: ArchiRelationship;
  /** The elements the line is drawn between (a container when lifted or shared) */
  source: string;
  target: string;
  /** The relationships this line stands for: one, or several shared at a container or lifted to a folded one */
  members: ArchiRelationship[];
  /** Lifted to a folded container or shared at a container (the drawn ends are not the relationship's own) */
  lifted: boolean;
}

/** A labelled band: one role row of a layer. */
export interface Band { layer: string; label: string; y0: number; y1: number }

export interface LayeredLayout {
  nodes: Map<string, PlacedNode>;
  edges: RoutedEdge[];
  bands: Band[];
  width: number;
  height: number;
  /** Relationships drawn as nesting (no line) */
  nested: Set<string>;
}

export interface LayoutOptions {
  /** Draw structural relationships within a layer as nesting */
  nest: boolean;
  /** Containers folded to one box */
  collapsed?: Set<string>;
  /** Nest relationships: a relationship more than half of a container's children share is one line at the container
   * (default true) */
  bundle?: boolean;
  /** Layers top to bottom */
  layerOrder: string[];
  /** A leaf element's size */
  sizeOf: (el: ArchiElement) => { width: number; height: number };
}

/** A relationship more than this share of a container's children have is drawn once, at the container */
export const SHARED_SHARE = 0.5;

// Nesting: the relationships that may be drawn as nesting, in the order they win when an element has several parents
export const NESTING_ORDER = ["Composition", "Aggregation", "Assignment", "Realization"];

export const SPACING = {
  margin: 40,       // around the diagram
  gap: 36,          // between elements in a row (also the vertical lanes between them)
  bandLabel: 22,    // the band's label above its elements
  bandPad: 14,      // below the elements, inside the band
  channel: 30,      // the least gap between two bands (lines run here)
  lane: 6,          // between parallel lines in a gap
  layerGap: 18,     // extra between layers
  containerPad: 12,
  containerHead: 28,
  childGap: 12,
};

// --- Roles -------------------------------------------------------------------------------------------------------

type Role = "actors" | "external" | "internal";
const ROLE_ORDER: Role[] = ["actors", "external", "internal"];

/** An element's row in its layer: actors and roles (business), services, interfaces and events, the rest. */
export function roleOf(type: string, layer: string): Role {
  // Motivation, Strategy, Implementation and Other keep one band each
  if (!(layer in ROLE_LABELS)) return "internal";
  if (layer === "Business" && /^(BusinessActor|BusinessRole|BusinessCollaboration)$/.test(type)) return "actors";
  if (/(Service|Interface|Event)$/.test(type)) return "external";
  return "internal";
}

const ROLE_LABELS: Record<string, Partial<Record<Role, string>>> = {
  Business: { actors: "Actors and roles", external: "Business services", internal: "Business processes and objects" },
  Application: { external: "Application services and interfaces", internal: "Applications and data" },
  Technology: { external: "Technology services", internal: "Infrastructure" },
};

export function bandLabel(layer: string, role: Role): string {
  return ROLE_LABELS[layer]?.[role] ?? (role === "external" ? `${layer} services` : layer);
}

// --- Nesting -----------------------------------------------------------------------------------------------------

/** Each element's parent (one at most, no cycles, same layer) and the relationships that become nesting. */
export function nestingTree(elements: ArchiElement[], relationships: ArchiRelationship[]): {
  parent: Map<string, string>;
  nested: Set<string>;
} {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const parent = new Map<string, string>();
  const nested = new Set<string>();
  const isAncestor = (a: string, of: string) => {
    for (let p = parent.get(of); p !== undefined; p = parent.get(p)) if (p === a) return true;
    return false;
  };
  for (const type of NESTING_ORDER) {
    for (const r of relationships) {
      if (r.type !== type) continue;
      const s = byId.get(r.source), t = byId.get(r.target);
      if (!s || !t || s.id === t.id || s.layer !== t.layer) continue;
      if (/Junction$/.test(String(s.type)) || /Junction$/.test(String(t.type))) continue;
      if (parent.has(t.id)) {
        // Already inside this parent through another relationship: that line is shown by the nesting too
        if (parent.get(t.id) === s.id) nested.add(r.id);
        continue;
      }
      if (t.id === s.id || isAncestor(t.id, s.id)) continue;
      parent.set(t.id, s.id);
      nested.add(r.id);
    }
  }
  return { parent, nested };
}

// --- Layout ------------------------------------------------------------------------------------------------------

interface Unit {
  id: string;            // the top-level element
  width: number;
  height: number;
  role: Role;
  layer: string;
  x: number;             // centre, set by placement
  order: number;         // model order (stable tie-break)
}

interface Row { layer: string; role: Role; label: string; units: Unit[]; top: number; height: number; first: boolean }

export function layeredLayout(elements: ArchiElement[], relationships: ArchiRelationship[], opts: LayoutOptions): LayeredLayout {
  const S = SPACING;
  const byId = new Map(elements.map((e) => [e.id, e]));
  const modelOrder = new Map(elements.map((e, i) => [e.id, i]));
  const { parent, nested } = opts.nest ? nestingTree(elements, relationships) : { parent: new Map<string, string>(), nested: new Set<string>() };
  const collapsed = opts.collapsed ?? new Set<string>();

  const children = new Map<string, string[]>();
  for (const e of elements) {
    const p = parent.get(e.id);
    if (p !== undefined) (children.get(p) ?? children.set(p, []).get(p)!).push(e.id);
  }
  const descendants = (id: string): number => (children.get(id) ?? []).reduce((n, c) => n + 1 + descendants(c), 0);

  // The element that stands for `id` on screen: itself, or its outermost folded ancestor
  const visibleOf = (id: string): string => {
    let shown = id;
    for (let p = parent.get(id); p !== undefined; p = parent.get(p)) if (collapsed.has(p)) shown = p;
    return shown;
  };
  const topOf = (id: string): string => {
    let top = id;
    for (let p = parent.get(id); p !== undefined; p = parent.get(p)) top = p;
    return top;
  };

  // --- Sizes, bottom-up: a container fits its children, laid out in rows by role (services and interfaces first)
  const rel = new Map<string, { x: number; y: number }>(); // a child's top-left inside its parent
  const size = new Map<string, { width: number; height: number }>();
  function measure(id: string): { width: number; height: number } {
    const el = byId.get(id)!;
    const kids = collapsed.has(id) ? [] : children.get(id) ?? [];
    if (!kids.length) {
      const s = opts.sizeOf(el);
      size.set(id, s);
      return s;
    }
    const sorted = [...kids].sort((a, b) => ROLE_ORDER.indexOf(roleOf(String(byId.get(a)!.type ?? ""), String(byId.get(a)!.layer)))
      - ROLE_ORDER.indexOf(roleOf(String(byId.get(b)!.type ?? ""), String(byId.get(b)!.layer))) || modelOrder.get(a)! - modelOrder.get(b)!);
    const sizes = sorted.map((c) => measure(c));
    const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(sorted.length))));
    // Rows: each role starts a new row, a row holds at most `cols`
    const rows: number[][] = [];
    let lastRole: Role | null = null;
    sorted.forEach((c, i) => {
      const role = roleOf(String(byId.get(c)!.type ?? ""), String(byId.get(c)!.layer));
      if (!rows.length || role !== lastRole || rows[rows.length - 1].length >= cols) rows.push([]);
      rows[rows.length - 1].push(i);
      lastRole = role;
    });
    let y = S.containerHead, width = 0;
    for (const row of rows) {
      let x = S.containerPad, h = 0;
      for (const i of row) {
        rel.set(sorted[i], { x, y });
        x += sizes[i].width + S.childGap;
        h = Math.max(h, sizes[i].height);
      }
      width = Math.max(width, x - S.childGap + S.containerPad);
      y += h + S.childGap;
    }
    const s = { width: Math.max(width, opts.sizeOf(el).width), height: y - S.childGap + S.containerPad };
    // Centre short rows in a wide container
    for (const row of rows) {
      const last = sorted[row[row.length - 1]];
      const used = rel.get(last)!.x + size.get(last)!.width + S.containerPad;
      const shift = (s.width - used) / 2;
      if (shift > 0) for (const i of row) rel.get(sorted[i])!.x += shift;
    }
    size.set(id, s);
    return s;
  }

  // --- Units: the top-level elements, in rows by layer and role
  const units = new Map<string, Unit>();
  for (const e of elements) {
    if (parent.has(e.id)) continue;
    const s = measure(e.id);
    const layer = String(e.layer ?? "Other");
    units.set(e.id, { id: e.id, ...s, role: roleOf(String(e.type ?? ""), layer), layer, x: 0, order: modelOrder.get(e.id)! });
  }

  // Lifted links between units (every drawn relationship, counted once per pair), for ordering and placement
  const links = new Map<string, Set<string>>();
  for (const r of relationships) {
    if (nested.has(r.id) || !byId.has(r.source) || !byId.has(r.target)) continue;
    const a = topOf(r.source), b = topOf(r.target);
    if (a === b) continue;
    (links.get(a) ?? links.set(a, new Set()).get(a)!).add(b);
    (links.get(b) ?? links.set(b, new Set()).get(b)!).add(a);
  }

  const layers = opts.layerOrder.filter((l) => [...units.values()].some((u) => u.layer === l));
  const roleRows: Row[] = [];
  for (const layer of layers) {
    for (const role of ROLE_ORDER) {
      const list = [...units.values()].filter((u) => u.layer === layer && u.role === role).sort((a, b) => a.order - b.order);
      if (list.length) roleRows.push({ layer, role, label: bandLabel(layer, role), units: list, top: 0, height: 0, first: true });
    }
  }

  // Order within rows: barycentre sweeps over the lifted links (fewer crossings), model order breaks ties
  const posOf = new Map<string, number>();
  const index = () => roleRows.forEach((row) => row.units.forEach((u, i) => posOf.set(u.id, (i + 0.5) / row.units.length)));
  index();
  for (let sweep = 0; sweep < 8; sweep++) {
    const rows = sweep % 2 === 0 ? roleRows : [...roleRows].reverse();
    for (const row of rows) {
      const bary = new Map(row.units.map((u) => {
        const ns = [...(links.get(u.id) ?? [])].filter((n) => posOf.has(n) && !row.units.some((v) => v.id === n));
        return [u.id, ns.length ? ns.reduce((s, n) => s + posOf.get(n)!, 0) / ns.length : posOf.get(u.id)!];
      }));
      row.units.sort((a, b) => bary.get(a.id)! - bary.get(b.id)! || a.order - b.order);
      row.units.forEach((u, i) => posOf.set(u.id, (i + 0.5) / row.units.length));
    }
  }

  // Wrap rows wider than the diagram's target width (an aspect near 1.6) into several rows of the same band
  // The target: of the widths where a row breaks, the one whose wrapped diagram comes closest to 1.6 wide per high
  const widest = Math.max(...[...units.values()].map((u) => u.width), 0);
  const heightAt = (W: number) => roleRows.reduce((h, row) => {
    let rowH = 0, w = 0, tallest = 0;
    for (const u of row.units) {
      if (w && w + u.width > W) { rowH += S.bandLabel + tallest + S.bandPad + S.channel; w = 0; tallest = 0; }
      w += u.width + S.gap;
      tallest = Math.max(tallest, u.height);
    }
    return h + rowH + S.bandLabel + tallest + S.bandPad + S.channel;
  }, 0);
  const longest = Math.max(...roleRows.map((r) => r.units.reduce((s, u) => s + u.width + S.gap, 0)), widest);
  let target = longest, bestScore = Infinity;
  for (let W = widest; W <= longest + 1; W += Math.max(40, (longest - widest) / 60)) {
    const score = Math.abs(Math.log(W / heightAt(W) / 1.6));
    if (score < bestScore) { bestScore = score; target = W; }
  }
  const rows: Row[] = [];
  for (const row of roleRows) {
    let chunk: Unit[] = [], w = 0, first = true;
    for (const u of row.units) {
      if (chunk.length && w + u.width > target) {
        rows.push({ ...row, units: chunk, first });
        chunk = []; w = 0; first = false;
      }
      chunk.push(u);
      w += u.width + S.gap;
    }
    if (chunk.length) rows.push({ ...row, units: chunk, first });
  }
  const rowOf = new Map<string, number>();
  rows.forEach((row, i) => row.units.forEach((u) => rowOf.set(u.id, i)));

  // Placement: each unit towards the mean of its neighbours' centres (columns line up), rows never overlap
  for (const row of rows) {
    let x = 0;
    for (const u of row.units) { u.x = x + u.width / 2; x += u.width + S.gap; }
  }
  const unitList = [...units.values()];
  // The frame: the widest row packed edge to edge. Every row is centred in it and no element may leave it, so one
  // element pulled towards a far partner can never stretch the diagram (each row fits, packed, by construction)
  const frame = Math.max(...rows.map((r) => r.units.reduce((s, u) => s + u.width + S.gap, -S.gap)), 0);
  for (const row of rows) {
    const used = row.units.reduce((s, u) => s + u.width + S.gap, -S.gap);
    const shift = (frame - used) / 2 - (row.units[0].x - row.units[0].width / 2);
    for (const u of row.units) u.x += shift;
  }
  for (let it = 0; it < 10; it++) {
    for (const row of it % 2 === 0 ? rows : [...rows].reverse()) {
      const want = row.units.map((u) => {
        const ns = [...(links.get(u.id) ?? [])].filter((n) => units.has(n) && rowOf.get(n) !== rowOf.get(u.id));
        return ns.length ? ns.reduce((s, n) => s + units.get(n)!.x, 0) / ns.length : u.x;
      });
      // Forward (push right) and backward (push left) passes; their mean keeps the order and the gaps
      const fwd: number[] = [], bwd: number[] = [];
      row.units.forEach((u, i) => {
        const min = i ? fwd[i - 1] + row.units[i - 1].width / 2 + S.gap + u.width / 2 : u.width / 2;
        fwd.push(Math.max(want[i], min));
      });
      for (let i = row.units.length - 1; i >= 0; i--) {
        const u = row.units[i];
        const max = i < row.units.length - 1 ? bwd[0] - row.units[i + 1].width / 2 - S.gap - u.width / 2 : frame - u.width / 2;
        bwd.unshift(Math.min(want[i], max));
      }
      row.units.forEach((u, i) => { u.x = (fwd[i] + bwd[i]) / 2; });
      // The mean can still be too tight: a forward pass restores the gaps, a backward one keeps the row in the frame
      for (let i = 0; i < row.units.length; i++) {
        const a = row.units[i - 1], b = row.units[i];
        b.x = Math.max(b.x, a ? a.x + a.width / 2 + S.gap + b.width / 2 : b.width / 2);
      }
      for (let i = row.units.length - 1; i >= 0; i--) {
        const u = row.units[i], next = row.units[i + 1];
        const max = next ? next.x - next.width / 2 - S.gap - u.width / 2 : frame - u.width / 2;
        u.x = Math.min(u.x, max);
      }
    }
  }
  const minLeft = Math.min(...unitList.map((u) => u.x - u.width / 2));
  for (const u of unitList) u.x += S.margin - minLeft;
  const width = Math.max(...unitList.map((u) => u.x + u.width / 2), 0) + S.margin;

  // --- Routes. A line runs band by band: out of its element into the gap under (or over) its band, then through
  // the nearest gap between the elements of each band it crosses, into the gap next to its target's band and in.
  // Lines from one element of one type leave through one port and share their first run (a trunk); lines into one
  // element of one type share their last run and arrive at one port. First which gaps and lanes, then coordinates.
  type Side = "top" | "bottom";
  interface Plan {
    rel: ArchiRelationship; s: string; t: string; lifted: boolean; members: ArchiRelationship[]; rs: number; rt: number; sSide: Side; tSide: Side;
    channels: number[]; crossed: number[]; keys: string[];
  }
  // Links: each drawn relationship between the elements that stand for its ends (a folded container stands for
  // what it holds); one link per pair and type, holding every relationship it stands for
  interface Link { s: string; t: string; type: string; members: ArchiRelationship[]; lifted: boolean }
  let links2: Link[] = [];
  const linkKey = (s: string, t2: string, type: string) => `${s}>${t2}:${type}`;
  const byKey = new Map<string, Link>();
  const addLink = (l: Link) => {
    const k = linkKey(l.s, l.t, l.type);
    const known = byKey.get(k);
    if (known) { known.members.push(...l.members); known.lifted = true; return; }
    byKey.set(k, l);
    links2.push(l);
  };
  for (const r of relationships) {
    if (nested.has(r.id) || !byId.has(r.source) || !byId.has(r.target)) continue;
    const s = visibleOf(r.source), t2 = visibleOf(r.target);
    if (s === t2) continue;
    addLink({ s, t: t2, type: String(r.type ?? ""), members: [r], lifted: s !== r.source || t2 !== r.target });
  }

  // Nest relationships: innermost containers first, a relationship (type and other end) that more than half of a
  // container's children have becomes one line at the container; outer containers then see the inner ones
  if (opts.bundle ?? true) {
    const depthOf = (id: string) => { let d = 0; for (let q = parent.get(id); q !== undefined; q = parent.get(q)) d++; return d; };
    const shown = (id: string) => visibleOf(id) === id;
    const containersInside = [...children.keys()].filter((c) => shown(c) && !collapsed.has(c)).sort((a, b) => depthOf(b) - depthOf(a));
    for (const c of containersInside) {
      const kids = children.get(c) ?? [];
      if (kids.length < 2) continue;
      const kidOf = (id: string): string | null => {
        for (let q: string | undefined = id; q !== undefined; q = parent.get(q)) if (parent.get(q) === c) return q;
        return null;
      };
      const groups = new Map<string, { kids: Set<string>; links: Link[]; dir: "out" | "in"; other: string; type: string }>();
      for (const l of links2) {
        const sk = l.s === c ? null : kidOf(l.s), tk = l.t === c ? null : kidOf(l.t);
        if ((sk === null) === (tk === null)) continue; // both inside or both outside this container
        const dir = sk !== null ? "out" : "in";
        const other = dir === "out" ? l.t : l.s;
        if (other === c) continue;
        const k = `${dir}|${other}|${l.type}`;
        const g = groups.get(k) ?? groups.set(k, { kids: new Set(), links: [], dir, other, type: l.type }).get(k)!;
        g.kids.add((sk ?? tk)!);
        g.links.push(l);
      }
      for (const g of groups.values()) {
        if (g.kids.size / kids.length <= SHARED_SHARE) continue;
        const drop = new Set(g.links);
        links2 = links2.filter((l) => !drop.has(l));
        for (const l of g.links) byKey.delete(linkKey(l.s, l.t, l.type));
        addLink({
          s: g.dir === "out" ? c : g.other, t: g.dir === "out" ? g.other : c, type: g.type,
          members: g.links.flatMap((l) => l.members), lifted: true,
        });
      }
    }
  }

  const plans: Plan[] = [];
  for (const link of links2) {
    const { s, t: t2 } = link;
    const r = link.members[0];
    const rs = rowOf.get(topOf(s))!, rt = rowOf.get(topOf(t2))!;
    const down = rt > rs, up = rt < rs;
    const sSide: Side = up ? "top" : "bottom", tSide: Side = down ? "top" : "bottom";
    // Channel i is the gap under row i
    const channels: number[] = [], crossed: number[] = [];
    if (down) for (let c = rs; c < rt; c++) channels.push(c);
    else if (up) for (let c = rs - 1; c >= rt; c--) channels.push(c);
    else channels.push(rs);
    if (down) for (let q = rs + 1; q < rt; q++) crossed.push(q);
    if (up) for (let q = rs - 1; q > rt; q--) crossed.push(q);
    const keys = channels.map((_, k) => (k === 0 ? `s:${s}:${link.type}` : k === channels.length - 1 ? `t:${t2}:${link.type}` : `l:${plans.length}:${k}`));
    plans.push({ rel: r, s, t: t2, lifted: link.lifted, members: link.members, rs, rt, sSide, tSide, channels, crossed, keys });
  }

  // --- Horizontal first: the boxes' x (their y follows once the channels have their height), the ports, where a
  // line leaves a nested element's container, and the gaps it crosses bands through
  const box = new Map<string, Box>();
  const nodes = new Map<string, PlacedNode>();
  function place(id: string, left: number, top: number, depth: number) {
    const s = size.get(id)!;
    const kids = collapsed.has(id) ? [] : children.get(id) ?? [];
    nodes.set(id, {
      x: left + s.width / 2, y: top + s.height / 2, width: s.width, height: s.height,
      layer: String(byId.get(id)!.layer ?? "Other"), depth, parent: parent.get(id) ?? null,
      container: kids.length > 0, collapsed: collapsed.has(id) && (children.get(id) ?? []).length > 0, hidden: collapsed.has(id) ? descendants(id) : 0,
    });
    box.set(id, { x: left, y: top, width: s.width, height: s.height });
    for (const c of kids) place(c, left + rel.get(c)!.x, top + rel.get(c)!.y, depth + 1);
  }
  const placeAll = (tops: number[]) => rows.forEach((row, i) => { for (const u of row.units) place(u.id, u.x - u.width / 2, tops[i], 0); });
  placeAll(rows.map(() => 0));
  const centre = (id: string) => { const b = box.get(id)!; return b.x + b.width / 2; };

  // Ports: one per element, side, type and direction; spread along the side, ordered by where their lines go
  const portGroup = (p: Plan, end: "s" | "t") => (end === "s" ? `${p.s}:${p.sSide}:${p.rel.type}:out` : `${p.t}:${p.tSide}:${p.rel.type}:in`);
  const groups = new Map<string, { id: string; side: Side; plans: Plan[]; end: "s" | "t" }>();
  for (const p of plans) {
    for (const end of ["s", "t"] as const) {
      const g = portGroup(p, end);
      const id = end === "s" ? p.s : p.t, side = end === "s" ? p.sSide : p.tSide;
      (groups.get(g) ?? groups.set(g, { id, side, plans: [], end }).get(g)!).plans.push(p);
    }
  }
  const portX = new Map<string, number>();
  const bySide = new Map<string, string[]>();
  for (const [g, info] of groups) {
    const k = `${info.id}|${info.side}`;
    (bySide.get(k) ?? bySide.set(k, []).get(k)!).push(g);
  }
  for (const [k, list] of bySide) {
    const b = box.get(k.slice(0, k.lastIndexOf("|")))!;
    const towards = (g: string) => {
      const info = groups.get(g)!;
      return info.plans.reduce((s, p) => s + centre(info.end === "s" ? p.t : p.s), 0) / info.plans.length;
    };
    list.sort((a, b2) => towards(a) - towards(b2));
    const step = Math.min(16, (b.width - 20) / Math.max(1, list.length));
    list.forEach((g, i) => portX.set(g, b.x + b.width / 2 + (i - (list.length - 1) / 2) * step));
  }

  // A nested element's line leaves its outermost container through the container's side padding (towards the
  // other end), so it passes no sibling; a top-level element's line leaves at its port
  const padX = (id: string, towards: number) => {
    const b = box.get(id)!;
    const left = b.x + S.containerPad / 2, right = b.x + b.width - S.containerPad / 2;
    return Math.abs(towards - left) <= Math.abs(towards - right) ? left : right;
  };
  const exitX = (id: string, port: number, towards: number) => (topOf(id) === id ? port : padX(topOf(id), towards));

  // Gaps a line may cross a band through, with room for so many lines side by side (a full one spills over)
  interface Gap { x: number; half: number; used: number }
  const gapsOf: Gap[][] = rows.map((row) => {
    const list: Gap[] = [{ x: row.units[0].x - row.units[0].width / 2 - S.margin / 2, half: S.margin / 2, used: 0 }];
    for (let i = 1; i < row.units.length; i++) {
      const a = row.units[i - 1], b = row.units[i];
      const l = a.x + a.width / 2, r = b.x - b.width / 2;
      list.push({ x: (l + r) / 2, half: (r - l) / 2, used: 0 });
    }
    const last = row.units[row.units.length - 1];
    list.push({ x: last.x + last.width / 2 + S.margin / 2, half: S.margin / 2, used: 0 });
    return list;
  });
  const capacity = (g: Gap) => Math.max(1, Math.floor((2 * g.half - 2 * S.lane) / S.lane) + 1);
  // Where a band has room, a line goes straight on (or straight to its target's x); only an element in the way
  // sends it to the nearest gap that still has room
  const blocked = (row: number, x: number) => rows[row].units.some((u) => x > u.x - u.width / 2 - S.lane && x < u.x + u.width / 2 + S.lane);
  function crossAt(row: number, from: number, towards: number): number {
    if (!blocked(row, from)) return from;
    if (!blocked(row, towards)) return towards;
    const ranked = [...gapsOf[row]].sort((a, b) => Math.abs(a.x - from) + 0.5 * Math.abs(a.x - towards) - (Math.abs(b.x - from) + 0.5 * Math.abs(b.x - towards)));
    const g = ranked.find((c) => c.used < capacity(c)) ?? ranked[0];
    const n = g.used++;
    const offset = (n % 2 ? -1 : 1) * Math.ceil(n / 2) * S.lane;
    return g.x + Math.max(-(g.half - S.lane), Math.min(g.half - S.lane, offset));
  }

  // Each line's x: where it leaves, where it crosses each band, where it arrives
  const xsOf = new Map<Plan, number[]>();
  for (const p of plans) {
    const sx = portX.get(portGroup(p, "s"))!, tx = portX.get(portGroup(p, "t"))!;
    const ex = exitX(p.s, sx, tx), en = exitX(p.t, tx, ex);
    const xs = [ex];
    let cur = ex;
    for (const row of p.crossed) xs.push((cur = crossAt(row, cur, en)));
    xs.push(en);
    xsOf.set(p, xs);
  }

  // Lanes: a trunk (one element's lines of one type) is one run; runs that do not overlap share a lane
  const runsIn = new Map<number, Map<string, [number, number]>>();
  for (const p of plans) {
    const xs = xsOf.get(p)!;
    p.channels.forEach((c, k) => {
      const lo = Math.min(xs[k], xs[k + 1]), hi = Math.max(xs[k], xs[k + 1]);
      const byKey2 = runsIn.get(c) ?? runsIn.set(c, new Map()).get(c)!;
      const known = byKey2.get(p.keys[k]);
      byKey2.set(p.keys[k], known ? [Math.min(known[0], lo), Math.max(known[1], hi)] : [lo, hi]);
    });
  }
  const laneOf = new Map<string, number>();
  const laneCount = new Map<number, number>();
  for (const [c, byKey2] of runsIn) {
    const ends: number[] = [];
    for (const [key, [lo, hi]] of [...byKey2].sort((a, b) => a[1][0] - b[1][0])) {
      let lane = ends.findIndex((right) => right + 2 * S.lane < lo);
      if (lane < 0) { lane = ends.length; ends.push(hi); } else ends[lane] = hi;
      laneOf.set(`${c}|${key}`, lane);
    }
    laneCount.set(c, ends.length);
  }

  // --- Vertical: bands and channels (a channel holds its lanes), then the boxes at their height
  const channelHeight = (i: number) => Math.max(S.channel, ((laneCount.get(i) ?? 0) + 1) * S.lane + 12);
  const bands: Band[] = [];
  let y = S.margin;
  rows.forEach((row, i) => {
    if (i > 0 && rows[i - 1].layer !== row.layer) y += S.layerGap;
    row.top = y;
    const tallest = Math.max(...row.units.map((u) => u.height));
    row.height = (row.first ? S.bandLabel : 8) + tallest + S.bandPad;
    bands.push({ layer: row.layer, label: row.first ? row.label : "", y0: row.top, y1: row.top + row.height });
    y += row.height + channelHeight(i);
  });
  // The last channel only counts when lines run in it (between elements of the last band)
  const lastLanes = laneCount.get(rows.length - 1) ?? 0;
  const height = y - (lastLanes ? 0 : channelHeight(rows.length - 1)) + S.margin;
  placeAll(rows.map((row) => row.top + (row.first ? S.bandLabel : 8)));

  const laneY = (c: number, key: string) => rows[c].top + rows[c].height + 10 + (laneOf.get(`${c}|${key}`) ?? 0) * S.lane;
  const edgeY = (id: string, side: Side) => { const b = box.get(id)!; return side === "bottom" ? b.y + b.height : b.y; };
  // From an element's port to its outermost container's edge: down (or up) into the gap next to its row, along to
  // the container's padding, out; again for each container around it
  function escape(id: string, side: Side, port: number, towards: number): { x: number; y: number }[] {
    const pts = [{ x: port, y: edgeY(id, side) }];
    let cur = id, x = port;
    for (let up = parent.get(cur); up !== undefined; up = parent.get(cur)) {
      const cb = box.get(cur)!;
      const gy = side === "bottom" ? cb.y + cb.height + S.childGap / 2 : cb.y - S.childGap / 2;
      const px = padX(up, towards);
      pts.push({ x, y: gy }, { x: px, y: gy });
      x = px;
      cur = up;
    }
    if (cur !== id) pts.push({ x, y: edgeY(cur, side) });
    return pts;
  }

  const edges: RoutedEdge[] = plans.map((p) => {
    const xs = xsOf.get(p)!;
    const sx = portX.get(portGroup(p, "s"))!, tx = portX.get(portGroup(p, "t"))!;
    const pts = escape(p.s, p.sSide, sx, xs[xs.length - 1]);
    p.channels.forEach((c, k) => {
      const ly = laneY(c, p.keys[k]);
      pts.push({ x: xs[k], y: ly }, { x: xs[k + 1], y: ly });
    });
    pts.push(...escape(p.t, p.tSide, tx, xs[0]).reverse());
    return { points: simplify(pts), relationship: p.rel, source: p.s, target: p.t, members: p.members, lifted: p.lifted };
  });

  return { nodes, edges, bands, width, height, nested };
}

/** Drop repeated points and points in the middle of a straight run. */
function simplify(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const straight = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!straight) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** The least scale at which element labels (11px) read comfortably on screen */
export const READABLE_SCALE = 0.9;

/**
 * The view a diagram opens with in a `boxWidth` x `boxHeight` canvas: the whole diagram when it fits at a readable
 * scale, else a readable window at the top, centred across (pan or Fit for the rest). No box yet: the whole diagram.
 */
export function openView(width: number, height: number, boxWidth: number, boxHeight: number): Box {
  if (!(boxWidth > 0 && boxHeight > 0)) return { x: 0, y: 0, width, height };
  const fit = Math.min(boxWidth / width, boxHeight / height);
  if (fit >= READABLE_SCALE) return { x: 0, y: 0, width, height };
  const w = boxWidth / READABLE_SCALE, h = boxHeight / READABLE_SCALE;
  return { x: Math.max(0, (width - w) / 2), y: 0, width: w, height: h };
}
