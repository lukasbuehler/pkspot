import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { map, Observable, from } from "rxjs";
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
import { Capacitor } from "@capacitor/core";

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
    chunkSize: number = 50
  ): Observable<FollowingSchema[]> {
    console.log(`Fetching followers for userId: ${userId} (one-time)`);
    const constraints: QueryConstraintOptions[] = [
      // { type: "orderBy", fieldPath: "start_following", direction: "desc" }, // Removed to include legacy docs
      { type: "limit", limit: chunkSize },
    ];
    console.log(
      "DEBUG: getFollowersOfUser constraints",
      JSON.stringify(constraints)
    );

    // Use one-time fetch to avoid Android persistent cache issues
    return from(
      this._firestoreAdapter.getCollection<FollowingSchema & { id: string }>(
        `users/${userId}/followers`,
        undefined,
        constraints
      )
    ).pipe(
      map((arr) => {
        const users = arr.map((d) => {
          // Debug check for iOS timestamps
          // if (d.start_following === undefined) console.log('Follower missing timestamp:', JSON.stringify(d));
          return {
            ...(d as FollowingSchema),
            uid: d.id,
          };
        });
        // Client-side sort: Newest first, then those without timestamp
        return users.sort((a, b) => {
          const timeA = (a.start_following as any)?.seconds ?? 0;
          const timeB = (b.start_following as any)?.seconds ?? 0;
          return timeB - timeA;
        });
      })
    );
  }

  getFollowingsOfUser(
    userId: string,
    chunkSize: number = 50
  ): Observable<FollowingSchema[]> {
    console.log(`Fetching following for userId: ${userId} (one-time)`);
    const constraints: QueryConstraintOptions[] = [
      // { type: "orderBy", fieldPath: "start_following", direction: "desc" }, // Removed to include legacy docs
      { type: "limit", limit: chunkSize },
    ];
    console.log(
      "DEBUG: getFollowingsOfUser constraints",
      JSON.stringify(constraints)
    );

    // Use one-time fetch to avoid Android persistent cache issues
    return from(
      this._firestoreAdapter.getCollection<FollowingSchema & { id: string }>(
        `users/${userId}/following`,
        undefined,
        constraints
      )
    ).pipe(
      map((arr) => {
        const users = arr.map((d) => {
          if (Capacitor.getPlatform() === "ios") {
            console.log("iOS Following JSON:", JSON.stringify(d));
          }
          return {
            ...(d as FollowingSchema),
            uid: d.id,
          };
        });
        // Client-side sort: Newest first, then those without timestamp
        return users.sort((a, b) => {
          const timeA = (a.start_following as any)?.seconds ?? 0;
          const timeB = (b.start_following as any)?.seconds ?? 0;
          return timeB - timeA;
        });
      })
    );
  }
}
