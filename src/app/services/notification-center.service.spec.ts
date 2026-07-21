import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import type { AuthServiceUser } from "./firebase/authentication.service";
import { AuthenticationService } from "./firebase/authentication.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";
import {
  InAppNotificationDocument,
  NotificationCenterService,
} from "./notification-center.service";

describe("NotificationCenterService", () => {
  const authState = new BehaviorSubject<AuthServiceUser | null>({
    uid: "user-1",
  });
  const firestore = {
    getCollection: vi.fn(),
    setDocument: vi.fn(),
  };

  beforeEach(() => {
    authState.next({ uid: "user-1" });
    firestore.getCollection.mockReset();
    firestore.setDocument.mockReset();
    firestore.setDocument.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthenticationService,
          useValue: { authState$: authState, user: { uid: "user-1" } },
        },
        { provide: FirestoreAdapterService, useValue: firestore },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("shows only currently active notification items", async () => {
    const now = Date.now();
    firestore.getCollection.mockResolvedValue([
      notification("visible", now - 1_000, now + 60_000),
      notification("expired", now - 60_000, now - 1),
      notification("future", now + 60_000, now + 120_000),
      { ...notification("inactive", now - 1_000, now + 60_000), active: false },
      {
        ...notification("dismissed", now - 1_000, now + 60_000),
        dismissed_at_raw_ms: now,
      },
    ]);

    const service = TestBed.inject(NotificationCenterService);
    await service.refresh();

    expect(service.items().map(({ id }) => id)).toEqual(["visible"]);
    expect(service.unreadCount()).toBe(1);
  });

  it("marks a notification read and persists only client state", async () => {
    const now = Date.now();
    firestore.getCollection.mockResolvedValue([
      notification("notification-1", now - 1_000, now + 60_000),
    ]);
    const service = TestBed.inject(NotificationCenterService);
    await service.refresh();

    await service.markRead("notification-1");

    expect(service.unreadCount()).toBe(0);
    expect(firestore.setDocument).toHaveBeenCalledWith(
      "users/user-1/notifications/notification-1",
      { read_at_raw_ms: expect.any(Number) },
      { merge: true },
    );
  });

  it("removes dismissed notifications from the visible feed", async () => {
    const now = Date.now();
    firestore.getCollection.mockResolvedValue([
      notification("notification-1", now - 1_000, now + 60_000),
    ]);
    const service = TestBed.inject(NotificationCenterService);
    await service.refresh();

    await service.dismiss("notification-1");

    expect(service.items()).toEqual([]);
  });
});

function notification(
  id: string,
  availableAt: number,
  expiresAt: number,
): InAppNotificationDocument {
  return {
    id,
    type: "follow_request",
    source_path: "users/user-1/follow_requests/user-2",
    dedupe_key: id,
    path: "/profile",
    payload: { requester_name: "User 2" },
    active: true,
    created_at: {} as InAppNotificationDocument["created_at"],
    created_at_raw_ms: availableAt,
    available_at: {} as InAppNotificationDocument["available_at"],
    available_at_raw_ms: availableAt,
    expires_at: {} as InAppNotificationDocument["expires_at"],
    expires_at_raw_ms: expiresAt,
    updated_at_raw_ms: availableAt,
  };
}
