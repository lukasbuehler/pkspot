import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { Capacitor } from "@capacitor/core";
import { environment } from "../../environments/environment.default";
import type { NotificationPermissionState } from "../../db/schemas/NotificationSchema";
import { FIREBASE_APP } from "./firebase/firebase-client.providers";

export interface WebPushMessage {
  notification?: {
    title?: string;
    body?: string;
  };
  data?: Record<string, string>;
}

type MessagingModule = typeof import("firebase/messaging");

interface WebPushEnvironment {
  webPush?: {
    vapidKey?: string;
  };
}

interface WebNotificationAction {
  action: string;
  title: string;
}

type WebNotificationOptions = NotificationOptions & {
  actions?: WebNotificationAction[];
  image?: string;
  renotify?: boolean;
};

@Injectable({ providedIn: "root" })
export class WebPushClientService {
  private readonly firebaseApp = inject(FIREBASE_APP);
  private readonly platformId = inject(PLATFORM_ID);
  private messagingModule: MessagingModule | null = null;

  async isSupported(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId) || Capacitor.isNativePlatform()) {
      return false;
    }
    const prerequisites = {
      vapidConfigured: Boolean(this._vapidKey()),
      notificationApi: typeof Notification !== "undefined",
      serviceWorkerApi:
        typeof navigator !== "undefined" && "serviceWorker" in navigator,
    };
    if (
      !prerequisites.vapidConfigured ||
      !prerequisites.notificationApi ||
      !prerequisites.serviceWorkerApi
    ) {
      console.info("[WebPush] support check", {
        ...prerequisites,
        supported: false,
      });
      return false;
    }

    const supported = await (await this._messagingModule()).isSupported();
    console.info("[WebPush] support check", {
      ...prerequisites,
      supported,
      permission: this.permissionState(),
    });
    return supported;
  }

  permissionState(): NotificationPermissionState {
    if (typeof Notification === "undefined") return "unsupported";
    return this._mapPermission(Notification.permission);
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (typeof Notification === "undefined") return "unsupported";
    return this._mapPermission(await Notification.requestPermission());
  }

  async getToken(): Promise<string> {
    console.info("[WebPush] requesting FCM token", this._runtimeDiagnostics());
    try {
      const module = await this._messagingModule();
      const serviceWorkerRegistration = await this._serviceWorkerRegistration();
      const token = await module.getToken(module.getMessaging(this.firebaseApp), {
        vapidKey: this._vapidKey(),
        serviceWorkerRegistration,
      });
      console.info("[WebPush] FCM token received", {
        ...this._runtimeDiagnostics(),
        serviceWorkerScope: serviceWorkerRegistration.scope,
      });
      return token;
    } catch (error) {
      console.error("[WebPush] FCM token request failed", {
        ...this._runtimeDiagnostics(),
        error,
      });
      throw error;
    }
  }

  async deleteToken(): Promise<void> {
    const module = await this._messagingModule();
    await module.deleteToken(module.getMessaging(this.firebaseApp));
  }

  async onMessage(
    listener: (message: WebPushMessage) => void,
  ): Promise<() => void> {
    const module = await this._messagingModule();
    console.info(
      "[WebPush] foreground listener installed",
      this._runtimeDiagnostics(),
    );
    return module.onMessage(module.getMessaging(this.firebaseApp), (message) => {
      console.info(
        "[WebPush] foreground FCM message received",
        this._messageDiagnostics(message),
      );
      listener(message);
    });
  }

  async showNotification(message: WebPushMessage): Promise<boolean> {
    if (this.permissionState() !== "granted") {
      console.warn("[WebPush] system notification skipped", {
        ...this._runtimeDiagnostics(),
        reason: "permission_not_granted",
      });
      return false;
    }

    const data = message.data ?? {};
    const title = message.notification?.title ?? data["title"];
    const body = message.notification?.body ?? data["body"];
    if (!title && !body) {
      console.warn("[WebPush] system notification skipped", {
        ...this._messageDiagnostics(message),
        reason: "missing_title_and_body",
      });
      return false;
    }

    const actions = this._notificationActions(data["action_labels"]);
    const registration = await this._serviceWorkerRegistration();
    const options: WebNotificationOptions = {
      body: body ?? "",
      icon: "/assets/icons/icon-192.webp",
      badge: "/assets/icons/icon-96.webp",
      tag: data["thread_key"] || data["intent_id"],
      renotify: true,
      data,
      ...(data["image_url"] ? { image: data["image_url"] } : {}),
      ...(actions.length ? { actions } : {}),
    };
    console.info("[WebPush] requesting system notification", {
      ...this._messageDiagnostics(message),
      serviceWorkerScope: registration.scope,
    });
    await registration.showNotification(title || "PK Spot", options);
    console.info("[WebPush] browser accepted system notification request", {
      ...this._messageDiagnostics(message),
      displayConfirmationAvailable: false,
    });
    return true;
  }

  private _runtimeDiagnostics(): Record<string, unknown> {
    return {
      permission: this.permissionState(),
      visibility:
        typeof document === "undefined" ? "unavailable" : document.visibilityState,
      serviceWorkerControlled:
        typeof navigator !== "undefined" && "serviceWorker" in navigator
          ? Boolean(navigator.serviceWorker.controller)
          : false,
    };
  }

  private _messageDiagnostics(message: WebPushMessage): Record<string, unknown> {
    const data = message.data ?? {};
    return {
      intentId: data["intent_id"] ?? null,
      type: data["type"] ?? null,
      threadKey: data["thread_key"] ?? null,
      hasTitle: Boolean(message.notification?.title ?? data["title"]),
      hasBody: Boolean(message.notification?.body ?? data["body"]),
    };
  }

  private async _serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    return navigator.serviceWorker.ready;
  }

  private async _messagingModule(): Promise<MessagingModule> {
    this.messagingModule ??= await import("firebase/messaging");
    return this.messagingModule;
  }

  private _vapidKey(): string {
    const webPushEnvironment = environment as WebPushEnvironment;
    return webPushEnvironment.webPush?.vapidKey?.trim() ?? "";
  }

  private _mapPermission(
    permission: NotificationPermission,
  ): NotificationPermissionState {
    return permission === "default" ? "prompt" : permission;
  }

  private _notificationActions(
    value: string | undefined,
  ): WebNotificationAction[] {
    try {
      const actions: unknown = JSON.parse(value ?? "[]");
      return Array.isArray(actions)
        ? actions
            .filter(
              (item): item is WebNotificationAction =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as WebNotificationAction).action === "string" &&
                typeof (item as WebNotificationAction).title === "string",
            )
            .slice(0, 2)
        : [];
    } catch {
      return [];
    }
  }
}
