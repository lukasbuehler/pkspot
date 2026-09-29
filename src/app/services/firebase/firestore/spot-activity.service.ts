import { Injectable, inject } from "@angular/core";
import type { SpotActivityPublicSchema } from "../../../../db/schemas/CheckInActivitySchema";
import { environment } from "../../../../environments/environment.default";
import { FirestoreAdapterService } from "../firestore-adapter.service";

/** Reads the deliberately coarse, non-realtime public training signal for a Spot. */
@Injectable({ providedIn: "root" })
export class SpotActivityService {
  private readonly firestore = inject(FirestoreAdapterService);

  // Share reads between visible cards and details. Daily aggregates need no live listener.
  private readonly cache = new Map<string, {expires: number; value: Promise<SpotActivityPublicSchema | null>}>();

  get(spotId: string): Promise<SpotActivityPublicSchema | null> {
    // TEMPORARY 1.2 preview. Remove after Lindenhof review; never write fake data
    // to Firebase. Release environment replacements disable this branch.
    if (!environment.production && spotId === "8CHFHRFUCozO9yeLEq6N") {
      return Promise.resolve({ status: "recently_trained", bucket: "10–24", window_days: 30 });
    }
    const cached = this.cache.get(spotId);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = this.firestore.getDocument<SpotActivityPublicSchema>(`spot_activity_public/${spotId}`)
      .catch(error => { this.cache.delete(spotId); throw error; });
    if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(spotId, {expires: Date.now() + 5 * 60_000, value});
    return value;
  }
}
