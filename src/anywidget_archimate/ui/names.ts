// Type names as the widget shows them (filter panel, element sublabel, tooltip, details): the layer prefix is
// dropped, since the layer already shows as the filter subheader, the band and the colour ("BusinessActor" is "Actor",
// "ApplicationComponent" is "Component"); types without one keep their full name, spaced ("SystemSoftware").

const LAYER_PREFIX = /^(Business|Application|Technology|Implementation)(?=[A-Z])/;

export function typeName(type: string | null | undefined): string {
  return String(type ?? "").replace(LAYER_PREFIX, "").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}
