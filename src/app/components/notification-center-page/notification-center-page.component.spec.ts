import { signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  NotificationCenterService,
  type InAppNotificationDocument,
} from "../../services/notification-center.service";
import { NotificationCenterPageComponent } from "./notification-center-page.component";

describe("NotificationCenterPageComponent", () => {
  let component: NotificationCenterPageComponent;
  let fixture: ComponentFixture<NotificationCenterPageComponent>;
  let items: WritableSignal<InAppNotificationDocument[]>;

  beforeEach(async () => {
    items = signal([]);
    await TestBed.configureTestingModule({
      imports: [NotificationCenterPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthenticationService,
          useValue: {
            authState$: new BehaviorSubject({ uid: "user-1" }),
            initialAuthStateResolved: signal(true),
          },
        },
        {
          provide: NotificationCenterService,
          useValue: {
            items,
            unreadCount: signal(0),
            loading: signal(false),
            failed: signal(false),
            refresh: vi.fn(),
            markRead: vi.fn(),
            markAllRead: vi.fn(),
            dismiss: vi.fn(),
          },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationCenterPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("creates the notification center", () => {
    expect(component).toBeTruthy();
    expect(TestBed.inject(NotificationCenterService).refresh).toHaveBeenCalled();
  });

  it("renders a new follower notification", () => {
    items.set([
      {
        id: "new-follower-1",
        type: "new_follower",
        source_path: "users/user-1/followers/user-2",
        dedupe_key: "new-follower-1",
        path: "/u/user-2",
        payload: { follower_name: "Maya" },
        active: true,
        created_at_raw_ms: Date.now(),
        available_at_raw_ms: Date.now(),
        expires_at_raw_ms: Date.now() + 86_400_000,
        updated_at_raw_ms: Date.now(),
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("New follower");
    expect(fixture.nativeElement.textContent).toContain(
      "Maya started following you.",
    );
  });

  it("renders accepted requests and mutual followers distinctly", () => {
    const now = Date.now();
    items.set([
      {
        id: "accepted-1",
        type: "follow_accepted",
        source_path: "users/user-1/following/user-2",
        dedupe_key: "accepted-1",
        path: "/u/user-2",
        payload: { followed_user_name: "Maya" },
        active: true,
        created_at_raw_ms: now,
        available_at_raw_ms: now,
        expires_at_raw_ms: now + 86_400_000,
        updated_at_raw_ms: now,
      },
      {
        id: "mutual-1",
        type: "new_follower",
        source_path: "users/user-1/followers/user-3",
        dedupe_key: "mutual-1",
        path: "/u/user-3",
        payload: { follower_name: "Noah", relationship: "mutual" },
        active: true,
        created_at_raw_ms: now,
        available_at_raw_ms: now,
        expires_at_raw_ms: now + 86_400_000,
        updated_at_raw_ms: now,
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "Maya accepted your follow request.",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Noah followed you back.",
    );
  });

  it("asks interested attendees to confirm their plans in reminders", () => {
    const now = Date.now();
    items.set([
      {
        id: "event-reminder-1",
        type: "event_reminder",
        source_path: "events/event-1/rsvps/user-1",
        dedupe_key: "event-reminder-1",
        path: "/events/city-jam",
        payload: {
          event_name: "City Jam",
          event_id: "event-1",
          rsvp: "interested",
        },
        active: true,
        created_at_raw_ms: now,
        available_at_raw_ms: now,
        expires_at_raw_ms: now + 86_400_000,
        updated_at_raw_ms: now,
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "Please let people know if you are going.",
    );
  });

  it("renders report and community review outcomes", () => {
    const now = Date.now();
    items.set([
      {
        id: "spot-report-1",
        type: "spot_report_update",
        source_path: "spots/spot-1/reports/report-1",
        dedupe_key: "spot-report-1",
        path: "/notifications",
        payload: { target_name: "Central Plaza", outcome: "action_taken" },
        active: true,
        created_at_raw_ms: now,
        available_at_raw_ms: now,
        expires_at_raw_ms: now + 86_400_000,
        updated_at_raw_ms: now,
      },
      {
        id: "community-info-1",
        type: "community_info_update",
        source_path: "community_pages/zurich/edits/edit-1",
        dedupe_key: "community-info-1",
        path: "/map/communities/zurich",
        payload: { community_name: "Zurich", outcome: "rejected" },
        active: true,
        created_at_raw_ms: now,
        available_at_raw_ms: now,
        expires_at_raw_ms: now + 86_400_000,
        updated_at_raw_ms: now,
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "We reviewed your report about Central Plaza and took appropriate action.",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Community info rejected",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Your community information for Zurich was rejected.",
    );
  });
});
