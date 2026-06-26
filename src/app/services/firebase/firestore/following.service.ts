import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { map, Observable, from, Subscription } from "rxjs";
import {
  FollowRequestDataSchema,
  FollowRequestSchema,
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
      let innerSub: Subscription | null = null;
      let isUnsubscribed = false;

      this.executeWhenConsent(() => {
        if (isUnsubscribed) return;

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

        innerSub = obs$.subscribe({
          next: (v) => obs.next(v),
          error: (e) => obs.error(e),
        });
      }).catch((error) => {
        if (!isUnsubscribed) {
          obs.error(error);
        }
      });

      return () => {
        isUnsubscribed = true;
        innerSub?.unsubscribe();
        innerSub = null;
      };
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

  hasPendingFollowRequest$(
    myUserId: string,
    otherUserId: string
  ): Observable<boolean> {
    return this._firestoreAdapter
      .documentSnapshots<{ id: string }>(
        `users/${otherUserId}/follow_requests/${myUserId}`
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
      start_following_raw_ms: Date.now(),
    };

    let followerData: FollowingDataSchema = {
      display_name: myUserData.display_name,
      start_following: new Timestamp(Date.now() / 1000, 0),
      start_following_raw_ms: Date.now(),
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

  requestToFollowUser(
    myUserId: string,
    myUserData: UserSchema,
    otherUserId: string
  ): Promise<void> {
    if (!myUserId) {
      return Promise.reject("Your User ID is empty");
    }
    if (!otherUserId) {
      return Promise.reject(
        "The User ID of the user you want to follow is empty"
      );
    }
    if (!myUserData || !myUserData.display_name) {
      return Promise.reject("Your user data is not valid");
    }

    const requestData: FollowRequestDataSchema = {
      display_name: myUserData.display_name,
      requested_at: new Timestamp(Date.now() / 1000, 0),
      requested_at_raw_ms: Date.now(),
    };

    return this._firestoreAdapter.setDocument(
      `users/${otherUserId}/follow_requests/${myUserId}`,
      requestData
    );
  }

  cancelFollowRequest(myUserId: string, otherUserId: string): Promise<void> {
    return this._firestoreAdapter.deleteDocument(
      `users/${otherUserId}/follow_requests/${myUserId}`
    );
  }

  approveFollowRequest(
    myUserId: string,
    myUserData: UserSchema,
    request: FollowRequestSchema
  ): Promise<void> {
    if (!myUserId || !request.uid) {
      return Promise.reject("The follow request is not valid");
    }
    if (!myUserData?.display_name) {
      return Promise.reject("Your user data is not valid");
    }

    const now = Date.now();
    const followingData: FollowingDataSchema = {
      display_name: myUserData.display_name,
      start_following: new Timestamp(now / 1000, 0),
      start_following_raw_ms: now,
    };
    const followerData: FollowingDataSchema = {
      display_name: request.display_name,
      start_following: new Timestamp(now / 1000, 0),
      start_following_raw_ms: now,
    };

    return this._firestoreAdapter
      .setDocument(`users/${request.uid}/following/${myUserId}`, followingData)
      .then(() =>
        this._firestoreAdapter.setDocument(
          `users/${myUserId}/followers/${request.uid}`,
          followerData
        )
      )
      .then(() => this.rejectFollowRequest(myUserId, request.uid));
  }

  rejectFollowRequest(myUserId: string, requesterId: string): Promise<void> {
    return this._firestoreAdapter.deleteDocument(
      `users/${myUserId}/follow_requests/${requesterId}`
    );
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
        // Prioritize raw milliseconds if available (fixes iOS bug)
        return users.sort((a, b) => {
          const timeA =
            a.start_following_raw_ms ??
            (((a.start_following as any)?.seconds ?? 0) * 1000);
          const timeB =
            b.start_following_raw_ms ??
            (((b.start_following as any)?.seconds ?? 0) * 1000);
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
        // Prioritize raw milliseconds if available (fixes iOS bug)
        return users.sort((a, b) => {
          const timeA =
            a.start_following_raw_ms ??
            (((a.start_following as any)?.seconds ?? 0) * 1000);
          const timeB =
            b.start_following_raw_ms ??
            (((b.start_following as any)?.seconds ?? 0) * 1000);
          return timeB - timeA;
        });
      })
    );
  }

  getFollowRequestsForUser(
    userId: string,
    chunkSize: number = 50
  ): Observable<FollowRequestSchema[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "limit", limit: chunkSize },
    ];

    return from(
      this._firestoreAdapter.getCollection<FollowRequestSchema & { id: string }>(
        `users/${userId}/follow_requests`,
        undefined,
        constraints
      )
    ).pipe(
      map((arr) =>
        arr
          .map((d) => ({
            ...(d as FollowRequestSchema),
            uid: d.id,
          }))
          .sort((a, b) => {
            const timeA =
              a.requested_at_raw_ms ??
              (((a.requested_at as any)?.seconds ?? 0) * 1000);
            const timeB =
              b.requested_at_raw_ms ??
              (((b.requested_at as any)?.seconds ?? 0) * 1000);
            return timeB - timeA;
          })
      )
    );
  }
}
