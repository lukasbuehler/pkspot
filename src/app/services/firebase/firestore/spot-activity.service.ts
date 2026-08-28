import { Injectable, inject } from "@angular/core";
import type { SpotActivityPublicSchema } from "../../../../db/schemas/CheckInActivitySchema";
import { FirestoreAdapterService } from "../firestore-adapter.service";

/** Reads the deliberately coarse, non-realtime public training signal for a Spot. */
@Injectable({ providedIn: "root" })
export class SpotActivityService {
  private readonly firestore = inject(FirestoreAdapterService);

  get(spotId: string): Promise<SpotActivityPublicSchema | null> {
    return this.firestore.getDocument<SpotActivityPublicSchema>(
      `spot_activity_public/${spotId}`,
    );
  }
}
