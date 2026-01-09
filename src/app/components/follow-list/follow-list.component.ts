import { Component, Inject, OnInit, Pipe, PipeTransform } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogRef,
} from "@angular/material/dialog";
import { User } from "../../../db/models/User";
import { StorageImage } from "../../../db/models/Media";

import { Observable } from "rxjs";
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
import { MediaType } from "../../../db/models/Interfaces";

export interface FollowListDialogData {
  userId: string;
  type: "followers" | "following";
  followUsers: FollowingDataSchema[];
  allLoaded: boolean;
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

    obs.subscribe(
      (followings) => {
        this.isLoading = false;
        this._processFollowUsers(followings);
        this.data.followUsers = this.data.followUsers.concat(followings);

        if (followings.length < chunkSize) {
          // We are at the end, and have loaded all the things
          console.log("The end!");
          this.lastLoadedFollowing = null;
          this.hasLoadedAll = true;
        } else {
          // this was not the end
          console.log("not the end!");
          this.lastLoadedFollowing =
            followings[followings.length - 1].start_following ?? null;
        }
      },
      (err) => {},
      () => {}
    );
  }

  private _processFollowUsers(users: FollowingDataSchema[]) {
    users.forEach((u: any) => {
      // Pre-calculate the profile picture source to avoid instantiating StorageImage
      // (and triggering signals) during template rendering.
      if (!u._profileSrc) {
        if (
          u.profile_picture &&
          (u.profile_picture.includes("firebasestorage") ||
            u.profile_picture.includes("gs://"))
        ) {
          try {
            // Determine if it's an image or video? Schema says profile_picture is string.
            // We assume it returns an image src.
            u._profileSrc = StorageImage.fromSchema({
              src: u.profile_picture,
              isInStorage: true,
              type: MediaType.Image,
            }).getSrc(200);
          } catch (e) {
            console.warn("Error parsing storage image", e);
            u._profileSrc = u.profile_picture;
          }
        } else {
          // External image (e.g. Google Auth) or empty
          u._profileSrc = u.profile_picture || "";
        }
      }
    });
  }
}
