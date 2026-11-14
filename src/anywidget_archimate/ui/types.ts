// Shared types for the widget's front end: the anywidget model contract and the synced trait shapes.

/** The anywidget model contract (a host may provide exactly this, like the jsdom tests do). */
export interface WidgetModel {
  get(key: string): any;
  set(key: string, value: any): void;
  save_changes(): void;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
}

/** A synced ArchiMate element (the `elements` trait). Extra keys pass through untouched. */
export interface ArchiElement {
  id: string;
  name?: string;
  type?: string;
  layer?: string;
  status?: string | null;
  badge?: unknown;
  documentation?: string;
  [key: string]: unknown;
}

/** A synced ArchiMate relationship (the `relationships` trait). */
export interface ArchiRelationship {
  id: string;
  source: string;
  target: string;
  type?: string;
  name?: string;
  status?: string | null;
  [key: string]: unknown;
}

/** A placed node (the earlier layout shape; layout.ts PlacedNode is what the diagram draws). */
export interface NodePos {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: string;
  _isParent?: boolean;
  _isChild?: boolean;
}

export interface EdgeInfo {
  points: { x: number; y: number }[];
  relationship: ArchiRelationship;
}

export interface Layout {
  nodes: Map<string, NodePos>;
  edges: EdgeInfo[];
  width: number;
  height: number;
}
