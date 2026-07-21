import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { AuthenticationService } from "./firebase/authentication.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";
import { PushNotificationsService } from "./push-notifications.service";

describe("PushNotificationsService", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthenticationService, useValue: {} },
        { provide: FirestoreAdapterService, useValue: {} },
        { provide: Router, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("does not request or register web push during initialization", async () => {
    const service = TestBed.inject(PushNotificationsService);

    await service.initialize();

    expect(service.supported()).toBe(false);
    expect(service.permissionState()).toBe("unsupported");
    expect(service.registrationActive()).toBe(false);
  });
});
