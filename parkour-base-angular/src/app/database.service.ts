import { Injectable } from "@angular/core";
import { keys } from "src/environments/keys";

import { Post } from "src/scripts/db/Post";
import { Spot } from "src/scripts/db/Spot";

import {
  AngularFirestore,
  AngularFirestoreCollection
} from "@angular/fire/firestore";

import { Observable } from "rxjs";
import { Like } from "src/scripts/db/Like";

@Injectable({
  providedIn: "root"
})
export class DatabaseService {
  constructor(private db: AngularFirestore) {}

  addPost(newPost: Post.Schema) {
    this.db
      .collection<Post.Schema>("posts")
      .add(newPost)
      .then(docRef => {
        console.log("Post Document written with ID: " + docRef.id);
      })
      .catch(error => {
        console.error("Error adding Post Document: ", error);
      });
  }

  addLike(postId: string, userUID: string, newLike: Like.Schema) {
    if (userUID !== newLike.user.uid) {
      console.error("Schema user UID and given UID don't match!");
      return;
    }

    this.db
      .collection<Like.Schema>(`posts/${postId}/likes`)
      .doc(userUID)
      .set(newLike)
      .then(() => {
        console.log("Added like on " + postId + " for " + userUID);
      })
      .catch(error => {
        console.error("Couldn't add like.", error);
      });
  }

  removeLike(postId: string, likeId) {}

  getPostUpdates(): Observable<any> {
    return new Observable<any>(observer => {
      let snapshotChanges = this.db
        .collection<Post.Schema>("posts", ref =>
          ref.orderBy("time_posted", "desc")
        )
        .snapshotChanges();

      snapshotChanges.subscribe(
        changeActions => {
          let postSchemasMap: any = {};
          changeActions.forEach(action => {
            const id = action.payload.doc.id;
            postSchemasMap[id] = action.payload.doc.data();
          });

          observer.next(postSchemasMap);
        },
        error => {
          observer.error(error);
        }
      );
    });
  }

  getTrendingPosts() {}

  getTestSpots(): Observable<Spot.Class[]> {
    return new Observable<Spot.Class[]>(observer => {
      this.db
        .collection("spots")
        .get()
        .subscribe(
          querySnapshot => {
            let spots: Spot.Class[] = [];

            querySnapshot.forEach(doc => {
              if (doc.data() as Spot.Schema) {
                let newSpot: Spot.Class = new Spot.Class(
                  doc.id,
                  doc.data() as Spot.Schema
                );
                console.log(newSpot);

                spots.push(newSpot);
              } else {
                console.error("Spot could not be cast to Spot.Schema!");
                observer.complete();
              }
            });

            observer.next(spots);
            observer.complete();
          },
          error => {
            observer.error(error);
            observer.complete();
          },
          () => {}
        );
    });
  }

  getSpotSearch(searchString: string): Observable<Spot.Class[]> {
    return new Observable<any[]>(observer => {
      this.db.collection("spots").get();
    });
  }

  getSpotsOnMap() {}

  setSpot(spot: Spot.Class): Observable<any> {
    let spotId: string = spot.id;

    return new Observable<any>(observer => {
      this.db
        .collection("spots")
        .doc(spot.id)
        .set(spot.data)
        .then(
          /* fulfilled */ value => {
            observer.next(value);
            observer.complete();
          },
          /* rejected */ reason => {
            observer.error(reason);
          }
        )
        .catch(error => {
          observer.error(error);
        });
    });
  }
}
