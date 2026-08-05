import { TestBed } from "@angular/core/testing";
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";
import { environment } from "../../environments/environment.default";
import { WebPushClientService } from "./web-push-client.service";
import { FIREBASE_APP } from "./firebase/firebase-client.providers";

vi.mock("firebase/messaging", () => ({
  deleteToken: vi.fn().mockResolvedValue(true),
  getMessaging: vi.fn().mockReturnValue({ name: "messaging" }),
  getToken: vi.fn().mockResolvedValue("web-token"),
  isSupported: vi.fn().mockResolvedValue(true),
  onMessage: vi.fn().mockReturnValue(vi.fn()),
}));

describe("WebPushClientService", () => {
  const configuredVapidKey = environment.webPush.vapidKey;
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const serviceWorkerRegistration = {
    scope: "https://pkspot.app/",
    showNotification,
  };
  const register = vi.fn().mockResolvedValue(serviceWorkerRegistration);
  const requestPermission = vi.fn().mockResolvedValue("granted");

  beforeEach(() => {
    environment.webPush.vapidKey = "test-public-vapid-key";
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register,
        ready: Promise.resolve(serviceWorkerRegistration),
      },
    });
    TestBed.configureTestingModule({
      providers: [{ provide: FIREBASE_APP, useValue: { name: "firebase-app" } }],
    });
  });

  afterEach(() => {
    environment.webPush.vapidKey = configuredVapidKey;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
    TestBed.resetTestingModule();
  });

  it("checks browser support without requesting permission", async () => {
    const service = TestBed.inject(WebPushClientService);

    await expect(service.isSupported()).resolves.toBe(true);

    expect(isSupported).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("maps browser permission and only requests it explicitly", async () => {
    const service = TestBed.inject(WebPushClientService);

    expect(service.permissionState()).toBe("prompt");
    await expect(service.requestPermission()).resolves.toBe("granted");

    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("registers the root worker and retrieves an FCM token with VAPID", async () => {
    const service = TestBed.inject(WebPushClientService);

    await expect(service.getToken()).resolves.toBe("web-token");

    expect(register).toHaveBeenCalledWith("/firebase-messaging-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(getToken).toHaveBeenCalledWith(
      { name: "messaging" },
      {
        vapidKey: "test-public-vapid-key",
        serviceWorkerRegistration,
      },
    );
    expect(getMessaging).toHaveBeenCalledWith({ name: "firebase-app" });
  });

  it("uses Firebase Messaging for foreground delivery and sign-out cleanup", async () => {
    const service = TestBed.inject(WebPushClientService);
    const listener = vi.fn();
    const message = {
      data: { intent_id: "intent-1", type: "follow_request" },
    };

    await service.onMessage(listener);
    const firebaseListener = vi.mocked(onMessage).mock.calls[0][1];
    firebaseListener(message);
    await service.deleteToken();

    expect(onMessage).toHaveBeenCalledWith(
      { name: "messaging" },
      expect.any(Function),
    );
    expect(listener).toHaveBeenCalledWith(message);
    expect(deleteToken).toHaveBeenCalledWith({ name: "messaging" });
  });

  it("uses the service worker to show foreground messages as system notifications", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission,
    });
    const service = TestBed.inject(WebPushClientService);

    await expect(
      service.showNotification({
        data: {
          title: "Follow request",
          body: "Lukas wants to follow you",
          intent_id: "intent-1",
          thread_key: "follow:user-1",
          path: "/notifications",
          action_labels: JSON.stringify([
            { action: "accept_follow", title: "Accept" },
          ]),
        },
      }),
    ).resolves.toBe(true);

    expect(showNotification).toHaveBeenCalledWith("Follow request", {
      body: "Lukas wants to follow you",
      icon: "/assets/icons/icon-192.webp",
      badge: "/assets/icons/icon-96.webp",
      tag: "follow:user-1",
      renotify: true,
      data: expect.objectContaining({ intent_id: "intent-1" }),
      actions: [{ action: "accept_follow", title: "Accept" }],
    });
  });

  it("does not show a system notification without granted permission", async () => {
    const service = TestBed.inject(WebPushClientService);

    await expect(
      service.showNotification({ data: { title: "Follow request" } }),
    ).resolves.toBe(false);

    expect(showNotification).not.toHaveBeenCalled();
  });
});
