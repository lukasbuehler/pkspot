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
import { Subscription } from "rxjs";
import { Timestamp } from "firebase/firestore";
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
import { BlockUserDialogComponent } from "../block-user-dialog/block-user-dialog.component";
import { UnblockUserDialogComponent } from "../unblock-user-dialog/unblock-user-dialog.component";
import { Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { LocaleCode } from "../../../db/models/Interfaces";
import { countries } from "../../../scripts/Countries";
import { BadgeService } from "../../services/badge.service";
import { Badge } from "../../shared/badge-definitions";
import { MatTooltipModule } from "@angular/material/tooltip";
import { NgOptimizedImage } from "@angular/common";
import { PrivateSpotListsDialogComponent } from "../private-spot-lists-dialog/private-spot-lists-dialog.component";
import { AnalyticsService } from "../../services/analytics.service";

type ProfileSocialLink = {
  id: string;
  label: string;
  icon: string;
  url: string;
};

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
    MatIconModule,
    MatTabsModule,
    MatMenuModule,
    MatDialogModule,
    MatRippleModule,
    SpotPreviewCardComponent,
    MatTooltipModule,
    NgOptimizedImage,
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
    private _analytics: AnalyticsService,
    private _cdr: ChangeDetectorRef,
    @Inject(LOCALE_ID) public locale: LocaleCode
  ) {}

  profilePicture: string = "";
  isMyProfile: boolean = false;
  loadingFollowing: boolean = false;
  isFollowing: boolean = false;
  privateDataLoading: boolean = false;
  savedSpotIds: string[] = [];
  visitedSpotIds: string[] = [];

  createdSpotsCount: number = 0;
  editedSpotsCount: number = 0;
  mediaAddedCount: number = 0;
  followingCount: number = 0;
  isLoadingStats: boolean = false;

  homeSpotsObjects: Spot[] = [];
  badges: Badge[] = [];
  profileSocialLinks: ProfileSocialLink[] = [];

  countries = countries;
  blockedUsers: string[] = [];
  private _subscriptions = new Subscription();
  private _profileSubscriptions = new Subscription();
  private _privateDataSubscription: Subscription | null = null;

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

  private lastLoadedFollowing?: Timestamp;

  ngOnInit(): void {
    // Subscribe to auth state changes first - this handles the case where
    // auth isn't ready on initial load (e.g., page refresh)
    // Skip the first emission (initial null from BehaviorSubject before auth loads)
    const authSub = this._authService.authState$.subscribe((authUser) => {
      if (authUser) {
        this.isMyProfile = this.userId === authUser.uid;
        this._syncPrivateDataSubscription();

        // Load blocked users list for UI state
        if (authUser.data?.data?.blocked_users) {
          this.blockedUsers = authUser.data.data.blocked_users;
        } else {
          this.blockedUsers = [];
        }

        // If we're on /profile (no userID param) and didn't have a userId yet,
        // redirect to /u/{userId} for a shareable URL
        if (!this._route.snapshot.paramMap.get("userID") && authUser.uid) {
          this._router.navigate(["/u", authUser.uid], { replaceUrl: true });
          return;
        }
      } else {
        this.isMyProfile = false;
        this.isFollowing = false;
        this._syncPrivateDataSubscription();

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
    this._profileSubscriptions.unsubscribe();
    this._profileSubscriptions = new Subscription();
    if (this._userSubscription) {
      this._userSubscription.unsubscribe();
      this._userSubscription = null;
    }

    // clear info
    this.user = null;
    this.postsFromUser = [];
    this.profilePicture = "";
    this.isFollowing = false;
    this.profileSocialLinks = [];

    this.followingCount = 0;
    this.user = null; // Ensure user is null so UI shows loading or empty state correctly for counts that rely on user object
    // createdSpotsCount etc are derived from user object so they will reset when user is null

    if (this.userId) {
      // load stuff
      this.isMyProfile = this.userId === this._authService.user.uid;
      this._syncPrivateDataSubscription();
      this.loadProfile(this.userId);
    }

    if (this.followDialogRef) {
      this.followDialogRef.close();
    }
  }

  private _userSubscription: Subscription | null = null;

  loadProfile(userId: string) {
    this.isLoading = true;

    if (this._userSubscription) {
      this._userSubscription.unsubscribe();
      this._userSubscription = null;
    }
    this._userSubscription = this._usersService.getUserById(userId).subscribe(
      (user) => {
        if (!user) {
          this.profileSocialLinks = [];
          this.isLoading = false;
          this._cdr.detectChanges();
          return;
        }

        this.user = user;
        this.profileSocialLinks = this._buildProfileSocialLinks(user);
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
                this._cdr.detectChanges();
              },
              (err) => {
                this.loadingFollowing = false;
                console.error(
                  "There was an error checking if you follow this user"
                );
                console.error(err);
                this._cdr.detectChanges();
              }
            );
          this._profileSubscriptions.add(followingSub);
        }

        // Load User Stats
        this.isLoadingStats = true;

        // Stats are on the user profile (set by Cloud Functions)
        this.createdSpotsCount = this.user.data?.spot_creates_count ?? 0;
        this.editedSpotsCount = this.user.data?.spot_edits_count ?? 0;
        this.mediaAddedCount = this.user.data?.media_added_count ?? 0;

        // IMPORTANT: following_count is on the user document.
        // We cannot count the collection directly for other users due to privacy rules.
        this.followingCount = this.user.data?.following_count ?? 0;

        this.isLoadingStats = false;

        // Compute badges for this user
        this.badges = this._badgeService.getDisplayBadges(this.user.data);

        // Load the groups of this user
        // TODO
        this._cdr.detectChanges();
      },
      (err) => {
        console.error(err);
        this.isLoading = false;
        this._cdr.detectChanges();
      }
    );
    this._profileSubscriptions.add(this._userSubscription);
  }

  loadPostsForUser(userId: string) {
    this.postsFromUserLoading = true;
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
        this._cdr.detectChanges();
      },
      (err) => {
        console.error(err);
        this.postsFromUserLoading = false;
        this._cdr.detectChanges();
      }
    );
    this._profileSubscriptions.add(postsSub);
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
          displayName: this.user?.displayName || "User",
          isMyProfile: this.isMyProfile,
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
          displayName: this.user?.displayName || "User",
          isMyProfile: this.isMyProfile,
        },
      });
    }
  }

  openPrivateSpotListsDialog(initialTab: "saved" | "visited") {
    if (!this.isMyProfile) {
      return;
    }

    this.followListDialog.open(PrivateSpotListsDialogComponent, {
      ...this.dialogConfig,
      width: "840px",
      maxWidth: "96vw",
      data: {
        savedSpotIds: this.savedSpotIds,
        visitedSpotIds: this.visitedSpotIds,
        initialTab,
      },
    });
  }

  private _syncPrivateDataSubscription() {
    this._privateDataSubscription?.unsubscribe();
    this._privateDataSubscription = null;
    this.privateDataLoading = false;
    this.savedSpotIds = [];
    this.visitedSpotIds = [];

    if (!this.isMyProfile || !this.userId) {
      return;
    }

    this.privateDataLoading = true;
    this._privateDataSubscription = this._usersService
      .getPrivateData(this.userId)
      .subscribe(
        (privateData) => {
          this.savedSpotIds = Array.from(
            new Set((privateData?.bookmarks || []).filter((id) => !!id))
          );
          this.visitedSpotIds = Array.from(
            new Set((privateData?.visited_spots || []).filter((id) => !!id))
          );
          this.privateDataLoading = false;
          this._cdr.detectChanges();
        },
        (error) => {
          console.error("Failed to load private spot lists", error);
          this.privateDataLoading = false;
          this._cdr.detectChanges();
        }
      );
  }

  toggleBlockUser() {
    if (!this.user || !this._authService.user.uid) return;

    const myId = this._authService.user.uid;
    const targetId = this.userId;

    if (this.isBlocked) {
      // Unblock
      this.followListDialog
        .open(UnblockUserDialogComponent)
        .afterClosed()
        .subscribe((result) => {
          if (result) {
            this._usersService
              .unblockUser(myId, targetId)
              .then(() => {
                this.blockedUsers = (this.blockedUsers || []).filter(
                  (id) => id !== targetId
                );
                this._snackbar.open("User unblocked", "OK", { duration: 3000 });
                // Update local auth user data if needed or rely on reload?
                // It's better to update local state immediately.
                if (this._authService.user.data?.data) {
                  this._authService.user.data.data.blocked_users =
                    this.blockedUsers;
                }
                // Reload profile to ensure clean state and avoid bugs where stats might be mixed up
                this.loadProfile(this.userId);
              })
              .catch((err) => {
                console.error(err);
                this._snackbar.open("Error unblocking user", "OK", {
                  duration: 3000,
                });
              });
          }
        });
    } else {
      // Block
      this.followListDialog
        .open(BlockUserDialogComponent)
        .afterClosed()
        .subscribe((result) => {
          if (result) {
            this._usersService
              .blockUser(myId, targetId)
              .then(() => {
                if (!this.blockedUsers) this.blockedUsers = [];
                this.blockedUsers.push(targetId);
                this._snackbar.open("User blocked", "OK", { duration: 3000 });
                if (this._authService.user.data?.data) {
                  // Initialize if undefined
                  if (!this._authService.user.data.data.blocked_users) {
                    this._authService.user.data.data.blocked_users = [];
                  }
                  this._authService.user.data.data.blocked_users.push(targetId);
                }
              })
              .catch((err) => {
                console.error(err);
                this._snackbar.open("Error blocking user", "OK", {
                  duration: 3000,
                });
              });
          }
        });
    }
  }

  get isBlocked(): boolean {
    return this.blockedUsers?.includes(this.userId) ?? false;
  }

  private _buildProfileSocialLinks(user: User): ProfileSocialLink[] {
    const links: ProfileSocialLink[] = [];

    const instagramUrl = this._buildInstagramUrl(user.socials?.instagram_handle);
    this._pushProfileSocialLink(links, {
      id: "instagram",
      label: "Instagram",
      icon: "photo_camera",
      url: instagramUrl,
      campaign: "profile_social_instagram",
    });

    const youtubeUrl = this._buildYoutubeUrl(user.socials?.youtube_handle);
    this._pushProfileSocialLink(links, {
      id: "youtube",
      label: "YouTube",
      icon: "smart_display",
      url: youtubeUrl,
      campaign: "profile_social_youtube",
    });

    for (const [index, custom] of (user.socials?.other ?? []).entries()) {
      this._pushProfileSocialLink(links, {
        id: `custom-${index}`,
        label: custom.name.trim() || "Link",
        icon: "link",
        url: this._normalizeExternalUrl(custom.url),
        campaign: "profile_social_custom",
      });
    }

    return links;
  }

  private _pushProfileSocialLink(
    links: ProfileSocialLink[],
    config: {
      id: string;
      label: string;
      icon: string;
      url: string | null;
      campaign: string;
    }
  ) {
    if (!config.url) {
      return;
    }

    const taggedUrl = this._analytics.addUtmToUrl(
      config.url,
      config.campaign,
      "pkspot",
      "profile"
    );
    if (!taggedUrl) {
      return;
    }

    links.push({
      id: config.id,
      label: config.label,
      icon: config.icon,
      url: taggedUrl,
    });
  }

  private _buildInstagramUrl(handle?: string): string | null {
    const normalizedHandle = this._normalizeInstagramHandle(handle);
    if (!normalizedHandle) {
      return null;
    }
    return `https://instagram.com/${normalizedHandle}`;
  }

  private _buildYoutubeUrl(handle?: string): string | null {
    const normalizedHandle = this._normalizeYoutubeHandle(handle);
    if (!normalizedHandle) {
      return null;
    }

    if (normalizedHandle.startsWith("http://") || normalizedHandle.startsWith("https://")) {
      return this._normalizeExternalUrl(normalizedHandle);
    }

    return `https://www.youtube.com/${normalizedHandle}`;
  }

  private _normalizeInstagramHandle(value?: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        const firstPathSegment = parsed.pathname
          .split("/")
          .map((segment) => segment.trim())
          .filter(Boolean)[0];
        if (firstPathSegment) {
          return firstPathSegment.replace(/^@+/, "").trim();
        }
      } catch (error) {
        console.warn("Invalid Instagram URL", trimmed, error);
      }
    }

    return trimmed.replace(/^@+/, "").split("/")[0].trim() || null;
  }

  private _normalizeYoutubeHandle(value?: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        const pathParts = parsed.pathname
          .split("/")
          .map((segment) => segment.trim())
          .filter(Boolean);

        if (pathParts.length === 0) {
          return null;
        }

        if (pathParts[0].startsWith("@")) {
          return pathParts[0];
        }

        if (
          ["channel", "c", "user"].includes(pathParts[0]) &&
          pathParts[1]
        ) {
          return `${pathParts[0]}/${pathParts[1]}`;
        }

        return pathParts.join("/");
      } catch (error) {
        console.warn("Invalid YouTube URL", trimmed, error);
      }
    }

    if (trimmed.startsWith("@")) {
      return trimmed;
    }

    return trimmed.includes("/") ? trimmed : `@${trimmed}`;
  }

  private _normalizeExternalUrl(value?: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    try {
      return new URL(withProtocol).toString();
    } catch (error) {
      console.warn("Invalid custom social URL", value, error);
      return null;
    }
  }

  ngOnDestroy(): void {
    this._structuredDataService.removeStructuredData("profile");
    this._subscriptions.unsubscribe();
    this._profileSubscriptions.unsubscribe();
    this._privateDataSubscription?.unsubscribe();
    this._privateDataSubscription = null;
    this._userSubscription?.unsubscribe();
    this._userSubscription = null;
  }
}
