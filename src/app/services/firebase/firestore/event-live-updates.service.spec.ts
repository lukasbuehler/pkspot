import { LOCALE_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject, firstValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { Event } from "../../../../db/models/Event";
import type { EventId, EventSchema } from "../../../../db/schemas/EventSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { EventLiveUpdatesService } from "./event-live-updates.service";

const buildEvent = (): Event =>
  new Event("event-1" as EventId, {
    name: "City Jam",
    venue_string: "Main park",
    locality_string: "Zurich",
    start: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
    end: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
    organizer: {
      type: "organization",
      organization: { id: "org-1", name: "Organizers", slug: "organizers" },
    },
  } as unknown as EventSchema);

describe("EventLiveUpdatesService", () => {
  it("maps realtime documents newest-first and cleans up with the observable", async () => {
    const collectionSnapshots = vi.fn(() =>
      of([
        {
          id: "update-1",
          event_id: "event-1",
          type: "weather_update",
          title: "Bring a rain jacket",
          status: "published",
          created_at: Timestamp.now(),
          created_by: "organizer-1",
          published_at: Timestamp.now(),
        },
      ]),
    );
    const service = configure({ collectionSnapshots }).service;

    const updates = await firstValueFrom(service.observeUpdates("event-1"));

    expect(updates[0].title).toBe("Bring a rain jacket");
    expect(collectionSnapshots).toHaveBeenCalledWith(
      "events/event-1/live_updates",
      undefined,
      expect.arrayContaining([
        { type: "orderBy", fieldPath: "published_at", direction: "desc" },
      ]),
    );
  });

  it("creates and disables only the signed-in user's event subscription", async () => {
    const setDocument = vi.fn(async () => undefined);
    const getDocument = vi.fn(async () => null);
    const { service } = configure({ setDocument, getDocument }, "attendee-1");

    await service.setSubscription("event-1", true);
    await service.setSubscription("event-1", false);

    expect(setDocument).toHaveBeenNthCalledWith(
      1,
      "events/event-1/live_update_subscribers/attendee-1",
      expect.objectContaining({
        user_id: "attendee-1",
        active: true,
        event_reminders: false,
      }),
      { merge: false },
    );
    expect(setDocument).toHaveBeenNthCalledWith(
      2,
      "events/event-1/live_update_subscribers/attendee-1",
      expect.objectContaining({
        user_id: "attendee-1",
        active: false,
        event_reminders: false,
      }),
      { merge: false },
    );
  });

  it("maps and stores independent event update and reminder choices", async () => {
    const setDocument = vi.fn(async () => undefined);
    const documentSnapshots = vi.fn(() =>
      of({
        user_id: "attendee-1",
        active: false,
        event_reminders: true,
        subscribed_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      }),
    );
    const { service } = configure(
      { setDocument, documentSnapshots },
      "attendee-1",
    );

    await expect(
      firstValueFrom(service.observeNotificationLevel("event-1", "attendee-1")),
    ).resolves.toBe("reminders");
    await service.setNotificationLevel("event-1", "all");

    expect(setDocument).toHaveBeenCalledWith(
      "events/event-1/live_update_subscribers/attendee-1",
      expect.objectContaining({ active: true, event_reminders: true }),
      { merge: false },
    );
  });

  it("applies the default only when no event preference exists", async () => {
    const setDocument = vi.fn(async () => undefined);
    const getDocument = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        user_id: "attendee-1",
        active: false,
        event_reminders: false,
        subscribed_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      });
    const { service } = configure(
      { setDocument, getDocument },
      "attendee-1",
    );

    await expect(
      service.ensureDefaultNotificationLevel("event-1", "reminders"),
    ).resolves.toBe(true);
    await expect(
      service.ensureDefaultNotificationLevel("event-1", "all"),
    ).resolves.toBe(false);

    expect(setDocument).toHaveBeenCalledOnce();
    expect(setDocument).toHaveBeenCalledWith(
      "events/event-1/live_update_subscribers/attendee-1",
      expect.objectContaining({ active: false, event_reminders: true }),
      { merge: false },
    );
  });

  it("does not create a subscription when the event default is none", async () => {
    const setDocument = vi.fn(async () => undefined);
    const getDocument = vi.fn(async () => null);
    const { service } = configure(
      { setDocument, getDocument },
      "attendee-1",
    );

    await expect(
      service.ensureDefaultNotificationLevel("event-1", "none"),
    ).resolves.toBe(false);
    expect(getDocument).not.toHaveBeenCalled();
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("lists only active notification choices owned by the signed-in user", async () => {
    const collectionGroupSnapshotsWithMetadata = vi.fn(() =>
      of([
        {
          id: "attendee-1",
          path: "events/event-1/live_update_subscribers/attendee-1",
          user_id: "attendee-1",
          active: true,
          event_reminders: true,
          subscribed_at: Timestamp.now(),
          updated_at: Timestamp.now(),
        },
        {
          id: "attendee-1",
          path: "events/event-2/live_update_subscribers/attendee-1",
          user_id: "attendee-1",
          active: false,
          event_reminders: false,
          subscribed_at: Timestamp.now(),
          updated_at: Timestamp.now(),
        },
      ]),
    );
    const { service } = configure(
      { collectionGroupSnapshotsWithMetadata },
      "attendee-1",
    );

    await expect(
      firstValueFrom(service.observeCurrentUserSubscriptions()),
    ).resolves.toEqual([{ eventId: "event-1", level: "all" }]);
    expect(collectionGroupSnapshotsWithMetadata).toHaveBeenCalledWith(
      "live_update_subscribers",
      [{ fieldPath: "user_id", opStr: "==", value: "attendee-1" }],
    );
  });

  it("allows only organization owners/admins or PK Spot admins to publish", async () => {
    const getDocument = vi.fn(async () => ({
      role: "admin",
      user: { uid: "organizer-1" },
    }));
    const organizer = configure({ getDocument }, "organizer-1").service;
    expect(await organizer.canCurrentUserPublish(buildEvent())).toBe(true);

    getDocument.mockResolvedValueOnce({ role: "reviewer", user: { uid: "reviewer-1" } });
    const reviewer = configure({ getDocument }, "reviewer-1").service;
    expect(await reviewer.canCurrentUserPublish(buildEvent())).toBe(false);

    const admin = configure({ getDocument }, "admin-1", true).service;
    expect(await admin.canCurrentUserPublish(buildEvent())).toBe(true);
  });

  it("publishes through the trusted callable instead of writing an update directly", async () => {
    const call = vi.fn(async () => ({ updateId: "update-1" }));
    const { service } = configure({}, "organizer-1", false, call);
    const request = {
      eventId: "event-1",
      type: "schedule_change" as const,
      title: "Final moved to 16:00",
    };

    await expect(service.publish(request)).resolves.toEqual({ updateId: "update-1" });
    expect(call).toHaveBeenCalledWith("publishEventLiveUpdate", request);
  });
});

function configure(
  firestoreOverrides: Record<string, unknown>,
  userId = "",
  isAdmin = false,
  call = vi.fn(),
): { service: EventLiveUpdatesService } {
  TestBed.resetTestingModule();
  const authState$ = new BehaviorSubject(userId ? { uid: userId } : null);
  const firestore = {
    collectionSnapshots: vi.fn(() => of([])),
    collectionGroupSnapshotsWithMetadata: vi.fn(() => of([])),
    documentSnapshots: vi.fn(() => of(null)),
    getDocument: vi.fn(async () => null),
    setDocument: vi.fn(async () => undefined),
    ...firestoreOverrides,
  };
  TestBed.configureTestingModule({
    providers: [
      EventLiveUpdatesService,
      {
        provide: AuthenticationService,
        useValue: { user: { uid: userId }, authState$, isAdmin: signal(isAdmin) },
      },
      { provide: FirestoreAdapterService, useValue: firestore },
      { provide: FunctionsAdapterService, useValue: { call } },
      { provide: LOCALE_ID, useValue: "en" },
    ],
  });
  return { service: TestBed.inject(EventLiveUpdatesService) };
}
