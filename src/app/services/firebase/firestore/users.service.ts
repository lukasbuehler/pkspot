import { inject, Injectable } from "@angular/core";
import { arrayRemove, arrayUnion } from "@angular/fire/firestore";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { User } from "../../../../db/models/User";
import {
  UserReferenceSchema,
  UserSchema,
} from "../../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { StorageImage } from "../../../../db/models/Media";
import { FirestoreAdapterService } from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class UsersService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

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
      this.executeWhenConsent(() => {
        const obs$ = this._firestoreAdapter
          .documentSnapshots<UserSchema & { id: string }>(`users/${userId}`)
          .pipe(map((d) => (d ? new User(d.id, d as UserSchema) : null)));
        const sub = obs$.subscribe({
          next: (v) => observer.next(v),
          error: (e) => observer.error(e),
        });
        return () => sub.unsubscribe();
      }).catch((error) => {
        observer.error(error);
      });
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
}
