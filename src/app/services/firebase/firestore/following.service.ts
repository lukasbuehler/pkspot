import { FeatureTelemetryService } from "../../feature-telemetry.service";
import { Injectable, inject } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import { map, Observable, from, of, Subscription } from "rxjs";
import { isLocalScreenshotRun } from "../../../shared/local-screenshot-run";
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
  private readonly telemetry = inject(FeatureTelemetryService);

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

  hasIncomingFollowRequest$(
    myUserId: string,
    otherUserId: string,
  ): Observable<boolean> {
    return this._firestoreAdapter
      .documentSnapshots<{ id: string }>(
        `users/${myUserId}/follow_requests/${otherUserId}`,
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
    return this.telemetry.run("following", "followUser", async () => {
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

    }, true);
  }

  requestToFollowUser(
    myUserId: string,
    myUserData: UserSchema,
    otherUserId: string
  ): Promise<void> {
    return this.telemetry.run("following", "requestToFollowUser", async () => {
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

    }, true);
  }

  cancelFollowRequest(myUserId: string, otherUserId: string): Promise<void> {
    return this.telemetry.run("following", "cancelFollowRequest", async () => {
      return this._firestoreAdapter.deleteDocument(
        `users/${otherUserId}/follow_requests/${myUserId}`
      );

    }, true);
  }

  approveFollowRequest(
    myUserId: string,
    myUserData: UserSchema,
    request: FollowRequestSchema
  ): Promise<void> {
    return this.telemetry.run("following", "approveFollowRequest", async () => {
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

    }, true);
  }

  rejectFollowRequest(myUserId: string, requesterId: string): Promise<void> {
    return this.telemetry.run("following", "rejectFollowRequest", async () => {
      return this._firestoreAdapter.deleteDocument(
        `users/${myUserId}/follow_requests/${requesterId}`
      );

    }, true);
  }

  unfollowUser(myUserId: string, otherUserId: string) {
    return this.telemetry.run("following", "unfollowUser", async () => {
      return this._firestoreAdapter
        .deleteDocument(`users/${myUserId}/following/${otherUserId}`)
        .then(() => {
          return this._firestoreAdapter.deleteDocument(
            `users/${otherUserId}/followers/${myUserId}`
          );
        });

    }, true);
  }

  /**
   * One page of a user's followers or followings, newest first within the
   * page. Pass the returned cursor to get the next page. Pages follow the
   * document order because legacy entries have no `start_following` to order
   * by, so a query ordered by date would leave them out.
   */
  getFollowPage(
    userId: string,
    type: "followers" | "following",
    chunkSize: number = 50,
    cursor: FollowPageCursor | null = null
  ): Observable<FollowPage> {
    const fixture = readScreenshotFollows(userId)?.[type];
    if (fixture) {
      const offset = typeof cursor === "number" ? cursor : 0;
      const end = offset + chunkSize;
      return of({
        users: fixture.slice(offset, end),
        cursor: end < fixture.length ? end : null,
      });
    }

    return from(
      this._firestoreAdapter.getCollectionWithMetadata<FollowingSchema>(
        `users/${userId}/${type}`,
        undefined,
        [{ type: "limit", limit: chunkSize }],
        cursor ?? undefined
      )
    ).pipe(
      map(({ data, lastDoc }) => ({
        users: sortNewestFollowFirst(
          data.map((d) => ({ ...(d as FollowingSchema), uid: d.id }))
        ),
        cursor: data.length < chunkSize ? null : (lastDoc as FollowPageCursor),
      }))
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

/** Opaque position after the last loaded follow entry. */
export type FollowPageCursor = unknown;

export interface FollowPage {
  users: FollowingSchema[];
  /** Null once the last page was loaded. */
  cursor: FollowPageCursor | null;
}

/** Newest first; prefers raw milliseconds, which iOS reads reliably. */
function sortNewestFollowFirst(users: FollowingSchema[]): FollowingSchema[] {
  const time = (user: FollowingSchema) =>
    user.start_following_raw_ms ??
    ((user.start_following as { seconds?: number } | undefined)?.seconds ?? 0) * 1000;
  return users.sort((a, b) => time(b) - time(a));
}

interface ScreenshotFollows {
  followers?: FollowingSchema[];
  following?: FollowingSchema[];
}

/**
 * Follow lists that local screenshot runs supply per user ID. Users without
 * an entry use the normal Firestore read.
 */
function readScreenshotFollows(userId: string): ScreenshotFollows | null {
  if (!isLocalScreenshotRun()) return null;
  return (
    (globalThis as typeof globalThis & {
      __PKSPOT_SCREENSHOT_FOLLOWS__?: Record<string, ScreenshotFollows>;
    }).__PKSPOT_SCREENSHOT_FOLLOWS__?.[userId] ?? null
  );
}
