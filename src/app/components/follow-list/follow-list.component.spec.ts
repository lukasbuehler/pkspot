import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { Subject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FollowingSchema } from "../../../db/schemas/UserSchema";
import {
  FollowingService,
  FollowPage,
} from "../../services/firebase/firestore/following.service";
import {
  FollowListComponent,
  FollowListDialogData,
} from "./follow-list.component";

const createDialogData = (
  overrides: Partial<FollowListDialogData> = {}
): FollowListDialogData => ({
  userId: "user-1",
  type: "followers",
  followUsers: [],
  displayName: "Avery",
  isMyProfile: true,
  ...overrides,
});

const createFollowing = (
  uid: string,
  displayName: string,
  startFollowingRawMs = 1_700_000_000_000
): FollowingSchema => ({
  uid,
  display_name: displayName,
  start_following_raw_ms: startFollowingRawMs,
});

describe("FollowListComponent", () => {
  let fixture: ComponentFixture<FollowListComponent>;
  let data: FollowListDialogData;
  let page$: Subject<FollowPage>;
  const followingService = { getFollowPage: vi.fn() };
  const followers$ = {
    next: (users: FollowingSchema[], cursor: unknown = null) =>
      page$.next({ users, cursor }),
    complete: () => page$.complete(),
    error: (error: unknown) => page$.error(error),
  };

  const createComponent = (overrides: Partial<FollowListDialogData> = {}) => {
    data = createDialogData(overrides);
    page$ = new Subject<FollowPage>();
    followingService.getFollowPage.mockImplementation(() => page$.asObservable());

    TestBed.overrideProvider(MAT_DIALOG_DATA, { useValue: data });
    fixture = TestBed.createComponent(FollowListComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [FollowListComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: FollowingService, useValue: followingService },
        { provide: MAT_DIALOG_DATA, useValue: createDialogData() },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    }).compileComponents();
  });

  it("shows the spinner while the first followers page is loading", () => {
    createComponent();

    expect(followingService.getFollowPage).toHaveBeenCalledWith(
      "user-1",
      "followers",
      20,
      null
    );
    expect(fixture.nativeElement.querySelector("mat-spinner")).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain(
      "You have no followers yet."
    );
  });

  it("renders loaded followers and clears the spinner without mutating dialog data", () => {
    createComponent();

    followers$.next([
      createFollowing("follower-1", "Blake"),
      createFollowing("follower-2", "Casey"),
    ]);
    followers$.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector("mat-spinner")).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Blake");
    expect(fixture.nativeElement.textContent).toContain("Casey");
    expect(fixture.nativeElement.querySelector("table")?.className).not.toContain(
      "d-none"
    );
    expect(data.followUsers).toEqual([]);
  });

  it("shows the empty followers copy only after loading finishes", () => {
    createComponent();

    followers$.next([]);
    followers$.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector("mat-spinner")).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      "You have no followers yet."
    );
    expect(fixture.nativeElement.textContent).not.toContain("Load More");
  });

  it("loads the following collection for following dialogs", () => {
    createComponent({ type: "following" });

    expect(followingService.getFollowPage).toHaveBeenCalledWith(
      "user-1",
      "following",
      20,
      null
    );
  });

  it("continues after the last loaded entry when loading more", () => {
    createComponent();
    followers$.next([createFollowing("follower-1", "Blake")], "cursor-1");
    fixture.detectChanges();

    page$ = new Subject<FollowPage>();
    fixture.componentInstance.loadMoreFollowing();
    expect(followingService.getFollowPage).toHaveBeenLastCalledWith(
      "user-1",
      "followers",
      20,
      "cursor-1"
    );
    followers$.next([
      createFollowing("follower-1", "Blake"),
      createFollowing("follower-2", "Casey"),
    ]);
    fixture.detectChanges();

    const names = fixture.componentInstance
      .followUsers()
      .map((user) => user.display_name);
    expect(names).toEqual(["Blake", "Casey"]);
    expect(fixture.componentInstance.hasLoadedAll()).toBe(true);
  });

  it("shows a retry instead of an empty list when loading fails", () => {
    createComponent();

    followers$.error(new Error("offline"));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("This list couldn't be loaded.");
    expect(text).not.toContain("You have no followers yet.");
    expect(text).not.toContain("Load more");
  });
});
