// The vendored dagre (vendor/dagre.min.js) is inlined in front of the bundle by the Python side, so the bundle
// sees a module-scope `dagre` const. This declares the small part of its API the widget uses.

interface DagreNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DagreGraph {
  setGraph(options: Record<string, unknown>): void;
  setDefaultEdgeLabel(fn: () => Record<string, unknown>): void;
  setNode(id: string, label: Record<string, unknown>): void;
  setEdge(src: string, tgt: string, label: Record<string, unknown>, id?: string): void;
  graph(): { width?: number; height?: number };
  nodes(): string[];
  node(id: string): DagreNode;
}

declare const dagre: {
  graphlib: { Graph: new (options?: { multigraph?: boolean }) => DagreGraph };
  layout(graph: DagreGraph): void;
};
