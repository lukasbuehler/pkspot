import { Injectable } from "@angular/core";
import {
  Firestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "@angular/fire/firestore";
import { Observable } from "rxjs";
import { User } from "../../../../db/models/User";
import { UserSchema } from "../../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class UsersService extends ConsentAwareService {
  constructor(private firestore: Firestore) {
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
      return setDoc(doc(this.firestore, "users", userId), schema);
    });
  }

  getUserById(userId: string): Observable<User | null> {
    return new Observable<User | null>((observer) => {
      // Wait for consent before making Firestore calls
      this.executeWhenConsent(() => {
        return onSnapshot(
          doc(this.firestore, "users", userId),
          (snap) => {
            if (snap.exists()) {
              let user = new User(snap.id, snap.data() as UserSchema);
              observer.next(user);
            } else {
              observer.next(null);
            }
          },
          (err) => {
            observer.error(err);
          }
        );
      }).catch((error) => {
        observer.error(error);
      });
    });
  }

  updateUser(userId: string, _data: Partial<UserSchema>) {
    return this.executeWithConsent(() => {
      return updateDoc(doc(this.firestore, "users", userId), _data);
    });
  }

  deleteUser() {
    // TODO
  }
}
