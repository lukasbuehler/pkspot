import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { AnalyticsService } from "./analytics.service";
import { EventNotificationMigrationService } from "./event-notification-migration.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { NotificationOptInService } from "./notification-opt-in.service";

describe("EventNotificationMigrationService", () => {
  const maybePrompt = vi.fn();
  const call = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    call.mockResolvedValue({
      eligibleEventCount: 2,
      createdSubscriptionCount: 2,
      preservedSubscriptionCount: 0,
      scheduledReminderCount: 2,
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationOptInService, useValue: { maybePrompt } },
        { provide: FunctionsAdapterService, useValue: { call } },
        { provide: Router, useValue: { navigate } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("does not open migration prompts in screenshot fixtures", async () => {
    const screenshotGlobal = globalThis as typeof globalThis & {
      __PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__?: boolean;
    };
    screenshotGlobal.__PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__ = true;
    try {
      const service = TestBed.inject(EventNotificationMigrationService);

      await service.maybePrompt(2);

      expect(maybePrompt).not.toHaveBeenCalled();
      expect(call).not.toHaveBeenCalled();
    } finally {
      delete screenshotGlobal.__PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__;
    }
  });

  it("reconciles existing events after accepting the migration", async () => {
    maybePrompt.mockResolvedValue("context");
    const service = TestBed.inject(EventNotificationMigrationService);

    await service.maybePrompt(2);

    expect(maybePrompt).toHaveBeenCalledWith(
      "event_notifications_migration",
      { upcomingEventCount: 2 },
    );
    expect(call).toHaveBeenCalledWith("reconcileMyEventNotifications", {});
  });

  it("opens notification settings when customization is selected", async () => {
    maybePrompt.mockResolvedValue("customize");
    const service = TestBed.inject(EventNotificationMigrationService);

    await service.maybePrompt(2);

    expect(navigate).toHaveBeenCalledWith(["/settings/notifications"]);
    expect(call).not.toHaveBeenCalled();
  });

  it("can reconcile again after notification settings are customized", async () => {
    const service = TestBed.inject(EventNotificationMigrationService);

    await service.reconcile();

    expect(call).toHaveBeenCalledWith("reconcileMyEventNotifications", {});
  });

  it("checks the backend for relationships missing from the private index", async () => {
    call.mockResolvedValueOnce({ eligibleEventCount: 1 });
    maybePrompt.mockResolvedValue("dismissed");
    const service = TestBed.inject(EventNotificationMigrationService);

    await service.maybePrompt(0);

    expect(call).toHaveBeenCalledWith(
      "getMyEventNotificationMigrationState",
      {},
    );
    expect(maybePrompt).toHaveBeenCalledWith(
      "event_notifications_migration",
      { upcomingEventCount: 1 },
    );
  });
});
