import { inject, Injectable } from "@angular/core";
import {
  Firestore,
  doc,
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  collectionGroup,
  updateDoc,
  onSnapshot,
} from "@angular/fire/firestore";
import { Observable } from "rxjs";
import { SpotEditSchema } from "../../../../db/schemas/SpotEditSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { removeUndefinedProperties } from "../../../../scripts/Helpers";

@Injectable({
  providedIn: "root",
})
export class SpotEditsService extends ConsentAwareService {
  private firestore: Firestore = inject(Firestore);

  constructor() {
    super();
  }

  getSpotEditById(spotId: string, editId: string): Promise<SpotEditSchema> {
    return getDoc(
      doc(this.firestore, "spots", spotId, "edits", editId)
    ).then((snap) => {
      if (!snap.exists()) {
        return Promise.reject("No edit found for this edit id.");
      }
      return snap.data() as SpotEditSchema;
    });
  }

  getSpotEditsBySpotId(spotId: string): Promise<SpotEditSchema[]> {
    console.log("getting all edits for a spot");
    return getDocs(
      query(collection(this.firestore, "spots", spotId, "edits"))
    ).then((snap) => {
      if (snap.size == 0) {
        return [];
      }
      return snap.docs.map((data) => data.data() as SpotEditSchema);
    });
  }

  getSpotEditsByUserId(userId: string): Promise<SpotEditSchema[]> {
    console.log("getting all edits for a user");
    return getDocs(
      query(
        collectionGroup(this.firestore, "edits"),
        where("user.uid", "==", userId)
      )
    ).then((snap) => {
      if (snap.size == 0) {
        return [];
      }
      return snap.docs.map((data) => data.data() as SpotEditSchema);
    });
  }

  getSpotEditById$(spotId: string, editId: string): Observable<SpotEditSchema> {
    console.debug("Getting edit with id: ", editId);

    return new Observable<SpotEditSchema>((observer) => {
      return onSnapshot(
        doc(this.firestore, "spots", spotId, "edits", editId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as SpotEditSchema;
            observer.next(data);
          } else {
            observer.error("No edit found for this edit id.");
          }
        },
        (error) => {
          observer.error({
            msg: "Error! There was a problem loading this edit.",
            debug: error,
          });
        }
      );
    });
  }

  getSpotEditsBySpotId$(spotId: string): Observable<SpotEditSchema[]> {
    console.debug("Getting all edits for spot: ", spotId);

    return new Observable<SpotEditSchema[]>((observer) => {
      return onSnapshot(
        query(collection(this.firestore, "spots", spotId, "edits")),
        (snap) => {
          const edits = snap.docs.map((data) => data.data() as SpotEditSchema);
          observer.next(edits);
        },
        (error) => {
          observer.error({
            msg: "Error! There was a problem loading edits for this spot.",
            debug: error,
          });
        }
      );
    });
  }

  getSpotEditsByUserId$(userId: string): Observable<SpotEditSchema[]> {
    console.debug("Getting all edits for user: ", userId);

    return new Observable<SpotEditSchema[]>((observer) => {
      return onSnapshot(
        query(
          collectionGroup(this.firestore, "edits"),
          where("user.uid", "==", userId)
        ),
        (snap) => {
          const edits = snap.docs.map((data) => data.data() as SpotEditSchema);
          observer.next(edits);
        },
        (error) => {
          observer.error({
            msg: "Error! There was a problem loading edits for this user.",
            debug: error,
          });
        }
      );
    });
  }

  addSpotEdit(spotId: string, edit: SpotEditSchema): Promise<string> {
    const cleanEdit = removeUndefinedProperties(edit) as SpotEditSchema;

    this.trackEventWithConsent("Add Spot Edit", {
      props: { spotId: spotId },
    });

    return addDoc(
      collection(this.firestore, "spots", spotId, "edits"),
      cleanEdit
    ).then((docRef) => {
      return docRef.id;
    });
  }

  updateSpotEdit(
    spotId: string,
    editId: string,
    editData: Partial<SpotEditSchema>
  ): Promise<void> {
    const cleanEditData = removeUndefinedProperties(editData);

    console.log("updating edit", editId);

    return updateDoc(
      doc(this.firestore, "spots", spotId, "edits", editId),
      cleanEditData
    );
  }

  approveSpotEdit(spotId: string, editId: string): Promise<void> {
    console.log("approving edit", editId);

    return updateDoc(
      doc(this.firestore, "spots", spotId, "edits", editId),
      { approved: true }
    );
  }

  rejectSpotEdit(spotId: string, editId: string): Promise<void> {
    console.log("rejecting edit", editId);

    return updateDoc(
      doc(this.firestore, "spots", spotId, "edits", editId),
      { approved: false }
    );
  }
}
