import { TestBed } from "@angular/core/testing";
import { Timestamp } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import type { EventEditPatch } from "../event-edit-form/event-edit-form.component";
import { EventAuthoringService } from "../../services/event-authoring.service";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { Router } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";
import { EventCreatePageComponent } from "./event-create-page.component";

describe("EventCreatePageComponent", () => {
  it.each([false, true])("creates formal events for an organization leader or unverified admin (%s)", async (admin) => {
    const authoring = {
      createFormalEvent: vi.fn().mockResolvedValue({
        eventId: "formal-1",
        slug: "event-formal-1",
      }),
    };
    const events = { updateEvent: vi.fn().mockResolvedValue(undefined) };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        EventCreatePageComponent,
        {
          provide: AuthenticationService,
          useValue: {
            isAdmin: () => admin,
            user: { uid: "leader-1" },
          },
        },
        { provide: EventAuthoringService, useValue: authoring },
        {
          provide: AgeAssuranceService,
          useValue: { hasVerifiedAdultEligibility: () => !admin },
        },
        { provide: EventsService, useValue: events },
        {
          provide: OrganizationsService,
          useValue: {
            getManagerOrganizations: vi.fn().mockResolvedValue([
              { id: "club-1", name: "Club", slug: "club", active: true },
            ]),
          },
        },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        {
          provide: MetaTagService,
          useValue: { setStaticPageMetaTags: vi.fn(), setRobotsContent: vi.fn() },
        },
      ],
    });
    const component = TestBed.inject(EventCreatePageComponent);
    component.ngOnInit();
    await Promise.resolve();

    await component.onSave({
      name: "Club Jam",
      description_i18n: { en: "A proper club event." },
      locality_string: "Zurich",
      start: Timestamp.fromDate(new Date("2026-10-01T15:00:00.000Z")),
      end: Timestamp.fromDate(new Date("2026-10-01T18:00:00.000Z")),
      time_zone: "Europe/Zurich",
      organizer: {
        type: "organization",
        organization: { id: "club-1", name: "Club", slug: "club" },
      },
    } as EventEditPatch);

    expect(authoring.createFormalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Club Jam",
        organizationId: "club-1",
        startsAt: "2026-10-01T15:00:00.000Z",
      }),
    );
    expect(events.updateEvent).toHaveBeenCalledWith(
      "formal-1",
      expect.not.objectContaining({ owner: expect.anything(), slug: expect.anything() }),
    );
    expect(router.navigate).toHaveBeenCalledWith(["/events", "event-formal-1"]);
  });
});
