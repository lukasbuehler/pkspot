import {
  Component,
  inject,
  OnDestroy,
  OnInit,
  LOCALE_ID,
  Inject,
  ChangeDetectorRef,
} from "@angular/core";
import {
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
  MatDialogModule,
} from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Post } from "../../../db/models/Post";
import { User } from "../../../db/models/User";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { Subscription, skip } from "rxjs";
import { FollowListComponent } from "../follow-list/follow-list.component";
import { StorageService } from "../../services/firebase/storage.service";
import { MatButton } from "@angular/material/button";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";
import { MatChipSet, MatChip } from "@angular/material/chips";
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from "@angular/material/card";
import { MatDivider } from "@angular/material/divider";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { FollowingService } from "../../services/firebase/firestore/following.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { PostsService } from "../../services/firebase/firestore/posts.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { StructuredDataService } from "../../services/structured-data.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { MatMenuModule } from "@angular/material/menu";
import { MatRippleModule } from "@angular/material/core";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { LocaleCode } from "../../../db/models/Interfaces";
import { countries } from "../../../scripts/Countries";
import { BadgeService } from "../../services/badge.service";
import { Badge } from "../../shared/badge-definitions";

@Component({
  selector: "app-profile-page",
  templateUrl: "./profile-page.component.html",
  styleUrls: ["./profile-page.component.scss"],
  imports: [
    MatProgressSpinner,
    MatCard,
    MatCardContent,
    MatChipSet,
    MatChip,
    FancyCounterComponent,
    MatButton,
    RouterLink,
    MatCardHeader,
    MatCardTitle,
    MatDivider,
    MatIconModule,
    MatTabsModule,
    MatMenuModule,
    MatDialogModule,
    MatRippleModule,
    SpotPreviewCardComponent,
  ],
})
export class ProfilePageComponent implements OnInit, OnDestroy {
  private _structuredDataService = inject(StructuredDataService);
  private _metaTagService = inject(MetaTagService);

  userId: string = "";
  user: User | null = null;
  isLoading: boolean = false;

  postsFromUser: Post.Class[] = [];
  postsFromUserLoading: boolean = false;

  constructor(
    public followListDialog: MatDialog,
    private _authService: AuthenticationService,
    private _followingService: FollowingService,
    private _usersService: UsersService,
    private _postsService: PostsService,
    private _spotsService: SpotsService,
    private _badgeService: BadgeService,
    private _route: ActivatedRoute,
    private _router: Router,
    private _snackbar: MatSnackBar,
    private _storageService: StorageService,
    private _cdr: ChangeDetectorRef,
    @Inject(LOCALE_ID) public locale: LocaleCode
  ) {}

  profilePicture: string = "";
  isMyProfile: boolean = false;
  loadingFollowing: boolean = false;
  isFollowing: boolean = false;

  createdSpotsCount: number = 0;
  editedSpotsCount: number = 0;
  mediaAddedCount: number = 0;
  followingCount: number = 0;
  isLoadingStats: boolean = false;

  homeSpotsObjects: Spot[] = [];
  badges: Badge[] = [];

  countries = countries;
  private _subscriptions = new Subscription();

  followDialogRef: MatDialogRef<FollowListComponent> | null = null;

  private dialogConfig: MatDialogConfig = {
    autoFocus: true,
    restoreFocus: true,
    disableClose: false,
    hasBackdrop: true,
    width: "600px",
    maxWidth: "95%",
    maxHeight: "80%",
  };

  private lastLoadedFollowing?: firebase.default.firestore.Timestamp;

  ngOnInit(): void {
    // Subscribe to auth state changes first - this handles the case where
    // auth isn't ready on initial load (e.g., page refresh)
    // Skip the first emission (initial null from BehaviorSubject before auth loads)
    const authSub = this._authService.authState$
      .pipe(skip(1))
      .subscribe((authUser) => {
        if (authUser) {
          this.isMyProfile = this.userId === authUser.uid;

          // If we're on /profile (no userID param) and didn't have a userId yet,
          // redirect to /u/{userId} for a shareable URL
          if (!this._route.snapshot.paramMap.get("userID") && authUser.uid) {
            this._router.navigate(["/u", authUser.uid], { replaceUrl: true });
            return;
          }
        } else {
          this.isMyProfile = false;
          this.isFollowing = false;

          // Auth has now loaded and user is null (not signed in)
          // If we're on /profile without a specific userID, redirect to sign-in
          if (!this._route.snapshot.paramMap.get("userID") && !this.userId) {
            this._router.navigate(["/sign-in"], {
              queryParams: { returnUrl: "/profile" },
            });
          }
        }
      });
    this._subscriptions.add(authSub);

    this._subscriptions.add(
      this._route.paramMap.subscribe((params) => {
        const userIdFromRoute = params.get("userID");
        const newUserId = userIdFromRoute ?? this._authService?.user?.uid ?? "";
        if (newUserId && newUserId !== this.userId) {
          this.userId = newUserId;
          this.init();
        }
      })
    );

    // Initial load - only proceed if we have a userID from the route
    const userIdFromRoute = this._route.snapshot.paramMap.get("userID");
    if (userIdFromRoute) {
      this.userId = userIdFromRoute;
      this.init();
    } else if (this._authService?.user?.uid) {
      // Auth is already ready (e.g., navigating within app) - redirect to shareable URL
      this._router.navigate(["/u", this._authService.user.uid], {
        replaceUrl: true,
      });
    }
    // If neither, we wait for authState$ to provide the user
  }

  init() {
    // clear info
    this.user = null;
    this.postsFromUser = [];
    this.profilePicture = "";
    this.isFollowing = false;

    if (this.userId) {
      // load stuff
      this.isMyProfile = this.userId === this._authService.user.uid;
      this.loadProfile(this.userId);
    }

    if (this.followDialogRef) {
      this.followDialogRef.close();
    }
  }

  loadProfile(userId: string) {
    const userSub = this._usersService.getUserById(userId).subscribe(
      (user) => {
        if (!user) {
          this.isLoading = false;
          return;
        }

        this.user = user;
        this.isLoading = false;

        // Add structured data for this user profile
        const personData =
          this._structuredDataService.generateUserPersonData(user);
        this._structuredDataService.addStructuredData("profile", personData);

        // Set meta tags with canonical URL
        const canonicalPath = `/u/${userId}`;
        this._metaTagService.setUserMetaTags(user, canonicalPath);
        this._metaTagService.setUserMetaTags(this.user);

        this.homeSpotsObjects = [];
        if (this.user.homeSpots && this.user.homeSpots.length > 0) {
          this.user.homeSpots.forEach((spotId) => {
            this._spotsService
              .getSpotById(spotId as SpotId, this.locale)
              .then((spot) => {
                // Avoid duplicates if spot is already in list (e.g. if loaded twice)
                if (
                  spot &&
                  !this.homeSpotsObjects.find((s) => s.id === spot.id)
                ) {
                  this.homeSpotsObjects.push(spot);
                  // Trigger change detection just in case
                  this._cdr.detectChanges();
                }
              })
              .catch(console.error);
          });
        }

        // Load the profile picture of this user
        if (this.user.profilePicture) {
          this.profilePicture = this.user.profilePicture.getPreviewImageSrc();
        }

        // Load all the posts from this user
        this.loadPostsForUser(userId);

        // Check if this user follows the authenticated user

        let myUserId = this._authService.user.uid;
        if (myUserId) {
          this.loadingFollowing = true;
          const followingSub = this._followingService
            .isFollowingUser$(myUserId, userId)
            .subscribe(
              (isFollowing) => {
                this.loadingFollowing = false;
                this.isFollowing = isFollowing;
              },
              (err) => {
                this.loadingFollowing = false;
                console.error(
                  "There was an error checking if you follow this user"
                );
                console.error(err);
              }
            );
          this._subscriptions.add(followingSub);
        }

        // Load User Stats
        this.isLoadingStats = true;

        // Load following count
        this._followingService.getFollowingCount(userId).then((count) => {
          this.followingCount = count;
        });

        // Stats are now stored on the user profile (set by Cloud Functions)
        this.createdSpotsCount = this.user.data?.spot_creates_count ?? 0;
        this.editedSpotsCount = this.user.data?.spot_edits_count ?? 0;
        this.mediaAddedCount = this.user.data?.media_added_count ?? 0;
        this.isLoadingStats = false;

        // Compute badges for this user
        this.badges = this._badgeService.getDisplayBadges(this.user.data);

        // Load the groups of this user
        // TODO
      },
      (err) => {
        console.error(err);
        this.isLoading = false;
      }
    );
    this._subscriptions.add(userSub);
    this.isLoading = true;
  }

  loadPostsForUser(userId: string) {
    const postsSub = this._postsService.getPostsFromUser(userId).subscribe(
      (postMap: Record<string, Post.Schema>) => {
        for (let postId in postMap) {
          let docIndex = this.postsFromUser.findIndex((post, index, obj) => {
            return post.id === postId;
          });
          if (docIndex >= 0) {
            // the document already exists already in this array
            const postSchema: Post.Schema = postMap[postId];
            this.postsFromUser[docIndex].updateData(postSchema);
          } else {
            // create and add new Post
            this.postsFromUser.push(new Post.Class(postId, postMap[postId]));
            this.postsFromUser.sort((a, b) => {
              if (b.timePosted && a.timePosted) {
                return b.timePosted.getTime() - a.timePosted.getTime();
              }
              return 0;
            });
          }
        }
        this.postsFromUserLoading = false;
      },
      (err) => {
        console.error(err);
        this.postsFromUserLoading = false;
      }
    );
    this._subscriptions.add(postsSub);
    this.postsFromUserLoading = true;
  }

  followButtonClick() {
    this.loadingFollowing = true;

    if (this.user && !this.isMyProfile) {
      if (this._authService.user.uid && this.isFollowing) {
        // Already following this user, unfollow
        this._followingService
          .unfollowUser(this._authService.user.uid, this.userId)
          .then(() => {
            this.isFollowing = false;
            this.loadingFollowing = false;
          })
          .catch((err) => {
            this.loadingFollowing = false;
            this._snackbar.open(
              "There was an error unfollowing the user!",
              "OK",
              {
                verticalPosition: "bottom",
                horizontalPosition: "center",
              }
            );
          });
      } else {
        // Not following this user, try to follow
        if (
          !this._authService.isSignedIn ||
          !this._authService.user.uid ||
          !this._authService.user.data?.data
        ) {
          this.loadingFollowing = false;
          this._snackbar.open("You need to log in to follow!", "Ok", {
            verticalPosition: "bottom",
            horizontalPosition: "center",
            duration: 5000,
          });
          return;
        }

        if (!this.user.data) {
          console.log("User data is null");
          return;
        }

        this._followingService
          .followUser(
            this._authService.user.uid,
            this._authService.user.data.data,
            this.userId,
            this.user.data
          )
          .then(() => {
            this.isFollowing = true;
            this.loadingFollowing = false;
          })
          .catch((err) => {
            console.error(err);
            this.loadingFollowing = false;
            this._snackbar.open(
              "There was an error following the user!",
              "OK",
              {
                verticalPosition: "bottom",
                horizontalPosition: "center",
                duration: 5000,
              }
            );
          });
      }
    }
  }

  viewFollowers() {
    if (this.isMyProfile) {
      this.followDialogRef = this.followListDialog.open(FollowListComponent, {
        ...this.dialogConfig,
        data: {
          userId: this.userId,
          type: "followers",
          followUsers: [],
        },
      });
    }
  }

  viewFollowing() {
    if (this.isMyProfile) {
      this.followDialogRef = this.followListDialog.open(FollowListComponent, {
        ...this.dialogConfig,
        data: {
          userId: this.userId,
          type: "following",
          followUsers: [],
        },
      });
    }
  }

  ngOnDestroy(): void {
    this._structuredDataService.removeStructuredData("profile");
    this._subscriptions.unsubscribe();
  }
}
