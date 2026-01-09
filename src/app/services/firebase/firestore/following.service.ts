import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { map, Observable } from "rxjs";
import {
  FollowingDataSchema,
  FollowingSchema,
  UserSchema,
} from "../../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
} from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class FollowingService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  constructor() {
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

        const obs$ = this._firestoreAdapter
          .documentSnapshots<{ id: string }>(
            `users/${myUserId}/following/${otherUserId}`
          )
          .pipe(map((d) => !!d));

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

    return this._firestoreAdapter
      .documentSnapshots<{ id: string }>(
        `users/${myUserId}/followers/${otherUserId}`
      )
      .pipe(map((d) => !!d));
  }

  getFollowingCount(userId: string): Promise<number> {
    return this._firestoreAdapter
      .getCollection<{ id: string }>(`users/${userId}/following`)
      .then((docs) => docs.length);
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

    // Note: We no longer store profile_picture here.
    // Profile picture URLs are derived from user IDs using getProfilePictureUrl().
    let followingData: FollowingDataSchema = {
      display_name: otherUserData.display_name,
      start_following: new Timestamp(Date.now() / 1000, 0),
    };
    let followerData: FollowingDataSchema = {
      display_name: myUserData.display_name,
      start_following: new Timestamp(Date.now() / 1000, 0),
    };
    return this._firestoreAdapter
      .setDocument(`users/${myUserId}/following/${otherUserId}`, followingData)
      .then(() => {
        return this._firestoreAdapter.setDocument(
          `users/${otherUserId}/followers/${myUserId}`,
          followerData
        );
      });
  }

  unfollowUser(myUserId: string, otherUserId: string) {
    return this._firestoreAdapter
      .deleteDocument(`users/${myUserId}/following/${otherUserId}`)
      .then(() => {
        return this._firestoreAdapter.deleteDocument(
          `users/${otherUserId}/followers/${myUserId}`
        );
      });
  }

  getFollowersOfUser(
    userId: string,
    chunkSize: number = 20
  ): Observable<FollowingSchema[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "orderBy", fieldPath: "start_following", direction: "desc" },
      { type: "limit", limit: chunkSize },
    ];

    return this._firestoreAdapter
      .collectionSnapshots<FollowingSchema & { id: string }>(
        `users/${userId}/followers`,
        undefined,
        constraints
      )
      .pipe(
        map((arr) => arr.map((d) => ({ ...(d as FollowingSchema), uid: d.id })))
      );
  }

  getFollowingsOfUser(
    userId: string,
    chunkSize: number = 20
  ): Observable<FollowingSchema[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "orderBy", fieldPath: "start_following", direction: "desc" },
      { type: "limit", limit: chunkSize },
    ];

    return this._firestoreAdapter
      .collectionSnapshots<FollowingSchema & { id: string }>(
        `users/${userId}/following`,
        undefined,
        constraints
      )
      .pipe(
        map((arr) => arr.map((d) => ({ ...(d as FollowingSchema), uid: d.id })))
      );
  }
}
