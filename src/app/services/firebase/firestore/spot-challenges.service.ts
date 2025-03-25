import { inject, Injectable } from "@angular/core";
import { Firestore } from "@angular/fire/firestore";
import { SpotId } from "../../../../db/models/Spot";
import { SpotChallengeSchema } from "../../../../db/schemas/SpotChallengeSchema";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "@firebase/firestore";

@Injectable({
  providedIn: "root",
})
export class SpotChallengesService {
  private _firestore: Firestore = inject<Firestore>(Firestore);

  constructor() {}

  getSpotChallenge(spotId: SpotId, challengeId: string) {
    return getDoc(
      doc(this._firestore, "spots", spotId, "challenges", challengeId)
    ).then((snap) => {
      if (!snap.exists()) {
        return Promise.reject("No challenge found for this challenge id.");
      }
      return snap.data() as SpotChallengeSchema;
    });
  }

  getAllChallengesForSpot(spotId: SpotId) {
    return getDocs(
      collection(this._firestore, "spots", spotId, "challenges")
    ).then((snap) => {
      if (snap.size == 0) {
        return [];
      }
      return snap.docs.map((data) => data.data() as SpotChallengeSchema);
    });
  }

  addChallenge(spotId: SpotId, challenge: SpotChallengeSchema) {
    return addDoc(
      collection(this._firestore, "spots", spotId, "challenges"),
      challenge
    );
  }

  updateChallenge(
    spotId: SpotId,
    challengeId: string,
    challenge: Partial<SpotChallengeSchema>
  ) {
    return updateDoc(
      doc(this._firestore, "spots", spotId, "challenges", challengeId),
      challenge
    );
  }
}
