import {
  inject,
  Injectable,
  LOCALE_ID,
  runInInjectionContext,
} from "@angular/core";
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
} from "firebase/firestore";
import { SpotChallenge } from "../../../../db/models/SpotChallenge";
import { Spot } from "../../../../db/models/Spot";
import { LocaleCode } from "../../../../db/models/Interfaces";
import { removeUndefinedProperties } from "../../../../scripts/Helpers";
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class SpotChallengesService extends ConsentAwareService {
  private locale: LocaleCode = inject(LOCALE_ID);
  private _firestore: Firestore = inject<Firestore>(Firestore);

  constructor() {
    super();
  }

  getSpotChallengeData(
    spotId: SpotId,
    challengeId: string
  ): Promise<SpotChallengeSchema> {
    return runInInjectionContext(this.injector, () => {
      return getDoc(
        doc(this._firestore, "spots", spotId, "challenges", challengeId)
      );
    }).then((snap) => {
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

  getAllChallengesForSpot(spot: Spot): Promise<SpotChallenge[]> {
    return runInInjectionContext(this.injector, () =>
      getDocs(collection(this._firestore, "spots", spot.id, "challenges"))
    )
      .then((snap) => {
        if (snap.size == 0) {
          return [];
        }
        return snap.docs.map((data) => ({
          ...(data.data() as SpotChallengeSchema),
          id: data.id,
        }));
      })
      .then((dataArr: (SpotChallengeSchema & { id: string })[]) => {
        return dataArr.map<SpotChallenge>(
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

    return runInInjectionContext(this.injector, () =>
      addDoc(
        collection(this._firestore, "spots", spotId, "challenges"),
        challengeData
      )
    ).then((docRef) => {
      return docRef.id;
    });
  }

  updateChallenge(
    spotId: SpotId,
    challengeId: string,
    challengeData: Partial<SpotChallengeSchema>
  ) {
    challengeData = removeUndefinedProperties(challengeData);

    console.log("updating challenge", challengeId);

    return runInInjectionContext(this.injector, () =>
      updateDoc(
        doc(this._firestore, "spots", spotId, "challenges", challengeId),
        challengeData
      )
    );
  }
}
