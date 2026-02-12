import { inject, Injectable } from "@angular/core";
import { map, switchMap } from "rxjs/operators";
import { Observable, from, Subscription } from "rxjs";
import { User } from "../../../../db/models/User";
import {
  UserReferenceSchema,
  UserSchema,
} from "../../../../db/schemas/UserSchema";
import { CheckInSchema } from "../../../../db/schemas/CheckInSchema";
import { PrivateUserDataSchema } from "../../../../db/schemas/PrivateUserDataSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { StorageImage } from "../../../../db/models/Media";
import { FirestoreAdapterService } from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class UsersService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _privateDataDocId = "main";

  constructor() {
    super();
  }

  addUser(
    userId: string,
    display_name: string,
    data: UserSchema
  ): Promise<void> {
    let schema: UserSchema = {
      display_name: display_name,
      verified_email: false,
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
    console.debug("UsersService: Fetching user by ID:", userId);
    return new Observable<User | null>((observer) => {
      let innerSub: Subscription | null = null;
      let isUnsubscribed = false;

      this.executeWhenConsent(() => {
        if (isUnsubscribed) return;

        const obs$ = this._firestoreAdapter
          .documentSnapshots<UserSchema & { id: string }>(`users/${userId}`)
          .pipe(map((d) => (d ? new User(d.id, d as UserSchema) : null)));
        innerSub = obs$.subscribe({
          next: (v) => observer.next(v),
          error: (e) => observer.error(e),
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

  getUserRefernceById(
    userId: string
  ): Promise<UserReferenceSchema | null | undefined> {
    if (!userId) {
      return Promise.reject(new Error("User ID is required"));
    }

    return this.executeWhenConsent(() => {
      return this._firestoreAdapter.getDocument<UserSchema & { id: string }>(
        `users/${userId}`
      );
    }).then((data) => {
      if (data) {
        const userRef: UserReferenceSchema = {
          uid: data.id,
          display_name: data.display_name,
          profile_picture: data.profile_picture
            ? new StorageImage(data.profile_picture).getSrc(200)
            : undefined,
        };
        return userRef;
      }
      return null;
    });
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
