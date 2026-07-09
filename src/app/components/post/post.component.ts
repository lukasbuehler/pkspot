import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from "@angular/core";
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostComponent implements OnInit {
  readonly post = input<Post.Class | null>(null);
  readonly showCard = input(true);

  readonly likedByUser = signal<boolean | null>(false);
  readonly currentlyAuthenticatedUserId = signal("");
  readonly timeAgoString = computed(() => {
    const timePosted = this.post()?.timePosted;
    return timePosted ? humanTimeSince(timePosted) : "";
  });
  readonly locationDisplayCoordinates = computed(() => {
    const location = this.post()?.location;
    return location ? MapHelpers.getHumanReadableCoordinates(location) : "";
  });
  readonly spotDisplayCoordinates = computed(() => {
    const location = this.post()?.spot?.spot_location;
    return location
      ? MapHelpers.getHumanReadableCoordinates({
          lat: location.latitude,
          lng: location.longitude,
        })
      : "";
  });

  private readonly matCardMedia =
    viewChild<ElementRef<HTMLElement>>("matCardMedia");
  private readonly postService = inject(PostsService);
  private readonly authenticationService = inject(AuthenticationService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private maxHeightToWidthRatio = 0;

  ngOnInit(): void {
    const post = this.post();
    const userId = this.authenticationService.user.uid;
    this.currentlyAuthenticatedUserId.set(userId ?? "");

    if (!post || !userId) {
      return;
    }

    const postId = post.id;
    this.postService
      .userHasLikedPost(postId, userId)
      .then((liked) => {
        if (this.post()?.id === postId) {
          this.likedByUser.set(liked);
        }
      })
      .catch((error: unknown) => console.error(error));
  }

  likeButtonPress(): void {
    const post = this.post();
    const likedByUser = this.likedByUser();
    if (
      post &&
      this.authenticationService.isSignedIn &&
      this.authenticationService.user.uid
    ) {
      if (likedByUser !== null) {
        if (!likedByUser) {
          // show the like
          this.likedByUser.set(true);
          post.like();

          // save the like
          this.postService
            .addLike(post.id, this.authenticationService.user.uid, {
              time: Timestamp.now(),
              user: {
                uid: this.authenticationService.user.uid,
              },
            })
            .then(() => {
              // The like was sucessfully added
              // Do nothing
            })
            .catch((err) => {
              // There was an error adding the like
              this.snackbar.open(
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
          this.likedByUser.set(false);
          post.unlike();

          // save the unlike
          this.postService
            .removeLike(post.id, this.authenticationService.user.uid)
            .then(() => {
              console.log("Your like was removed successfully");
            })
            .catch((err) => {
              this.snackbar.open(
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
      this.snackbar
        .open("Please sign in to like this post!", "Sign in", {
          duration: 5000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        })
        .onAction()
        .subscribe(() => {
          void this.router.navigate(["/account"], {
            queryParams: { returnUrl: this.router.url },
          });
        });
    }
  }

  updateMediaHeight(width: number, height: number): void {
    const matCardMedia = this.matCardMedia();
    if (!matCardMedia) {
      console.error("matCardMedia is null");
      return;
    }

    if (height / width > this.maxHeightToWidthRatio) {
      this.maxHeightToWidthRatio = height / width;
    }

    if (this.maxHeightToWidthRatio > 1 && height / width !== 1) {
      matCardMedia.nativeElement.style.height = width + "px";
    }
  }

  deletePost(): void {
    const post = this.post();
    if (!post) {
      console.error("Post is null");
      return;
    }

    this.postService
      .deletePost(post.id)
      .then(() => {
        this.snackbar.open("Your post was successfully deleted", "Dismiss", {
          duration: 3000,
          verticalPosition: "bottom",
          horizontalPosition: "center",
        });
      })
      .catch((err) => {
        console.error(err);
        this.snackbar.open(
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
