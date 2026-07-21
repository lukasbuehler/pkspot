import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import type { PrivateUserDataSchema } from "../../db/schemas/PrivateUserDataSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { UsersService } from "./firebase/firestore/users.service";
import { NotificationPreferencesService } from "./notification-preferences.service";

describe("NotificationPreferencesService", () => {
  const authState = new BehaviorSubject<{ uid?: string } | null>(null);
  const privateData = new BehaviorSubject<PrivateUserDataSchema | null>(null);
  const auth = {
    authState$ : authState,
    user: {} as { uid?: string },
  };
  const users = {
    getPrivateData: vi.fn(() => privateData),
    updatePrivateData: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    authState.next(null);
    privateData.next(null);
    auth.user = {};
    users.getPrivateData.mockClear();
    users.updatePrivateData.mockReset();
    users.updatePrivateData.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthenticationService, useValue: auth },
        { provide: UsersService, useValue: users },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("defaults every notification type to off", () => {
    const service = TestBed.inject(NotificationPreferencesService);

    expect(service.preferences()).toEqual({
      follow_requests: false,
      event_reminders: false,
      event_updates: false,
      spot_edit_updates: false,
    });
  });

  it("loads preferences only for the signed-in user", () => {
    const service = TestBed.inject(NotificationPreferencesService);
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    privateData.next({
      notification_preferences: { event_reminders: true },
    });

    expect(users.getPrivateData).toHaveBeenCalledWith("user-1");
    expect(service.preferences().event_reminders).toBe(true);

    auth.user = {};
    authState.next(null);
    expect(service.preferences().event_reminders).toBe(false);
  });

  it("writes the complete additive preference map", async () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(NotificationPreferencesService);

    await service.setPreference("spot_edit_updates", true);

    expect(users.updatePrivateData).toHaveBeenCalledWith("user-1", {
      notification_preferences: {
        follow_requests: false,
        event_reminders: false,
        event_updates: false,
        spot_edit_updates: true,
      },
    });
  });

  it("rolls back an optimistic preference when Firestore rejects it", async () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(NotificationPreferencesService);
    privateData.next({
      notification_preferences: { event_updates: true },
    });
    users.updatePrivateData.mockRejectedValueOnce(new Error("denied"));

    await expect(
      service.setPreference("event_updates", false),
    ).rejects.toThrow("denied");
    expect(service.preferences().event_updates).toBe(true);
  });
});
