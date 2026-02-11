import { Injectable, inject } from "@angular/core";
import { Firestore, doc } from "@angular/fire/firestore";
import { Observable, from, Subscription } from "rxjs";
import { map } from "rxjs/operators";
import { Post } from "../../../../db/models/Post";
import { Spot } from "../../../../db/models/Spot";
import { LikeSchema } from "../../../../db/schemas/LikeSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  FirestoreAdapterService,
  QueryFilter,
  QueryConstraintOptions,
} from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class PostsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private firestore = inject(Firestore);

  constructor() {
    super();
  }

  docRef(path: string) {
    return doc(this.firestore, path);
  }

  addPost(newPost: Post.Schema) {
    this._firestoreAdapter
      .addDocument("posts", newPost)
      .then((docId) => {
        console.log("Post Document written with ID: " + docId);
      })
      .catch((error) => {
        console.error("Error adding Post Document: ", error);
        console.log(newPost);
      });
  }

  getPostUpdates(
    userId: string
  ): Observable<
    { type: "added" | "modified" | "removed"; post: Post.Class }[]
  > {
    /**
     * 1) Get all followings of the currently authenticated user
     * 2) Make multiple arrays of fixed size with all the followings
     * 3) Call all the observables to those batches of 10 users with in queries for posts with pagination.
     * 4) Construct one giant observable with all those listeners
     * 5) Return that
     */

    // TODO

    return new Observable<
      { type: "added" | "modified" | "removed"; post: Post.Class }[]
    >((obs) => {});
  }

  getTodaysTopPosts(): Observable<any> {
    const constraints: QueryConstraintOptions[] = [
      { type: "orderBy", fieldPath: "like_count", direction: "desc" },
      { type: "orderBy", fieldPath: "time_posted", direction: "desc" },
      { type: "limit", limit: 10 },
    ];

    return this._firestoreAdapter
      .collectionSnapshots<Post.Schema & { id: string }>(
        "posts",
        undefined,
        constraints
      )
      .pipe(
        map((arr) => {
          const postSchemasMap: any = {};
          arr.forEach((doc) => {
            postSchemasMap[doc.id] = doc;
          });
          return postSchemasMap;
        })
      );
  }

  getPostsFromSpot(spot: Spot): Observable<Post.Schema> {
    const filters: QueryFilter[] = [
      {
        fieldPath: "spot.ref",
        opStr: "==",
        value: this.docRef("spots/" + spot.id),
      },
    ];
    const constraints: QueryConstraintOptions[] = [
      { type: "limit", limit: 10 },
    ];

    return this._firestoreAdapter
      .collectionSnapshots<Post.Schema & { id: string }>(
        "posts",
        filters,
        constraints
      )
      .pipe(
        map((arr) => {
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
      let innerSub: Subscription | null = null;
      let isUnsubscribed = false;

      this.executeWhenConsent(() => {
        if (isUnsubscribed) return;

        const filters: QueryFilter[] = [
          { fieldPath: "user.uid", opStr: "==", value: userId },
        ];
        const constraints: QueryConstraintOptions[] = [
          { type: "limit", limit: 10 },
        ];

        const obs$ = this._firestoreAdapter
          .collectionSnapshots<Post.Schema & { id: string }>(
            "posts",
            filters,
            constraints
          )
          .pipe(
            map((arr) => {
              const postSchemasMap: any = {};
              arr.forEach((doc) => {
                postSchemasMap[doc.id] = doc;
              });
              return postSchemasMap;
            })
          );

        innerSub = obs$.subscribe({
          next: (v) => observer.next(v as Record<string, Post.Schema>),
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

  deletePost(postId: string): Promise<void> {
    if (!postId) {
      return Promise.reject("The post ID is empty");
    }
    return this._firestoreAdapter.deleteDocument(`posts/${postId}`);
  }

  userHasLikedPost(postId: string, userId: string): Promise<boolean> {
    return this._firestoreAdapter
      .getDocument<{ id: string }>(`posts/${postId}/likes/${userId}`)
      .then((data) => !!data);
  }

  addLike(postId: string, userUID: string, newLike: LikeSchema): Promise<void> {
    if (userUID !== newLike.user.uid) {
      return Promise.reject("The User ID and User ID on the like don't match!");
    }
    return this._firestoreAdapter.setDocument(
      `posts/${postId}/likes/${userUID}`,
      newLike
    );
  }

  removeLike(postId: string, userUID: string): Promise<void> {
    return this._firestoreAdapter.deleteDocument(
      `posts/${postId}/likes/${userUID}`
    );
  }
}
