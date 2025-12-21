import { Injectable } from "@angular/core";
import {
  Firestore,
  doc,
  addDoc,
  collection,
  collectionData,
  DocumentChangeType,
  where,
  query,
  orderBy,
  limit,
  deleteDoc,
  setDoc,
  getDoc,
} from "@angular/fire/firestore";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
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

    return collectionData(
      query(
        collection(this.firestore, "posts"),
        orderBy("like_count", "desc"),
        orderBy("time_posted", "desc"),
        limit(10)
      ),
      { idField: "id" }
    ).pipe(
      map((arr: any[]) => {
        const postSchemasMap: any = {};
        arr.forEach((doc) => {
          postSchemasMap[doc.id] = doc;
        });
        return postSchemasMap;
      })
    );
  }

  getPostsFromSpot(spot: Spot): Observable<Post.Schema> {
    return collectionData(
      query(
        collection(this.firestore, "posts"),
        where("spot.ref", "==", this.docRef("spots/" + spot.id)),
        limit(10)
      ),
      { idField: "id" }
    ).pipe(
      map((arr: any[]) => {
        const postSchemasMap: any = {};
        arr.forEach((doc) => {
          postSchemasMap[doc.id] = doc;
        });
        return postSchemasMap;
      })
    );
  }

  getPostsFromUser(userId: string): Observable<Record<string, Post.Schema>> {
    // Wait for consent before making Firestore calls
    return new Observable<Record<string, Post.Schema>>((observer) => {
      this.executeWhenConsent(() => {
        const obs$ = collectionData(
          query(
            collection(this.firestore, "posts"),
            where("user.uid", "==", userId),
            limit(10)
          ),
          { idField: "id" }
        ).pipe(
          map((arr: any[]) => {
            const postSchemasMap: any = {};
            arr.forEach((doc) => {
              postSchemasMap[doc.id] = doc;
            });
            return postSchemasMap;
          })
        );

        const sub = obs$.subscribe({
          next: (v) => observer.next(v as Record<string, Post.Schema>),
          error: (e) => observer.error(e),
        });

        return () => sub.unsubscribe();
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
      // Use a single-shot getDoc instead of a listener
      getDoc(doc(this.firestore, `posts/${postId}/likes/${userId}`))
        .then((snap) => {
          resolve((snap as any)?.exists ? (snap as any).exists() : !!snap);
        })
        .catch((err) => reject(err));
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
