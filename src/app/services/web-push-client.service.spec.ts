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
  const serviceWorkerRegistration = { scope: "https://pkspot.app/" };
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

    await service.onMessage(listener);
    await service.deleteToken();

    expect(onMessage).toHaveBeenCalledWith({ name: "messaging" }, listener);
    expect(deleteToken).toHaveBeenCalledWith({ name: "messaging" });
  });
});
