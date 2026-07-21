import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { of } from "rxjs";
import { AnalyticsService } from "./analytics.service";
import { AuthenticationService } from "./firebase/authentication.service";
import { NotificationOptInService } from "./notification-opt-in.service";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { PushNotificationsService } from "./push-notifications.service";

describe("NotificationOptInService", () => {
  const dialog = { open: vi.fn() };
  const preferences = {
    loading: signal(false),
    preferences: signal({
      follow_requests: false,
      event_reminders: false,
      event_updates: false,
      spot_edit_updates: false,
    }),
    hasHandledPrompt: vi.fn(() => false),
    applyPromptDecision: vi.fn(() => Promise.resolve()),
  };
  const push = {
    supported: signal(true),
    systemAllowsNotifications: signal(false),
    requestPermissionFromUserAction: vi.fn(() => Promise.resolve(true)),
    openSystemSettings: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dialog.open.mockReturnValue({ afterClosed: () => of("context") });
    preferences.preferences.set({
      follow_requests: false,
      event_reminders: false,
      event_updates: false,
      spot_edit_updates: false,
    });
    TestBed.configureTestingModule({
      providers: [
        NotificationOptInService,
        { provide: MatDialog, useValue: dialog },
        {
          provide: MatSnackBar,
          useValue: {
            open: vi.fn(() => ({ onAction: () => of(undefined) })),
          },
        },
        { provide: AuthenticationService, useValue: { user: { uid: "user-1" } } },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: NotificationPreferencesService, useValue: preferences },
        { provide: PushNotificationsService, useValue: push },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("persists the contextual choice before requesting system permission", async () => {
    const service = TestBed.inject(NotificationOptInService);

    await service.maybePrompt("event_reminders");

    expect(preferences.applyPromptDecision).toHaveBeenCalledWith(
      "event_reminders",
      "accepted",
      false,
    );
    expect(push.requestPermissionFromUserAction).toHaveBeenCalledOnce();
  });

  it("supports enabling every notification category from the secondary action", async () => {
    dialog.open.mockReturnValue({ afterClosed: () => of("all") });
    const service = TestBed.inject(NotificationOptInService);

    await service.maybePrompt("follow_activity");

    expect(preferences.applyPromptDecision).toHaveBeenCalledWith(
      "follow_activity",
      "accepted",
      true,
    );
  });

  it("does not show a prompt that was already handled", async () => {
    preferences.hasHandledPrompt.mockReturnValueOnce(true);
    const service = TestBed.inject(NotificationOptInService);

    await service.maybePrompt("spot_edit_updates");

    expect(dialog.open).not.toHaveBeenCalled();
  });
});
