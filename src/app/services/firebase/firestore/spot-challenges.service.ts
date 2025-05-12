import { inject, Injectable, LOCALE_ID } from "@angular/core";
import { Firestore } from "@angular/fire/firestore";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import { SpotChallengeSchema } from "../../../../db/schemas/SpotChallengeSchema";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "@firebase/firestore";
import { SpotChallenge } from "../../../../db/models/SpotChallenge";
import { Spot } from "../../../../db/models/Spot";
import { LocaleCode } from "../../../../db/models/Interfaces";
import { removeUndefinedProperties } from "../../../../scripts/Helpers";

@Injectable({
  providedIn: "root",
})
export class SpotChallengesService {
  private locale: LocaleCode = inject(LOCALE_ID);
  private _firestore: Firestore = inject<Firestore>(Firestore);

  constructor() {}

  getSpotChallengeData(
    spotId: SpotId,
    challengeId: string
  ): Promise<SpotChallengeSchema> {
    return getDoc(
      doc(this._firestore, "spots", spotId, "challenges", challengeId)
    ).then((snap) => {
      if (!snap.exists()) {
        return Promise.reject("No challenge found for this challenge id.");
      }
      return snap.data() as SpotChallengeSchema;
    });
  }

  getSpotChallenge(spot: Spot, challengeId: string): Promise<SpotChallenge> {
    return this.getSpotChallengeData(spot.id, challengeId).then((data) => {
      return new SpotChallenge(challengeId, data, spot, this.locale);
    });
  }

  getAllChallengesForSpot(spotId: SpotId) {
    return getDocs(
      collection(this._firestore, "spots", spotId, "challenges")
    ).then((snap) => {
      if (snap.size == 0) {
        return [];
      }
      return snap.docs.map((data) => ({
        ...(data.data() as SpotChallengeSchema),
        id: data.id,
      }));
    });
  }

  addChallenge(
    spotId: SpotId,
    challengeData: SpotChallengeSchema
  ): Promise<any> {
    challengeData = removeUndefinedProperties(
      challengeData
    ) as SpotChallengeSchema;

    console.debug("adding challenge");

    return addDoc(
      collection(this._firestore, "spots", spotId, "challenges"),
      challengeData
    );
  }

  updateChallenge(
    spotId: SpotId,
    challengeId: string,
    challengeData: Partial<SpotChallengeSchema>
  ): Promise<void> {
    challengeData = removeUndefinedProperties(challengeData);

    console.log("updating challenge", challengeId);

    return updateDoc(
      doc(this._firestore, "spots", spotId, "challenges", challengeId),
      challengeData
    );
  }
}
