import { Component, OnInit, ViewChild } from "@angular/core";
import { DatabaseService } from "src/app/database.service";
import { Post } from "src/scripts/db/Post";
import { PostCollectionComponent } from "../post-collection/post-collection.component";
import { MatDialog } from "@angular/material/dialog";
import { MatDrawer } from "@angular/material/sidenav";
import { EditPostDialogComponent } from "../edit-post-dialog/edit-post-dialog.component";
import { StorageService } from "../storage.service";
import * as firebase from "firebase/app";

@Component({
  selector: "app-home-page",
  templateUrl: "./home-page.component.html",
  styleUrls: ["./home-page.component.scss"]
})
export class HomePageComponent implements OnInit {
  constructor(
    private _dbService: DatabaseService,
    public dialog: MatDialog,
    private _storageService: StorageService
  ) {}

  updatePosts: Post.Class[] = [];
  trendingPosts: Post.Class[] = [];

  @ViewChild("updateCollection", { static: true })
  updateCollection: PostCollectionComponent;

  @ViewChild("followingDrawer", { static: true }) followingDrawer: MatDrawer;

  ngOnInit() {
    this._dbService.getPostUpdates().subscribe(
      postMap => {
        for (let postId in postMap) {
          let docIndex = this.updatePosts.findIndex((post, index, obj) => {
            return post.id === postId;
          });
          if (docIndex >= 0) {
            // the document already exists already in this array
            this.updatePosts[docIndex].updateData(postMap[postId]);
          } else {
            // create and add new Post
            console.log();
            this.updatePosts.push(new Post.Class(postId, postMap[postId]));
          }
        }
      },
      error => {
        console.error(error);
      },
      () => {} // complete
    );
  }

  getMorePosts() {
    // get More posts
  }

  scrolledDown() {
    this.getMorePosts();
  }

  createPost() {
    const createPostDialog = this.dialog.open(EditPostDialogComponent, {
      width: "600px",
      data: { isCreating: true }
    });

    createPostDialog.afterClosed().subscribe(
      result => {
        this.saveNewPost(result.title, result.body, result.is_image);
      },
      error => {
        console.error(error);
      }
    );
  }

  saveNewPost(title: string, body: string, isImage: boolean) {
    this._storageService.upload().subscribe(
      src => {
        // now create the DB entry for the post
        this._dbService.addPost({
          title: title,
          body: body,
          media: {
            is_image: isImage,
            src: src
          },
          time_posted: firebase.firestore.Timestamp.now(),
          user: {
            id: "pAxfc6rwUU9qLhsqj36l",
            name: "Lukas Bühler",
            ref: "users/pAxfc6rwUU9qLhsqj36l"
          }
        });
      },
      error => {
        console.error(error);
      }
    );
  }
}
