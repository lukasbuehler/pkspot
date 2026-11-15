export type MapObjectMode = "all" | "spots" | "events" | "communities";

export interface MapObjectCounts {
  spots: number;
  events: number;
  communities: number;
}

/** A type chip in the map panel; "all" is the unselected state, not a chip. */
export interface MapObjectTypeChip {
  value: Exclude<MapObjectMode, "all">;
  label: string;
  /** Undefined until the map knows its viewport. */
  count?: number;
}
