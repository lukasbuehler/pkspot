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

@Injectable({
  providedIn: "root",
})
export class UsersService {
  constructor(private firestore: Firestore) {}

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
    return setDoc(doc(this.firestore, "users", userId), schema);
  }

  getUserById(userId: string): Observable<User | null> {
    return new Observable<User | null>((observer) => {
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
    });
  }

  updateUser(userId: string, _data: Partial<UserSchema>) {
    return updateDoc(doc(this.firestore, "users", userId), _data);
  }

  deleteUser() {
    // TODO
  }
}
