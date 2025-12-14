import { Component, OnInit, Input, ViewChild, ElementRef } from "@angular/core";
import { Post } from "../../../db/models/Post";
import { PostsService } from "../../services/firebase/firestore/posts.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MapHelpers } from "../../../scripts/MapHelpers";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router, RouterLink } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { humanTimeSince } from "../../../scripts/Helpers";
import { MatMenuTrigger, MatMenu, MatMenuItem } from "@angular/material/menu";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";
import { MatIcon } from "@angular/material/icon";
import { MatIconButton } from "@angular/material/button";
import { VgCoreModule } from "@videogular/ngx-videogular/core";
import {
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardSubtitle,
  MatCardContent,
  MatCardActions,
} from "@angular/material/card";
// NgIf removed (unused) to silence compiler warning

@Component({
  selector: "app-post",
  templateUrl: "./post.component.html",
  styleUrls: ["./post.component.scss"],
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardSubtitle,
    RouterLink,
    VgCoreModule,
    MatCardContent,
    MatCardActions,
    MatIconButton,
    MatIcon,
    FancyCounterComponent,
    MatMenuTrigger,
    MatMenu,
    MatMenuItem,
  ],
})
export class PostComponent implements OnInit {
  @Input() post: Post.Class | null = null;
  @Input() showCard: boolean = true;

  @ViewChild("matCardMedia") matCardMedia: ElementRef | undefined;

  dateAndTimeString?: string;
  timeAgoString?: string;
  likedByUser: boolean | null = null;

  currentlyAuthenticatedUserId: string = "";

  maxHeightToWidthRatio: number = 0;

  constructor(
    private _postService: PostsService,
    private _authenticationService: AuthenticationService,
    private _snackbar: MatSnackBar,
    private _router: Router
  ) {}

  ngOnInit() {
    this.dateAndTimeString = this.getDateAndTimeString();
    this.timeAgoString = this.getTimeAgoString();

    this.likedByUser = false;

    // Check if posts are liked by the user if a user is authenticated, every time the uid changes

    if (this.post) {
      if (this._authenticationService.user.uid) {
        this.currentlyAuthenticatedUserId =
          this._authenticationService.user.uid;

        this._postService
          .userHasLikedPost(this.post.id, this.currentlyAuthenticatedUserId)
          .then((bool) => {
            this.likedByUser = bool;
          })
          .catch((err) => {
            console.error(err);
          });
      }
    }
  }

  //   onResized(event: ResizedEvent) {
  //     this.updateMediaHeight(event.newWidth, event.newHeight);
  //   }

  getTimeAgoString(): string {
    if (!this.post) {
      console.error("Post is null");
      return "";
    }

    if (!this.post.timePosted) {
      console.error("Post time is null");
      return "";
    }

    return humanTimeSince(this.post.timePosted);
  }

  getDateAndTimeString(): string {
    if (!this.post) {
      console.error("Post is null");
      return "";
    }

    if (!this.post.timePosted) {
      console.error("Post time is null");
      return "";
    }

    return humanTimeSince(this.post.timePosted);
  }

  likeButtonPress() {
    if (
      this.post &&
      this._authenticationService.isSignedIn &&
      this._authenticationService.user.uid
    ) {
      if (this.likedByUser !== null) {
        if (!this.likedByUser) {
          // show the like
          this.likedByUser = true;
          this.post.like();

          // save the like
          this._postService
            .addLike(this.post.id, this._authenticationService.user.uid, {
              time: Timestamp.now(),
              user: {
                uid: this._authenticationService.user.uid,
              },
            })
            .then(() => {
              // The like was sucessfully added
              // Do nothing
            })
            .catch((err) => {
              // There was an error adding the like
              this._snackbar.open(
                "Your like could not be cast! " + err,
                "Dismiss",
                {
                  duration: 5000,
                  horizontalPosition: "center",
                  verticalPosition: "bottom",
                }
              );
            });
        } else {
          // show the unlike
          this.likedByUser = false;
          this.post.unlike();

          // save the unlike
          this._postService
            .removeLike(this.post.id, this._authenticationService.user.uid)
            .then(() => {
              console.log("Your like was removed successfully");
            })
            .catch((err) => {
              this._snackbar.open(
                "Your like could not be removed! " + err,
                "Dismiss",
                {
                  duration: 5000,
                  horizontalPosition: "center",
                  verticalPosition: "bottom",
                }
              );
            });
        }
      }
    } else {
      // TODO show that you need to sign in
      this._snackbar
        .open("Please sign in to like this post!", "Sign in", {
          duration: 5000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        })
        .onAction()
        .subscribe(() => {
          this._router.navigateByUrl("/sign-in");
        });
    }
  }

  getLocationDisplayCoordinates(coords: google.maps.LatLngLiteral) {
    if (coords) {
      return MapHelpers.getHumanReadableCoordinates(coords);
    }
    return "";
  }

  updateMediaHeight(width: number, height: number) {
    if (!this.matCardMedia) {
      console.error("matCardMedia is null");
      return;
    }

    if (height / width > this.maxHeightToWidthRatio) {
      this.maxHeightToWidthRatio = height / width;
    }

    if (this.maxHeightToWidthRatio > 1 && height / width !== 1) {
      this.matCardMedia.nativeElement.style.height = width + "px";
    }
  }

  deletePost() {
    if (!this.post) {
      console.error("Post is null");
      return;
    }

    this._postService
      .deletePost(this.post.id)
      .then(() => {
        this._snackbar.open("Your post was successfully deleted", "Dismiss", {
          duration: 3000,
          verticalPosition: "bottom",
          horizontalPosition: "center",
        });
      })
      .catch((err) => {
        console.error(err);
        this._snackbar.open(
          "Error. Your post could not be deleted!",
          "Dismiss",
          {
            duration: 5000,
            verticalPosition: "bottom",
            horizontalPosition: "center",
          }
        );
      });
  }
}
