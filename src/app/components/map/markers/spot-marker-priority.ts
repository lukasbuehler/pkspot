import {
  getSpotPriority,
  SpotPriorityInput,
} from "../../../../db/schemas/SpotPriority";

export function getSpotMarkerPriority(spot: SpotPriorityInput): number {
  return getSpotPriority(spot);
}
