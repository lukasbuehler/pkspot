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
});
