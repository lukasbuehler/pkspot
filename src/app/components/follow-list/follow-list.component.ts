import { Component, Inject, OnInit, Pipe, PipeTransform } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogTitle } from "@angular/material/dialog";
import { User } from "../../../db/models/User";

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
import { NgIf } from "@angular/common";
import { FollowingService } from "../../services/firebase/firestore/following.service.js";
import { FollowingDataSchema } from "../../../db/schemas/UserSchema";

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
    NgIf,
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
  ],
})
export class FollowListComponent implements OnInit {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: FollowListDialogData,
    private _followingService: FollowingService
  ) {}

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
}
