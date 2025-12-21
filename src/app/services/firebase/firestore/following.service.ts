import { Injectable } from "@angular/core";
import {
  Firestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  collectionData,
  docData,
  query,
  orderBy,
  limit,
} from "@angular/fire/firestore";
import { map, Observable } from "rxjs";
import { Timestamp } from "firebase/firestore";
import {
  FollowingDataSchema,
  FollowingSchema,
  UserSchema,
} from "../../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class FollowingService extends ConsentAwareService {
  constructor(private firestore: Firestore) {
    super();
  }

  isFollowingUser$(myUserId: string, otherUserId: string): Observable<boolean> {
    return new Observable<boolean>((obs) => {
      this.executeWhenConsent(() => {
        console.debug(
          "FollowingService: Checking if user",
          myUserId,
          "is following user",
          otherUserId
        );

        const obs$ = docData(
          doc(this.firestore, "users", myUserId, "following", otherUserId),
          { idField: "id" }
        ).pipe(map((d) => !!d));

        const sub = obs$.subscribe({
          next: (v) => obs.next(v),
          error: (e) => obs.error(e),
        });
        return () => sub.unsubscribe();
      }).catch((error) => {
        obs.error(error);
      });
    });
  }

  userIsFollowingYou$(
    myUserId: string,
    otherUserId: string
  ): Observable<boolean> {
    console.debug(
      "FollowingService: Checking if user",
      otherUserId,
      "is following user",
      myUserId
    );

    return docData(
      doc(this.firestore, "users", myUserId, "followers", otherUserId),
      { idField: "id" }
    ).pipe(map((d) => !!d));
  }

  followUser(
    myUserId: string,
    myUserData: UserSchema,
    otherUserId: string,
    otherUserData: UserSchema
  ): Promise<void> {
    if (!myUserId) {
      return Promise.reject("Your User ID is empty");
    }
    if (!otherUserId) {
      return Promise.reject(
        "The User ID of the user you want to follow is empty"
      );
    }
    if (!otherUserData || !otherUserData.display_name) {
      return Promise.reject(
        "The User data of the user you want to follow is not valid"
      );
    }

    let followingData: FollowingDataSchema = {
      display_name: otherUserData.display_name,
      profile_picture: otherUserData.profile_picture || "",
      start_following: new Timestamp(Date.now() / 1000, 0),
    };
    let followerData: FollowingDataSchema = {
      display_name: myUserData.display_name,
      profile_picture: myUserData.profile_picture,
      start_following: new Timestamp(Date.now() / 1000, 0),
    };
    return setDoc(
      doc(this.firestore, "users", myUserId, "following", otherUserId),
      followingData
    ).then(() => {
      return setDoc(
        doc(this.firestore, "users", otherUserId, "followers", myUserId),
        followerData
      );
    });
  }

  unfollowUser(myUserId: string, otherUserId: string) {
    return deleteDoc(
      doc(this.firestore, "users", myUserId, "following", otherUserId)
    ).then(() => {
      return deleteDoc(
        doc(this.firestore, "users", otherUserId, "followers", myUserId)
      );
    });
  }

  getFollowersOfUser(
    userId: string,
    chunkSize: number = 20
  ): Observable<FollowingSchema[]> {
    return collectionData(
      query(
        collection(this.firestore, `users/${userId}/followers`),
        orderBy("start_following", "desc"),
        limit(chunkSize)
      ),
      { idField: "uid" }
    ).pipe(
      map((arr: any[]) =>
        arr.map((d) => ({ ...(d as FollowingSchema), uid: (d as any).uid }))
      )
    );
  }

  getFollowingsOfUser(
    userId: string,
    chunkSize: number = 20
  ): Observable<FollowingSchema[]> {
    return collectionData(
      query(
        collection(this.firestore, `users/${userId}/following`),
        orderBy("start_following", "desc"),
        limit(chunkSize)
      ),
      { idField: "uid" }
    ).pipe(
      map((arr: any[]) =>
        arr.map((d) => ({ ...(d as FollowingSchema), uid: (d as any).uid }))
      )
    );
  }
}
