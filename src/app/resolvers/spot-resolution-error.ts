import type { Response } from "express";
import { SpotLoadError } from "../../db/models/SpotLoadError";

/** A missing document is an ordinary 404; incomplete data remains retryable. */
export function handleSpotResolutionError(error: unknown, response: Response | null): void {
  if (error instanceof SpotLoadError) {
    response?.status(error.reason === "not_found" ? 404 : 503);
    if (error.reason === "missing_location") {
      console.warn("Spot temporarily unavailable: missing location", { spotId: error.spotId });
    }
    return;
  }
  response?.status(500);
  console.error("Error resolving spot content:", error);
}
