/** Expected unavailable content; distinguish it from backend/network failures. */
export class SpotLoadError extends Error {
  constructor(
    readonly spotId: string,
    readonly reason: "not_found" | "missing_location",
  ) {
    super(reason === "not_found"
      ? "Error! This Spot does not exist."
      : `Spot ${spotId} does not have a usable location yet.`);
    this.name = "SpotLoadError";
  }
}
