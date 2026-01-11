import { Component, Inject, OnInit, Pipe, PipeTransform } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogRef,
} from "@angular/material/dialog";
import { User } from "../../../db/models/User";
import { getProfilePictureUrl } from "../../../scripts/ProfilePictureHelper";

import { Observable, take } from "rxjs";
import { humanTimeSince } from "../../../scripts/Helpers";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatIcon } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { MatIconButton, MatButton } from "@angular/material/button";
import {
  MatTable,
  MatColumnDef,
  MatHeaderCellDef,
  MatHeaderCell,
  MatCellDef,
  MatCell,
  MatHeaderRowDef,
  MatHeaderRow,
  MatRowDef,
  MatRow,
} from "@angular/material/table";
// NgIf removed (unused) to silence compiler warning
import { FollowingService } from "../../services/firebase/firestore/following.service.js";
import { FollowingDataSchema } from "../../../db/schemas/UserSchema";
import { NgOptimizedImage } from "@angular/common";

export interface FollowListDialogData {
  userId: string;
  type: "followers" | "following";
  followUsers: FollowingDataSchema[];
  allLoaded: boolean;
  displayName?: string;
  isMyProfile?: boolean;
}

@Pipe({
  name: "followDuration",
  pure: true,
  standalone: true,
})
export class FollowDurationPipe implements PipeTransform {
  transform(
    timestamp: firebase.default.firestore.Timestamp,
    args?: any
  ): string {
    const data = timestamp.toDate();
    return `${humanTimeSince(data)} (since ${data.toLocaleDateString()})`;
  }
}

@Component({
  selector: "app-follow-list",
  templateUrl: "./follow-list.component.html",
  styleUrls: ["./follow-list.component.scss"],
  imports: [
    MatDialogTitle,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatIconButton,
    RouterLink,
    MatIcon,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatProgressSpinner,
    MatButton,
    FollowDurationPipe,
    NgOptimizedImage,
  ],
})
export class FollowListComponent implements OnInit {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: FollowListDialogData,
    private _followingService: FollowingService,
    private _dialogRef: MatDialogRef<FollowListComponent>
  ) {}

  closeDialog() {
    this._dialogRef.close();
  }

  displayedColumns: string[] = ["user", "duration", "open"];

  isLoading: boolean = false;
  hasLoadedAll: boolean = false;
  lastLoadedFollowing: firebase.default.firestore.Timestamp | null = null;
  private _isFirstLoad: boolean = true;

  ngOnInit(): void {
    this._loadFollowing();
  }

  loadMoreFollowing() {
    this._loadFollowing();
  }

  private _loadFollowing() {
    this.isLoading = true;
    const chunkSize = 20;

    let obs: Observable<FollowingDataSchema[]>;
    if (this.data.type === "followers") {
      obs = this._followingService.getFollowersOfUser(
        this.data.userId,
        chunkSize
      );
    } else {
      obs = this._followingService.getFollowingsOfUser(
        this.data.userId,
        chunkSize
      );
    }

    // Use take(1) to get only the first emission from the real-time observable
    obs.pipe(take(1)).subscribe(
      (followings) => {
        this.isLoading = false;

        // Debugging: Log counts and IDs to help trace "empty list" bug
        console.log(`Loaded ${followings.length} items for ${this.data.type}`);
        if (followings.length === 0 && this._isFirstLoad) {
          console.warn(
            `Warning: First load returned 0 items for ${this.data.type}. Check database count vs collection content.`
          );
        }

        this._processFollowUsers(followings);

        // On first load, replace the array instead of concatenating
        if (this._isFirstLoad) {
          this.data.followUsers = followings;
          this._isFirstLoad = false;
        } else {
          this.data.followUsers = this.data.followUsers.concat(followings);
        }

        if (followings.length < chunkSize) {
          // We are at the end, and have loaded all the things
          // console.log("The end!");
          this.lastLoadedFollowing = null;
          this.hasLoadedAll = true;
        } else {
          // this was not the end
          // console.log("not the end!");
          this.lastLoadedFollowing =
            followings[followings.length - 1].start_following ?? null;
        }
      },
      (err) => {
        console.error("Error loading follow list:", err);
        this.isLoading = false;
        // Optionally show snackbar here
      },
      () => {}
    );
  }

  private _processFollowUsers(users: FollowingDataSchema[]) {
    users.forEach((u: any) => {
      // Generate profile picture URL from user ID - no need to store or sync URLs
      if (!u._profileSrc && u.uid) {
        u._profileSrc = getProfilePictureUrl(u.uid, 200);
      }
    });
  }

  getInitials(displayName: string | undefined): string {
    if (!displayName) return "?";
    return displayName.charAt(0).toUpperCase();
  }

  onImgError(event: any) {
    event.target.style.display = "none";
    // The sibling element (fallback div) will become visible if handled in template,
    // or we can set a backup src, but hiding the broken img and showing a div behind it is better for letter avatars.
    // However, simplified approach: set a flag on the user object or just use *ngIf in template.
    // Let's rely on template logic: *ngIf="!imageError" and (error)="imageError = true"
    // But since we are iterating, we can't easily use a single variable.
    // We can add a property to the user object in the list.
    const element = event.target;
    // Mark this element as failed so we can show the fallback
    element.dataset.hasError = "true";
    // For this simple implementation, let's just use the 'onError' in HTML to switch a variable on the user object if possible,
    // or use a class-based toggle.
    // Actually, simplest way for *ngFor: add a `_imgError` property to the schema locally.

    // We can't easily access the scope variable here without passing it.
    // Let's handle it in the template with a local template variable if possible, or update the model.
  }
}
