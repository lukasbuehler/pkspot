import { Injectable } from "@angular/core";
import {
  Firestore,
  doc,
  addDoc,
  collection,
  onSnapshot,
  DocumentChangeType,
  where,
  query,
  orderBy,
  limit,
  deleteDoc,
  setDoc,
} from "@angular/fire/firestore";
import { Observable } from "rxjs";
import { Post } from "../../../../db/models/Post";
import { Spot } from "../../../../db/models/Spot";
import { LikeSchema } from "../../../../db/schemas/LikeSchema";
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class PostsService extends ConsentAwareService {
  constructor(private firestore: Firestore) {
    super();
  }

  docRef(path: string) {
    return doc(this.firestore, path);
  }

  addPost(newPost: Post.Schema) {
    let postsCollectionRef = collection(this.firestore, "posts");
    addDoc(postsCollectionRef, newPost)
      .then((docRef) => {
        console.log("Post Document written with ID: " + docRef.id);
      })
      .catch((error) => {
        console.error("Error adding Post Document: ", error);
        console.log(newPost);
      });
  }

  getPostUpdates(
    userId: string
  ): Observable<{ type: DocumentChangeType; post: Post.Class }[]> {
    /**
     * 1) Get all followings of the currently authenticated user
     * 2) Make multiple arrays of fixed size with all the followings
     * 3) Call all the observables to those batches of 10 users with in queries for posts with pagination.
     * 4) Construct one giant observable with all those listeners
     * 5) Return that
     */

    // TODO

    return new Observable<{ type: DocumentChangeType; post: Post.Class }[]>(
      (obs) => {}
    );
  }

  getTodaysTopPosts(): Observable<any> {
    const twentyFourHoursInMilliSeconds = 24 * 60 * 60 * 1000;
    const yesterday = new Date(Date.now() - twentyFourHoursInMilliSeconds);

    return new Observable<any>((observer) => {
      return onSnapshot(
        query(
          collection(this.firestore, "posts"),
          orderBy("like_count", "desc"),
          orderBy("time_posted", "desc"),
          limit(10) // TODO pagination
        ),
        (querySnapshot) => {
          const postSchemasMap: any = {};
          querySnapshot.forEach((doc) => {
            const id = doc.id;
            postSchemasMap[id] = doc.data();
          });
          observer.next(postSchemasMap);
        },
        (err) => {
          observer.error(err);
        }
      );
    });
  }

  getPostsFromSpot(spot: Spot): Observable<Post.Schema> {
    return new Observable<Post.Schema>((observer) => {
      return onSnapshot(
        query(
          collection(this.firestore, "posts"),
          where("spot.ref", "==", this.docRef("spots/" + spot.id)),
          limit(10)
        ),
        (querySnapshot) => {
          let postSchemasMap: any = {};
          querySnapshot.forEach((doc) => {
            const id = doc.id;
            postSchemasMap[id] = doc.data();
          });
          observer.next(postSchemasMap);
        },
        (error) => {
          observer.error(error);
        }
      );
    });
  }

  getPostsFromUser(userId: string): Observable<Record<string, Post.Schema>> {
    return new Observable<Record<string, Post.Schema>>((observer) => {
      // Wait for consent before making Firestore calls
      this.executeWhenConsent(() => {
        return onSnapshot(
          query(
            collection(this.firestore, "posts"),
            where("user.uid", "==", userId),
            limit(10)
          ),
          (querySnapshot) => {
            let postSchemasMap: any = {};
            querySnapshot.forEach((doc) => {
              const id = doc.id;
              postSchemasMap[id] = doc.data();
            });
            observer.next(postSchemasMap);
          },
          (error) => {
            observer.error(error);
          }
        );
      }).catch((error) => {
        observer.error(error);
      });
    });
  }

  deletePost(postId: string): Promise<void> {
    if (!postId) {
      return Promise.reject("The post ID is empty");
    }
    return deleteDoc(doc(this.firestore, "posts", postId));
  }

  userHasLikedPost(postId: string, userId: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      return onSnapshot(
        doc(this.firestore, `posts/${postId}/likes/${userId}`),
        (snap) => {
          if (snap.exists()) {
            resolve(true);
          } else {
            resolve(false);
          }
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  addLike(postId: string, userUID: string, newLike: LikeSchema): Promise<void> {
    if (userUID !== newLike.user.uid) {
      return Promise.reject("The User ID and User ID on the like don't match!");
    }
    return setDoc(
      doc(this.firestore, `posts/${postId}/likes/${userUID}`),
      newLike
    );
  }

  removeLike(postId: string, userUID: string): Promise<void> {
    return deleteDoc(doc(this.firestore, `posts/${postId}/likes/${userUID}`));
  }
}
