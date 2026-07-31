import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  ActivatedRoute,
  convertToParamMap,
  Router,
} from "@angular/router";
import { BehaviorSubject, NEVER, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AnalyticsService } from "../../services/analytics.service";
import { BadgeService } from "../../services/badge.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { FollowingService } from "../../services/firebase/firestore/following.service";
import { PostsService } from "../../services/firebase/firestore/posts.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { StorageService } from "../../services/firebase/storage.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { NotificationOptInService } from "../../services/notification-opt-in.service";
import { StructuredDataService } from "../../services/structured-data.service";
import { ProfilePageComponent } from "./profile-page.component";

interface FollowRequestLoader {
  _loadFollowRequests(force?: boolean): void;
}

describe("ProfilePageComponent", () => {
  const authState = new BehaviorSubject<{ uid: string } | null>({
    uid: "profile-user",
  });
  const getFollowRequestsForUser = vi.fn();

  beforeEach(() => {
    getFollowRequestsForUser.mockReset();

    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "profile-user" },
            authState$: authState,
            isAdmin: () => false,
          },
        },
        {
          provide: FollowingService,
          useValue: { getFollowRequestsForUser },
        },
        {
          provide: UsersService,
          useValue: { getPrivateData: () => NEVER },
        },
        {
          provide: PostsService,
          useValue: { getPostsFromUser: () => of({}) },
        },
        {
          provide: BadgeService,
          useValue: { getDisplayBadges: () => [] },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ userID: "profile-user" }),
            },
            paramMap: of(convertToParamMap({ userID: "profile-user" })),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: StorageService, useValue: {} },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        {
          provide: NotificationOptInService,
          useValue: { maybePrompt: vi.fn() },
        },
        { provide: AgeAssuranceService, useValue: {} },
        {
          provide: StructuredDataService,
          useValue: { removeStructuredData: vi.fn() },
        },
        {
          provide: MetaTagService,
          useValue: { setUserMetaTags: vi.fn() },
        },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    }).overrideComponent(ProfilePageComponent, {
      set: { template: "" },
    });
  });

  it("restarts an interrupted follow-request load when the profile is reinitialized", async () => {
    getFollowRequestsForUser
      .mockReturnValueOnce(NEVER)
      .mockReturnValueOnce(of([]));
    const fixture = TestBed.createComponent(ProfilePageComponent);
    const component = fixture.componentInstance;
    const loader = component as unknown as FollowRequestLoader;
    component.userId = "profile-user";
    component.isMyProfile = true;

    loader._loadFollowRequests();
    expect(component.followRequestsLoading).toBe(true);

    vi.spyOn(component, "loadProfile").mockImplementation(() => undefined);
    component.init();
    loader._loadFollowRequests();
    await fixture.whenStable();

    expect(getFollowRequestsForUser).toHaveBeenCalledTimes(2);
    expect(component.followRequestsLoading).toBe(false);
    expect(component.followRequests).toEqual([]);
  });
});
