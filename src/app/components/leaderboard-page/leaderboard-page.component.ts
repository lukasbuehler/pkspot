import {
  Component,
  OnInit,
  inject,
  PLATFORM_ID,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule, isPlatformBrowser } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatTableModule } from "@angular/material/table";
import { MatSortModule, Sort } from "@angular/material/sort";
import { MatCardModule } from "@angular/material/card";
import { MatTabsModule } from "@angular/material/tabs";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatIconModule } from "@angular/material/icon";
import { FirestoreAdapterService } from "../../services/firebase/firestore-adapter.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { getProfilePictureUrl } from "../../../scripts/ProfilePictureHelper";

interface LeaderboardEntry {
  rank: number;
  uid: string;
  display_name: string;
  profile_picture?: string;
  spot_creates_count: number;
  spot_edits_count: number;
  media_added_count: number;
}

interface UserData {
  id: string;
  display_name?: string;
  spot_creates_count?: number;
  spot_edits_count?: number;
  media_added_count?: number;
}

@Component({
  selector: "app-leaderboard-page",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatCardModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: "./leaderboard-page.component.html",
  styleUrl: "./leaderboard-page.component.scss",
})
export class LeaderboardPageComponent implements OnInit {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _authService = inject(AuthenticationService);
  private _platformId = inject(PLATFORM_ID);
  private _cdr = inject(ChangeDetectorRef);

  leaderboardData: LeaderboardEntry[] = [];
  isLoading = true;
  displayedColumns: string[] = [
    "rank",
    "user",
    "spot_creates_count",
    "spot_edits_count",
    "media_added_count",
  ];

  sortColumn: keyof LeaderboardEntry = "spot_edits_count";
  sortDirection: "asc" | "desc" = "desc";

  ngOnInit(): void {
    // Only load on browser, skip during SSR
    if (isPlatformBrowser(this._platformId)) {
      this.loadLeaderboard();
    } else {
      this.isLoading = false;
      this._cdr.detectChanges();
    }
  }

  async loadLeaderboard(): Promise<void> {
    this.isLoading = true;
    try {
      const users = await this._firestoreAdapter.getCollection<UserData>(
        "users",
        [],
        [
          { type: "orderBy", fieldPath: "spot_edits_count", direction: "desc" },
          { type: "limit", limit: 100 },
        ]
      );

      const entries: LeaderboardEntry[] = [];
      let rank = 1;

      // Get blocked users list
      const blockedUsers =
        this._authService.user?.data?.data?.blocked_users || [];

      for (const user of users) {
        if (
          user.spot_creates_count ||
          user.spot_edits_count ||
          user.media_added_count
        ) {
          // Check if blocked
          const isBlocked = blockedUsers.includes(user.id);

          entries.push({
            rank: rank++,
            uid: user.id,
            display_name: isBlocked
              ? "Blocked User"
              : user.display_name || "Anonymous", // Redact name
            profile_picture: isBlocked
              ? ""
              : getProfilePictureUrl(user.id, 200), // Hide PFP
            spot_creates_count: user.spot_creates_count || 0,
            spot_edits_count: user.spot_edits_count || 0,
            media_added_count: user.media_added_count || 0,
          });
        }
      }

      this.leaderboardData = entries;
      this._cdr.detectChanges();
    } catch (error) {
      console.error("Error loading leaderboard:", error);
    } finally {
      this.isLoading = false;
      this._cdr.detectChanges();
    }
  }

  onSort(sort: Sort): void {
    if (!sort.active || sort.direction === "") {
      return;
    }

    const data = [...this.leaderboardData];
    const isAsc = sort.direction === "asc";

    data.sort((a, b) => {
      const aVal = a[sort.active as keyof LeaderboardEntry] as number;
      const bVal = b[sort.active as keyof LeaderboardEntry] as number;
      return (aVal - bVal) * (isAsc ? 1 : -1);
    });

    // Recalculate ranks based on new sort
    data.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    this.leaderboardData = data;
    this._cdr.detectChanges();
  }
}
