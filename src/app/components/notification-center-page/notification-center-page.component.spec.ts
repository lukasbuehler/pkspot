import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { NotificationCenterService } from "../../services/notification-center.service";
import { NotificationCenterPageComponent } from "./notification-center-page.component";

describe("NotificationCenterPageComponent", () => {
  let component: NotificationCenterPageComponent;
  let fixture: ComponentFixture<NotificationCenterPageComponent>;

  beforeEach(async () => {
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
            items: signal([]),
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
});
