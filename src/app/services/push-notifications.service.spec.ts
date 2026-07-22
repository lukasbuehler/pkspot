import { TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { webcrypto } from "node:crypto";
import { BehaviorSubject, EMPTY } from "rxjs";
import { AnalyticsService } from "./analytics.service";
import { AuthenticationService } from "./firebase/authentication.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";
import { PushNotificationsService } from "./push-notifications.service";
import { WebPushClientService } from "./web-push-client.service";

describe("PushNotificationsService", () => {
  const authState = new BehaviorSubject<{ uid: string } | null>(null);
  const auth = {
    authState$: authState.asObservable(),
    registerBeforeSignOutHandler: vi.fn(),
  };
  const firestore = {
    getDocument: vi.fn().mockResolvedValue(null),
    setDocument: vi.fn().mockResolvedValue(undefined),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
  };
  const webPush = {
    isSupported: vi.fn().mockResolvedValue(false),
    permissionState: vi.fn().mockReturnValue("prompt"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    getToken: vi.fn().mockResolvedValue("web-token-longer-than-twenty-characters"),
    deleteToken: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn().mockResolvedValue(vi.fn()),
  };
  const router = { navigateByUrl: vi.fn() };
  const snackbar = {
    open: vi.fn().mockReturnValue({ onAction: () => EMPTY }),
  };

  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    authState.next(null);
    vi.clearAllMocks();
    webPush.isSupported.mockResolvedValue(false);
    webPush.permissionState.mockReturnValue("prompt");
    webPush.requestPermission.mockResolvedValue("granted");
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthenticationService, useValue: auth },
        { provide: FirestoreAdapterService, useValue: firestore },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackbar },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: WebPushClientService, useValue: webPush },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("does not request or register web push during initialization", async () => {
    const service = TestBed.inject(PushNotificationsService);

    await service.initialize();

    expect(webPush.requestPermission).not.toHaveBeenCalled();
    expect(webPush.getToken).not.toHaveBeenCalled();
    expect(service.supported()).toBe(false);
    expect(service.permissionState()).toBe("unsupported");
    expect(service.registrationActive()).toBe(false);
  });

  it("waits for a user action when web permission has not been requested", async () => {
    authState.next({ uid: "web-user" });
    webPush.isSupported.mockResolvedValue(true);
    const service = TestBed.inject(PushNotificationsService);

    await service.initialize();

    expect(service.supported()).toBe(true);
    expect(service.permissionState()).toBe("prompt");
    expect(webPush.requestPermission).not.toHaveBeenCalled();
    expect(webPush.getToken).not.toHaveBeenCalled();
  });

  it("registers an authenticated web installation after contextual consent", async () => {
    authState.next({ uid: "web-user" });
    webPush.isSupported.mockResolvedValue(true);
    const service = TestBed.inject(PushNotificationsService);
    await service.initialize();

    await expect(service.requestPermissionFromUserAction()).resolves.toBe(true);

    expect(webPush.requestPermission).toHaveBeenCalledOnce();
    expect(webPush.getToken).toHaveBeenCalledOnce();
    expect(firestore.setDocument).toHaveBeenCalledWith(
      expect.stringMatching(
        /^users\/web-user\/notification_registrations\/[a-f0-9]{64}$/,
      ),
      expect.objectContaining({
        token: "web-token-longer-than-twenty-characters",
        platform: "web",
        permission_state: "granted",
        enabled: true,
      }),
      { merge: true },
    );
    expect(service.registrationActive()).toBe(true);
  });

  it("restores an already-granted web registration without prompting", async () => {
    authState.next({ uid: "web-user" });
    webPush.isSupported.mockResolvedValue(true);
    webPush.permissionState.mockReturnValue("granted");
    const service = TestBed.inject(PushNotificationsService);

    await service.initialize();

    expect(webPush.requestPermission).not.toHaveBeenCalled();
    expect(webPush.getToken).toHaveBeenCalled();
    expect(service.registrationActive()).toBe(true);
  });
});
