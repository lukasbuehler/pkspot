import { inject, Injectable, LOCALE_ID } from "@angular/core";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import { SpotChallengeSchema } from "../../../../db/schemas/SpotChallengeSchema";
import { SpotChallenge } from "../../../../db/models/SpotChallenge";
import { Spot } from "../../../../db/models/Spot";
import { LocaleCode } from "../../../../db/models/Interfaces";
import { removeUndefinedProperties } from "../../../../scripts/Helpers";
import { ConsentAwareService } from "../../consent-aware.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class SpotChallengesService extends ConsentAwareService {
  private locale: LocaleCode = inject(LOCALE_ID);
  private _firestoreAdapter = inject(FirestoreAdapterService);

  constructor() {
    super();
  }

  getSpotChallengeData(
    spotId: SpotId,
    challengeId: string
  ): Promise<SpotChallengeSchema> {
    return this._firestoreAdapter
      .getDocument<SpotChallengeSchema & { id: string }>(
        `spots/${spotId}/challenges/${challengeId}`
      )
      .then((data) => {
        if (!data) {
          return Promise.reject("No challenge found for this challenge id.");
        }
        return data as SpotChallengeSchema;
      });
  }

  getSpotChallenge(spot: Spot, challengeId: string): Promise<SpotChallenge> {
    return this.getSpotChallengeData(spot.id, challengeId).then((data) => {
      return new SpotChallenge(challengeId, data, spot, this.locale);
    });
  }

  getAllChallengesForSpot(spot: Spot): Promise<SpotChallenge[]> {
    return this._firestoreAdapter
      .getCollection<SpotChallengeSchema & { id: string }>(
        `spots/${spot.id}/challenges`
      )
      .then((docs) => {
        if (docs.length === 0) {
          return [];
        }
        return docs.map<SpotChallenge>(
          (data) => new SpotChallenge(data.id, data, spot, this.locale)
        );
      });
  }

  addChallenge(
    spotId: SpotId,
    challengeData: SpotChallengeSchema
  ): Promise<string> {
    challengeData = removeUndefinedProperties(
      challengeData
    ) as SpotChallengeSchema;

    console.debug("adding challenge");

    return this._firestoreAdapter.addDocument(
      `spots/${spotId}/challenges`,
      challengeData
    );
  }

  updateChallenge(
    spotId: SpotId,
    challengeId: string,
    challengeData: Partial<SpotChallengeSchema>
  ) {
    challengeData = removeUndefinedProperties(challengeData);

    console.log("updating challenge", challengeId);

    return this._firestoreAdapter.updateDocument(
      `spots/${spotId}/challenges/${challengeId}`,
      challengeData
    );
  }
}
