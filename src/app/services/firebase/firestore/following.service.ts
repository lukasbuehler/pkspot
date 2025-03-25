import { Injectable } from "@angular/core";
import {
  Firestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "@angular/fire/firestore";
import { Observable } from "rxjs";
import { Timestamp } from "@firebase/firestore";
import {
  FollowingDataSchema,
  FollowingSchema,
  UserSchema,
} from "../../../../db/schemas/UserSchema";

@Injectable({
  providedIn: "root",
})
export class FollowingService {
  constructor(private firestore: Firestore) {}

  isFollowingUser(myUserId: string, otherUserId: string): Observable<boolean> {
    return new Observable<boolean>((obs) => {
      return onSnapshot(
        doc(this.firestore, "users", myUserId, "following", otherUserId),
        (snap) => {
          if (snap.exists()) {
            obs.next(true);
          } else {
            obs.next(false);
          }
        },
        (err) => {
          obs.error(err);
        }
      );
    });
  }

  userIsFollowingYou(
    myUserId: string,
    otherUserId: string
  ): Observable<boolean> {
    return new Observable<boolean>((obs) => {
      return onSnapshot(
        doc(this.firestore, "users", myUserId, "followers", otherUserId),
        (snap) => {
          if (snap.exists()) {
            obs.next(true);
          } else {
            obs.next(false);
          }
        },
        (err) => {
          obs.error(err);
        }
      );
    });
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

    let followingData: FollowingDataSchema = {
      display_name: otherUserData.display_name,
      profile_picture: otherUserData.profile_picture || "",
      start_following: new Timestamp(Date.now() / 1000, 0),
    };
    let followerData: FollowingDataSchema = {
      display_name: myUserData.display_name,
      profile_picture: myUserData.profile_picture,
      start_following: new Timestamp(Date.now() / 1000, 0),
    };
    return setDoc(
      doc(this.firestore, "users", myUserId, "following", otherUserId),
      followingData
    ).then(() => {
      return setDoc(
        doc(this.firestore, "users", otherUserId, "followers", myUserId),
        followerData
      );
    });
  }

  unfollowUser(myUserId: string, otherUserId: string) {
    return deleteDoc(
      doc(this.firestore, "users", myUserId, "following", otherUserId)
    ).then(() => {
      return deleteDoc(
        doc(this.firestore, "users", otherUserId, "followers", myUserId)
      );
    });
  }

  getFollowersOfUser(
    userId: string,
    chunkSize: number = 20
  ): Observable<FollowingSchema[]> {
    return new Observable<FollowingSchema[]>((obs) => {
      return onSnapshot(
        query(
          collection(this.firestore, `users/${userId}/followers`),
          orderBy("start_following", "desc"),
          limit(chunkSize)
        ),
        (snap) => {
          const followers = snap.docs.map((doc) => {
            const data = doc.data() as FollowingSchema;
            return {
              ...data,
              uid: doc.id,
            };
          });
          obs.next(followers);
        },
        (err) => {
          obs.error(err);
        }
      );
    });
  }

  getFollowingsOfUser(
    userId: string,
    chunkSize: number = 20
  ): Observable<FollowingSchema[]> {
    return new Observable<FollowingSchema[]>((obs) => {
      return onSnapshot(
        query(
          collection(this.firestore, `users/${userId}/following`),
          orderBy("start_following", "desc"),
          limit(chunkSize)
        ),
        (snap) => {
          const followers = snap.docs.map((doc) => {
            const data = doc.data() as FollowingSchema;
            return {
              ...data,
              uid: doc.id,
            };
          });
          obs.next(followers);
        },
        (err) => {
          obs.error(err);
        }
      );
    });
  }
}
