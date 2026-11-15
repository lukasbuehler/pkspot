import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Inject,
  inject,
  OnInit,
  Pipe,
  PipeTransform,
  signal,
} from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogActions,
  MatDialogClose,
  MatDialogRef,
} from "@angular/material/dialog";
import { getProfilePictureUrl } from "../../../scripts/ProfilePictureHelper";

import { Observable, take } from "rxjs";
import { Timestamp } from "firebase/firestore";
import {
  parseFirestoreTimestamp,
} from "../../../scripts/Helpers";
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
import { FollowingService } from "../../services/firebase/firestore/following.service.js";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  FollowingDataSchema,
  FollowingSchema,
} from "../../../db/schemas/UserSchema";

interface FollowListUser extends FollowingSchema {
  _profileSrc?: string;
  _imgError?: boolean;
}

export interface FollowListDialogData {
  userId: string;
  type: "followers" | "following";
  followUsers: FollowingDataSchema[];
  allLoaded?: boolean;
  displayName?: string;
  isMyProfile?: boolean;
}

@Pipe({
  name: "followDuration",
  pure: true,
})
export class FollowDurationPipe implements PipeTransform {
  private readonly _dateTime = inject(DateTimeFormatService);

  /**
   * The follow date, e.g. "12.01.26", under a "Since" column. Reads the Firestore
   * timestamp, or the raw milliseconds newer documents also carry.
   */
  transform(user: FollowingSchema | null | undefined): string {
    const date =
      parseFirestoreTimestamp(user?.start_following) ??
      (typeof user?.start_following_raw_ms === "number"
        ? new Date(user.start_following_raw_ms)
        : null);
    if (!date) return "–";
    return this._dateTime.format(date, { dateStyle: "short" });
  }
}

@Component({
  selector: "app-follow-list",
  templateUrl: "./follow-list.component.html",
  styleUrls: ["./follow-list.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogTitle,
    MatDialogActions,
    MatDialogClose,
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
  readonly displayedColumns = ["user", "duration", "open"];
  readonly followUsers = signal<FollowListUser[]>([]);
  readonly isLoading = signal(false);
  readonly hasLoadedAll = signal(false);
  readonly hasLoadedFirstPage = signal(false);
  /** A failed load is shown as an error with a retry, never as "no followers". */
  readonly loadFailed = signal(false);
  readonly showLoadMore = computed(
    () =>
      !this.isLoading() &&
      !this.loadFailed() &&
      !this.hasLoadedAll() &&
      this.hasFollowUsers()
  );
  readonly hasFollowUsers = computed(() => this.followUsers().length > 0);
  readonly showEmptyState = computed(
    () =>
      this.hasLoadedFirstPage() &&
      !this.isLoading() &&
      !this.loadFailed() &&
      !this.hasFollowUsers()
  );

  readonly otherUserFallback = $localize`:@@follow_list.other_user_fallback:This user`;

  lastLoadedFollowing: Timestamp | null = null;
  private _isFirstLoad = true;
  private readonly _chunkSize = 20;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: FollowListDialogData,
    private _followingService: FollowingService,
    private _dialogRef: MatDialogRef<FollowListComponent>
  ) {}

  closeDialog() {
    this._dialogRef.close();
  }

  ngOnInit(): void {
    this.followUsers.set(
      this._processFollowUsers(
        this.data.followUsers.flatMap((user) => {
          const uid = (user as { uid?: unknown }).uid;
          return typeof uid === "string" ? [{ ...user, uid }] : [];
        })
      )
    );
    this._loadFollowing();
  }

  loadMoreFollowing() {
    this._loadFollowing();
  }

  private _loadFollowing() {
    this.isLoading.set(true);
    this.loadFailed.set(false);

    let obs: Observable<FollowingSchema[]>;
    if (this.data.type === "followers") {
      obs = this._followingService.getFollowersOfUser(
        this.data.userId,
        this._chunkSize
      );
    } else {
      obs = this._followingService.getFollowingsOfUser(
        this.data.userId,
        this._chunkSize
      );
    }

    obs.pipe(take(1)).subscribe({
      next: (followings) => {
        this.isLoading.set(false);
        this.hasLoadedFirstPage.set(true);
        console.log(`Loaded ${followings.length} items for ${this.data.type}`);
        if (followings.length === 0 && this._isFirstLoad) {
          console.warn(
            `Warning: First load returned 0 items for ${this.data.type}. Check database count vs collection content.`
          );
        }

        const processedFollowings = this._processFollowUsers(followings);

        if (this._isFirstLoad) {
          this.followUsers.set(processedFollowings);
          this._isFirstLoad = false;
        } else {
          this.followUsers.update((existing) =>
            existing.concat(processedFollowings)
          );
        }

        if (followings.length < this._chunkSize) {
          this.lastLoadedFollowing = null;
          this.hasLoadedAll.set(true);
        } else {
          this.lastLoadedFollowing =
            followings[followings.length - 1].start_following ?? null;
        }
      },
      error: (err: unknown) => {
        console.error("Error loading follow list:", err);
        this.isLoading.set(false);
        this.hasLoadedFirstPage.set(true);
        this.loadFailed.set(true);
      },
    });
  }

  private _processFollowUsers(users: FollowingSchema[]): FollowListUser[] {
    return users.map((user) => ({
      ...user,
      _profileSrc: user.uid ? getProfilePictureUrl(user.uid, 200) : undefined,
    }));
  }

  getInitials(displayName: string | undefined): string {
    if (!displayName) return "?";
    return displayName.charAt(0).toUpperCase();
  }
}
