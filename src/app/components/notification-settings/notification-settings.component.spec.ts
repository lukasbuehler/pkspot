import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideRouter } from "@angular/router";
import { signal } from "@angular/core";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityFollowDocument } from "../../../db/schemas/CommunityFollowSchema";
import {
  NOTIFICATION_PREFERENCE_KEYS,
  type NotificationPreferencesSchema,
} from "../../../db/schemas/NotificationSchema";
import { EventNotificationMigrationService } from "../../services/event-notification-migration.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityFollowsService } from "../../services/firebase/firestore/community-follows.service";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { PushNotificationsService } from "../../services/push-notifications.service";
import { NotificationSettingsComponent } from "./notification-settings.component";

const defaultPreferences: Required<NotificationPreferencesSchema> = {
  follow_requests: false,
  event_reminders: false,
  event_updates: false,
  spot_edit_updates: false,
  report_updates: false,
  community_info_updates: false,
  community_events: false,
  community_spot_digest: false,
  event_reminder_offsets_minutes: [120],
};

const followedCommunities = [
  {
    id: "country-ch",
    community_key: "country:ch",
    scope: "country",
    display_name: "Switzerland",
    canonical_path: "/map/communities/switzerland",
    time_created: {},
    time_created_raw_ms: 1,
    event_notifications: true,
    spot_digest_notifications: false,
  },
  {
    id: "locality-zurich",
    community_key: "locality:ch:zh:zurich",
    scope: "locality",
    display_name: "Zürich",
    canonical_path: "/map/communities/zurich",
    time_created: {},
    time_created_raw_ms: 2,
    event_notifications: false,
    spot_digest_notifications: false,
  },
] as CommunityFollowDocument[];

describe("NotificationSettingsComponent", () => {
  let component: NotificationSettingsComponent;
  let fixture: ComponentFixture<NotificationSettingsComponent>;
  let preferences: ReturnType<typeof signal<Required<NotificationPreferencesSchema>>>;
  let systemAllowsNotifications: ReturnType<typeof signal<boolean>>;
  let setPreferences: ReturnType<typeof vi.fn>;
  let requestPermission: ReturnType<typeof vi.fn>;
  let setCommunityNotifications: ReturnType<typeof vi.fn>;
  let reconcile: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    preferences = signal({ ...defaultPreferences });
    systemAllowsNotifications = signal(true);
    setPreferences = vi.fn(
      async (keys: readonly (typeof NOTIFICATION_PREFERENCE_KEYS)[number][], enabled: boolean) => {
        preferences.update((current) => {
          const next = { ...current };
          for (const key of keys) next[key] = enabled;
          return next;
        });
      },
    );
    requestPermission = vi.fn(async () => true);
    setCommunityNotifications = vi.fn(async () => undefined);
    reconcile = vi.fn(async () => undefined);

    await TestBed.configureTestingModule({
      imports: [NotificationSettingsComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthenticationService,
          useValue: { authState$: of({ uid: "notification-settings-user" }) },
        },
        {
          provide: NotificationPreferencesService,
          useValue: {
            preferences,
            loading: signal(false),
            setPreferences,
            setDefaultEventReminderOffsets: vi.fn(async () => undefined),
          },
        },
        {
          provide: PushNotificationsService,
          useValue: {
            supported: signal(true),
            permissionState: signal("granted"),
            blockedBySystem: signal(false),
            busy: signal(false),
            systemAllowsNotifications,
            canOpenSystemSettings: false,
            requestPermissionFromUserAction: requestPermission,
            openSystemSettings: vi.fn(async () => undefined),
          },
        },
        {
          provide: CommunityFollowsService,
          useValue: {
            listMine: vi.fn(async () => followedCommunities),
            setNotifications: setCommunityNotifications,
          },
        },
        {
          provide: EventNotificationMigrationService,
          useValue: { reconcile },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationSettingsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("renders Material tables for notification types and communities", () => {
    const tables = fixture.nativeElement.querySelectorAll("table[mat-table]");

    expect(tables).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain("Follow activity");
    expect(fixture.nativeElement.textContent).toContain("Switzerland");
  });

  it("shows an indeterminate master selection when some types are enabled", async () => {
    preferences.update((current) => ({
      ...current,
      follow_requests: true,
    }));
    await fixture.whenStable();

    expect(component.someNotificationsEnabled()).toBe(true);
    expect(component.allNotificationsEnabled()).toBe(false);
    expect(component.notificationSelectionIndeterminate()).toBe(true);
  });

  it("selects every notification with one permission request and one write", async () => {
    systemAllowsNotifications.set(false);

    await component.setAllNotificationPreferences(true);

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(setPreferences).toHaveBeenCalledWith(
      NOTIFICATION_PREFERENCE_KEYS,
      true,
    );
    expect(setPreferences).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledOnce();
    expect(component.allNotificationsEnabled()).toBe(true);
  });

  it("deselects every notification without requesting system permission", async () => {
    preferences.set({
      ...defaultPreferences,
      follow_requests: true,
      event_reminders: true,
      event_updates: true,
      spot_edit_updates: true,
      report_updates: true,
      community_info_updates: true,
      community_events: true,
      community_spot_digest: true,
    });

    await component.setAllNotificationPreferences(false);

    expect(requestPermission).not.toHaveBeenCalled();
    expect(setPreferences).toHaveBeenCalledWith(
      NOTIFICATION_PREFERENCE_KEYS,
      false,
    );
    expect(reconcile).not.toHaveBeenCalled();
    expect(component.someNotificationsEnabled()).toBe(false);
  });

  it("bulk-enables an entire community notification column", async () => {
    await component.setAllCommunityNotifications("spots", true);

    expect(setPreferences).toHaveBeenCalledWith(
      ["community_spot_digest"],
      true,
    );
    expect(setCommunityNotifications).toHaveBeenCalledTimes(2);
    expect(setCommunityNotifications).toHaveBeenCalledWith("country:ch", {
      spotDigestNotifications: true,
    });
    expect(component.allCommunitySpotsEnabled()).toBe(true);
  });
});
