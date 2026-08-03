import { inject, Injectable } from "@angular/core";
import { map, switchMap } from "rxjs/operators";
import { Observable, from, of, Subscription } from "rxjs";
import { User } from "../../../../db/models/User";
import {
  AccessibleUserProfileSchema,
  PublicUserProfileSchema,
  UserReferenceSchema,
  UserSchema,
} from "../../../../db/schemas/UserSchema";
import { CheckInSchema } from "../../../../db/schemas/CheckInSchema";
import { PrivateUserDataSchema } from "../../../../db/schemas/PrivateUserDataSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_USER_PROFILES__?: Record<string, UserSchema>;
}

@Injectable({
  providedIn: "root",
})
export class UsersService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _functionsAdapter = inject(FunctionsAdapterService);
  private readonly _privateDataDocId = "main";

  constructor() {
    super();
  }

  addUser(
    userId: string,
    display_name: string,
    data: UserSchema
  ): Promise<void> {
    const schema: UserSchema = {
      display_name: display_name,
      verified_email: false,
      public_profile_enabled: false,
      public_search: false,
      ...data,
    };
    if (schema.start_date && !schema.start_date_raw_ms) {
      schema.start_date_raw_ms = schema.start_date.seconds * 1000;
    }
    return this.executeWithConsent(() => {
      return this._firestoreAdapter.setDocument(`users/${userId}`, schema);
    });
  }

  getUserById(userId: string): Observable<User | null> {
    const screenshotProfile = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_USER_PROFILES__?.[userId];
    if (screenshotProfile) {
      return of(new User(userId, screenshotProfile));
    }

    console.debug("UsersService: Fetching user by ID:", userId);
    return new Observable<User | null>((observer) => {
      let innerSub: Subscription | null = null;
      let isUnsubscribed = false;
      let hasFallenBackToHttp = false;

      this.executeWhenConsent(() => {
        if (isUnsubscribed) return;

        const obs$ = this._firestoreAdapter
          .documentSnapshots<UserSchema & { id: string }>(`users/${userId}`)
          .pipe(map((d) => (d ? new User(d.id, d as UserSchema) : null)));
        innerSub = obs$.subscribe({
          next: (v) => observer.next(v),
          error: (e) => {
            if (
              hasFallenBackToHttp ||
              !this._shouldFallbackToHttpUserFetch(e)
            ) {
              observer.error(e);
              return;
            }

            hasFallenBackToHttp = true;
            innerSub?.unsubscribe();
            innerSub = null;

            console.warn(
              "UsersService: Falling back to adapter-backed profile fetch after Firestore listener failure.",
              e
            );

            this.getUserByIdOnce(userId)
              .then((fallbackUser) => {
                if (!isUnsubscribed) {
                  observer.next(fallbackUser);
                }
              })
              .catch((fallbackError) => {
                if (!isUnsubscribed) {
                  observer.error(fallbackError);
                }
              });
          },
        });
      }).catch((error) => {
        if (!isUnsubscribed) {
          observer.error(error);
        }
      });

      return () => {
        isUnsubscribed = true;
        innerSub?.unsubscribe();
        innerSub = null;
      };
    });
  }

  private _shouldFallbackToHttpUserFetch(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? String((error as { code: string }).code)
        : "";

    return (
      message.includes("Expected type") ||
      code === "invalid-argument" ||
      code === "firestore/invalid-argument"
    );
  }

  async getUserByIdOnce(userId: string): Promise<User | null> {
    if (!userId) {
      return null;
    }

    try {
      const data = await this._firestoreAdapter.getDocument<
        UserSchema & { id: string }
      >(`users/${userId}`);
      if (!data) {
        return null;
      }

      return new User(data.id, data as UserSchema);
    } catch (error) {
      console.error("UsersService adapter-backed user fetch failed:", error);
      return null;
    }
  }

  async getAccessibleUserProfile(userId: string): Promise<User | null> {
    if (!userId) return null;

    try {
      const profile = await this.executeWhenConsent(() =>
        this._functionsAdapter.callPublic<
          { user_id: string },
          AccessibleUserProfileSchema & { uid: string }
        >("getUserProfile", { user_id: userId })
      );
      return new User(profile.uid, profile);
    } catch (error) {
      console.error("Accessible user profile fetch failed:", error);
      return null;
    }
  }

  async getPublicUserProfileByIdOnce(userId: string): Promise<User | null> {
    if (!userId) return null;

    try {
      const profile = await this.executeWhenConsent(() =>
        this._firestoreAdapter.getDocument<
          PublicUserProfileSchema & { id: string }
        >(`public_user_profiles/${userId}`)
      );
      return profile ? new User(profile.id, profile) : null;
    } catch (error) {
      console.error("Public user profile fetch failed:", error);
      return null;
    }
  }

  async getUserReferenceById(
    userId: string
  ): Promise<UserReferenceSchema | null> {
    const user = await this.getAccessibleUserProfile(userId);
    if (!user) return null;

    return {
      uid: user.uid,
      display_name: user.displayName || undefined,
      profile_picture: user.profilePicture?.getSrc(200),
    };
  }

  /** @deprecated Use getUserReferenceById. */
  getUserRefernceById(
    userId: string
  ): Promise<UserReferenceSchema | null | undefined> {
    if (!userId) {
      return Promise.reject(new Error("User ID is required"));
    }
    return this.getUserReferenceById(userId);
  }

  updateUser(userId: string, _data: Partial<UserSchema>) {
    return this.executeWithConsent(() => {
      if (_data.start_date && !_data.start_date_raw_ms) {
        _data.start_date_raw_ms = _data.start_date.seconds * 1000;
      }
      return this._firestoreAdapter.updateDocument(`users/${userId}`, _data);
    });
  }

  /**
   * Delete a user's document from Firestore.
   * This permanently removes all user profile data.
   */
  deleteUser(userId: string): Promise<void> {
    if (!userId) {
      return Promise.reject(new Error("User ID is required"));
    }

    return this.executeWithConsent(() => {
      return this._firestoreAdapter.deleteDocument(`users/${userId}`);
    });
  }

  async blockUser(myUserId: string, blockedUserId: string): Promise<void> {
    return this.executeWithConsent(async () => {
      // Use Read-Modify-Write to ensure compatibility with native platforms
      // where arrayUnion/arrayRemove might not be supported via the adapter bridge.
      const userDoc = await this._firestoreAdapter.getDocument<UserSchema>(
        `users/${myUserId}`
      );

      if (!userDoc) {
        throw new Error("User document not found");
      }

      const blockedUsers = userDoc.blocked_users || [];
      if (!blockedUsers.includes(blockedUserId)) {
        blockedUsers.push(blockedUserId);
        await this._firestoreAdapter.updateDocument(`users/${myUserId}`, {
          blocked_users: blockedUsers,
        } as Partial<UserSchema>);
      }
    });
  }

  async unblockUser(myUserId: string, blockedUserId: string): Promise<void> {
    return this.executeWithConsent(async () => {
      // Use Read-Modify-Write for native compatibility
      const userDoc = await this._firestoreAdapter.getDocument<UserSchema>(
        `users/${myUserId}`
      );

      if (!userDoc) {
        throw new Error("User document not found");
      }

      let blockedUsers = userDoc.blocked_users || [];
      if (blockedUsers.includes(blockedUserId)) {
        blockedUsers = blockedUsers.filter((id) => id !== blockedUserId);
        await this._firestoreAdapter.updateDocument(`users/${myUserId}`, {
          blocked_users: blockedUsers,
        } as Partial<UserSchema>);
      }
    });
  }

  async toggleBookmark(userId: string, spotId: string): Promise<void> {
    return this.updateSavedSpot(userId, spotId, undefined);
  }

  async updateSavedSpot(
    userId: string,
    spotId: string,
    isSaved?: boolean
  ): Promise<void> {
    return this._updatePrivateSpotList(userId, "bookmarks", spotId, isSaved);
  }

  async updateVisitedSpot(
    userId: string,
    spotId: string,
    isVisited?: boolean
  ): Promise<void> {
    return this._updatePrivateSpotList(
      userId,
      "visited_spots",
      spotId,
      isVisited
    );
  }

  private async _updatePrivateSpotList(
    userId: string,
    key: "bookmarks" | "visited_spots",
    spotId: string,
    nextState?: boolean
  ): Promise<void> {
    if (!userId) {
      throw new Error("User ID is required");
    }
    if (!spotId) {
      throw new Error("Spot ID is required");
    }

    return this.executeWithConsent(async () => {
      const privateDataRef = `users/${userId}/private_data/${this._privateDataDocId}`;
      const privateData =
        await this._firestoreAdapter.getDocument<PrivateUserDataSchema>(
          privateDataRef
        );

      let spotIds = privateData?.[key] || [];
      const currentlySet = spotIds.includes(spotId);
      const shouldBeSet =
        typeof nextState === "boolean" ? nextState : !currentlySet;

      if (shouldBeSet === currentlySet) {
        return;
      }

      spotIds = shouldBeSet
        ? [...spotIds, spotId]
        : spotIds.filter((id) => id !== spotId);

      // Use setDocument with merge to create if not exists
      await this._firestoreAdapter.setDocument(
        privateDataRef,
        { [key]: spotIds } as Partial<PrivateUserDataSchema>,
        { merge: true }
      );
    });
  }

  async updateEventRelationship(
    userId: string,
    eventId: string,
    relationship: "going" | "saved" | null
  ): Promise<void> {
    if (!userId) {
      throw new Error("User ID is required");
    }
    if (!eventId) {
      throw new Error("Event ID is required");
    }

    return this.executeWithConsent(async () => {
      const privateDataRef = `users/${userId}/private_data/${this._privateDataDocId}`;
      const privateData =
        await this._firestoreAdapter.getDocument<PrivateUserDataSchema>(
          privateDataRef
        );
      const withoutEvent = (ids: readonly string[] | undefined) =>
        (ids ?? []).filter((id) => id !== eventId);
      const goingEvents = withoutEvent(privateData?.going_events);
      const savedEvents = withoutEvent(privateData?.saved_events);

      if (relationship === "going") {
        goingEvents.push(eventId);
      } else if (relationship === "saved") {
        savedEvents.push(eventId);
      }

      await this._firestoreAdapter.setDocument(
        privateDataRef,
        {
          going_events: goingEvents,
          saved_events: savedEvents,
        } satisfies Partial<PrivateUserDataSchema>,
        { merge: true }
      );
    });
  }

  async addCheckIn(userId: string, data: CheckInSchema): Promise<void> {
    return this.executeWithConsent(async () => {
      await this._firestoreAdapter.addDocument(
        `users/${userId}/check_ins`,
        data
      );
    });
  }

  getCheckIns(userId: string): Observable<CheckInSchema[]> {
    return from(
      this.executeWhenConsent(() => {
        // Order by timestamp descending
        return this._firestoreAdapter.collectionSnapshots<CheckInSchema>(
          `users/${userId}/check_ins`,
          [],
          [{ type: "orderBy", fieldPath: "timestamp", direction: "desc" }]
        );
      })
    ).pipe(switchMap((obs) => obs));
  }

  /**
   * Get the private data for a user (bookmarks, visited_spots, settings).
   * Only accessible by the authenticated user themselves.
   */
  getPrivateData(userId: string): Observable<PrivateUserDataSchema | null> {
    return from(
      this.executeWhenConsent(() => {
        return this._firestoreAdapter.documentSnapshots<PrivateUserDataSchema>(
          `users/${userId}/private_data/${this._privateDataDocId}`
        );
      })
    ).pipe(switchMap((obs) => obs));
  }

  /**
   * Initialize private data for a new user with default settings.
   * Called when creating a new user account.
   */
  async initializePrivateData(
    userId: string,
    data: PrivateUserDataSchema
  ): Promise<void> {
    return this.executeWithConsent(async () => {
      await this._firestoreAdapter.setDocument(
        `users/${userId}/private_data/${this._privateDataDocId}`,
        data,
        { merge: true }
      );
    });
  }

  /**
   * Update private user data (settings, bookmarks, etc.).
   * Only accessible by the authenticated user themselves.
   */
  async updatePrivateData(
    userId: string,
    data: Partial<PrivateUserDataSchema>
  ): Promise<void> {
    return this.executeWithConsent(async () => {
      await this._firestoreAdapter.setDocument(
        `users/${userId}/private_data/${this._privateDataDocId}`,
        data,
        { merge: true }
      );
    });
  }
}
