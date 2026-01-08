import { inject, Injectable } from "@angular/core";
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
      return this._firestoreAdapter.updateDocument(`users/${userId}`, _data);
    });
  }

  deleteUser() {
    // TODO
  }
}
