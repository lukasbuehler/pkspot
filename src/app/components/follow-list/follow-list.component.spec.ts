import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { Subject, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FollowingSchema } from "../../../db/schemas/UserSchema";
import { FollowingService } from "../../services/firebase/firestore/following.service";
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
  let followers$: Subject<FollowingSchema[]>;
  let following$: Subject<FollowingSchema[]>;
  const followingService = {
    getFollowersOfUser: vi.fn(),
    getFollowingsOfUser: vi.fn(),
  };

  const createComponent = (overrides: Partial<FollowListDialogData> = {}) => {
    data = createDialogData(overrides);
    followers$ = new Subject<FollowingSchema[]>();
    following$ = new Subject<FollowingSchema[]>();
    followingService.getFollowersOfUser.mockReturnValue(
      followers$.asObservable()
    );
    followingService.getFollowingsOfUser.mockReturnValue(
      following$.asObservable()
    );

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

    expect(followingService.getFollowersOfUser).toHaveBeenCalledWith(
      "user-1",
      20
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
    followingService.getFollowersOfUser.mockReturnValue(of([]));
    createComponent({ type: "following" });

    expect(followingService.getFollowingsOfUser).toHaveBeenCalledWith(
      "user-1",
      20
    );
  });
});
