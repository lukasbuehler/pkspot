import { Injectable } from "@angular/core";
import { normalizeRecentActivityMin30d } from "../../../../db/schemas/CheckInActivitySchema";

/** Presents the Spot/search projection without additional Firestore reads. */
@Injectable({ providedIn: "root" })
export class SpotActivityService {
  displayMin(_spotId: string | null, stored: unknown) {
    return normalizeRecentActivityMin30d(stored);
  }
}
