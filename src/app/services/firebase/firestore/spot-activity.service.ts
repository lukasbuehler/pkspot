import { Injectable } from "@angular/core";
import { normalizeRecentActivityMin30d } from "../../../../db/schemas/CheckInActivitySchema";
import { environment } from "../../../../environments/environment.default";

/** Presents the Spot/search projection without additional Firestore reads. */
@Injectable({ providedIn: "root" })
export class SpotActivityService {
  displayMin(spotId: string | null, stored: unknown) {
    // TEMPORARY 1.2 Lindenhof preview. Remove before release; never persisted.
    if (!environment.production && spotId === "8CHFHRFUCozO9yeLEq6N") return 10;
    return normalizeRecentActivityMin30d(stored);
  }
}
