import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { webcrypto } from "node:crypto";
import { BehaviorSubject } from "rxjs";
import { AnalyticsService } from "./analytics.service";
import { AuthenticationService } from "./firebase/authentication.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";
import { PushNotificationsService } from "./push-notifications.service";
import { WebPushClientService } from "./web-push-client.service";

describe("PushNotificationsService", () => {
  const authState = new BehaviorSubject<{ uid: string } | null>(null);
  const auth = {
    user: {} as { uid?: string },
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
    showNotification: vi.fn().mockResolvedValue(true),
  };
  const router = { navigateByUrl: vi.fn() };

  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    authState.next(null);
    auth.user = {};
    vi.clearAllMocks();
    webPush.isSupported.mockResolvedValue(false);
    webPush.permissionState.mockReturnValue("prompt");
    webPush.requestPermission.mockResolvedValue("granted");
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthenticationService, useValue: auth },
        { provide: FirestoreAdapterService, useValue: firestore },
        { provide: Router, useValue: router },
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

  it("requests web permission when the authenticated user precedes authState$", async () => {
    auth.user = { uid: "web-user" };
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
      expect.objectContaining({ platform: "web", enabled: true }),
      { merge: true },
    );
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

  it("shows foreground web messages as system notifications", async () => {
    webPush.isSupported.mockResolvedValue(true);
    const service = TestBed.inject(PushNotificationsService);
    await service.initialize();
    const listener = webPush.onMessage.mock.calls[0][0];
    const message = {
      data: { title: "Follow request", body: "Lukas wants to follow you" },
    };

    listener(message);
    await vi.waitFor(() =>
      expect(webPush.showNotification).toHaveBeenCalledWith(message),
    );
  });
});
