import { Injectable, inject } from "@angular/core";
import type { SpotActivityPublicSchema } from "../../../../db/schemas/CheckInActivitySchema";
import { environment } from "../../../../environments/environment.default";
import { FirestoreAdapterService } from "../firestore-adapter.service";

/** Reads the deliberately coarse, non-realtime public training signal for a Spot. */
@Injectable({ providedIn: "root" })
export class SpotActivityService {
  private readonly firestore = inject(FirestoreAdapterService);

  get(spotId: string): Promise<SpotActivityPublicSchema | null> {
    // TEMPORARY 1.2 preview. Remove after Lindenhof review; never write fake data
    // to Firebase. Release environment replacements disable this branch.
    if (!environment.production && spotId === "8CHFHRFUCozO9yeLEq6N") {
      return Promise.resolve({ status: "recently_trained", bucket: "10–24", window_days: 30 });
    }
    return this.firestore.getDocument<SpotActivityPublicSchema>(
      `spot_activity_public/${spotId}`,
    );
  }
}
