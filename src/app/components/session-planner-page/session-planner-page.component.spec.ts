import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { EventEditPatch } from "../event-edit-form/event-edit-form.component";
import { SessionPlannerPageComponent } from "./session-planner-page.component";

describe("SessionPlannerPageComponent", () => {
  it("creates a public, user-owned session with normal priority", async () => {
    const authUser = { uid: "session-owner", data: null };
    const createEvent = vi.fn().mockResolvedValue({
      id: "session-id",
      slug: "evening-training",
      attendance: { admission: "none" },
    });
    const navigate = vi.fn().mockResolvedValue(true);
    const trackEvent = vi.fn();
    const open = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthenticationService,
          useValue: {
            user: authUser,
            authState$: new BehaviorSubject(authUser),
            initialAuthStateResolved: signal(true),
          },
        },
        {
          provide: AgeAssuranceService,
          useValue: {
            canParticipatePublicly: () => true,
            getRestrictionMessage: () => "Restricted",
          },
        },
        { provide: EventsService, useValue: { createEvent } },
        { provide: AnalyticsService, useValue: { trackEvent } },
        {
          provide: MetaTagService,
          useValue: {
            setStaticPageMetaTags: vi.fn(),
            setRobotsContent: vi.fn(),
          },
        },
        { provide: Router, useValue: { navigate } },
        { provide: MatSnackBar, useValue: { open } },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new SessionPlannerPageComponent(),
    );
    await component.onSave({ name: "Evening training" } as EventEditPatch);

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Evening training",
        owner: { type: "user", user_id: "session-owner" },
        kind: "session",
        schedule_mode: "single",
        lifecycle_status: "planned",
        priority: "normal",
        publication_state: "published",
        published: true,
        visibility: "public",
        discoverability: { audience: "global" },
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith("session_created", {
      visibility: "public",
      attendance_admission: "none",
    });
    expect(navigate).toHaveBeenCalledWith([
      "/events",
      "evening-training",
    ]);
  });
});
