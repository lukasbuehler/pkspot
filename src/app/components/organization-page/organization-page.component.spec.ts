import { LOCALE_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { OrganizationPageComponent } from "./organization-page.component";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("OrganizationPageComponent", () => {
  it("loads the roster only for a member of that organization", async () => {
    const authState$ = new BehaviorSubject<{ uid: string } | null>(null);
    const member = {
      id: "owner-user",
      role: "owner" as const,
      user: { uid: "owner-user", display_name: "Organization Owner" },
    };
    const organizationsService = {
      getOrganizationBySlugOrId: vi.fn().mockResolvedValue({
        id: "spa",
        slug: "spa",
        name: "Swiss Parkour Association",
        active: true,
      }),
      getOrganizationMember: vi.fn().mockResolvedValue(null),
      getOrganizationMembers: vi.fn().mockResolvedValue([member]),
      getStewardedSpots: vi.fn().mockResolvedValue([]),
      getManagedSpots: vi.fn().mockResolvedValue([]),
      getUsedSpots: vi.fn().mockResolvedValue([]),
    };
    const eventsService = {
      getEventsForOrganization: vi.fn().mockResolvedValue([]),
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(
              convertToParamMap({ slugOrId: "spa" }),
            ),
          },
        },
        {
          provide: AuthenticationService,
          useValue: { authState$, isAdmin: signal(false) },
        },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: EventsService, useValue: eventsService },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new OrganizationPageComponent(),
    );
    component.ngOnInit();
    await flushPromises();

    expect(eventsService.getEventsForOrganization).toHaveBeenCalledWith("spa");
    expect(organizationsService.getOrganizationMembers).not.toHaveBeenCalled();
    expect(component.canViewMembers()).toBe(false);
    expect(component.members()).toEqual([]);

    authState$.next({ uid: "community-user" });
    await flushPromises();

    expect(organizationsService.getOrganizationMember).toHaveBeenCalledWith(
      "spa",
      "community-user",
    );
    expect(organizationsService.getOrganizationMembers).not.toHaveBeenCalled();
    expect(component.canViewMembers()).toBe(false);

    organizationsService.getOrganizationMember.mockResolvedValue(member);
    authState$.next({ uid: "owner-user" });
    await flushPromises();

    expect(organizationsService.getOrganizationMembers).toHaveBeenCalledWith(
      "spa",
    );
    expect(component.canViewMembers()).toBe(true);
    expect(component.members()).toEqual([member]);

    authState$.next(null);
    expect(component.canViewMembers()).toBe(false);
    expect(component.members()).toEqual([]);
  });

  it("offers global admins a direct organization edit link", async () => {
    const isAdmin = signal(true);
    const authState$ = new BehaviorSubject<{ uid: string }>({
      uid: "admin-user",
    });
    const organizationsService = {
      getOrganizationBySlugOrId: vi.fn().mockResolvedValue({
        id: "wpf",
        slug: "wpf",
        name: "World Parkour Federation",
        active: true,
      }),
      getOrganizationMember: vi.fn().mockResolvedValue(null),
      getOrganizationMembers: vi.fn().mockResolvedValue([]),
      getStewardedSpots: vi.fn().mockResolvedValue([]),
      getManagedSpots: vi.fn().mockResolvedValue([]),
      getUsedSpots: vi.fn().mockResolvedValue([]),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(
              convertToParamMap({ slugOrId: "wpf" }),
            ),
          },
        },
        {
          provide: AuthenticationService,
          useValue: { authState$, isAdmin },
        },
        { provide: OrganizationsService, useValue: organizationsService },
        {
          provide: EventsService,
          useValue: { getEventsForOrganization: vi.fn().mockResolvedValue([]) },
        },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });

    const fixture = TestBed.createComponent(OrganizationPageComponent);
    await flushPromises();
    await fixture.whenStable();

    const editLink = fixture.nativeElement.querySelector(
      'a[href="/organization-admin?organization=wpf"]',
    ) as HTMLAnchorElement | null;
    expect(editLink?.textContent).toContain("Edit organization");

    isAdmin.set(false);
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelector(
        'a[href="/organization-admin?organization=wpf"]',
      ),
    ).toBeNull();
  });
});
