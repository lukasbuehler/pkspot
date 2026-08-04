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
    if (
      !isPlatformBrowser(this.platformId) ||
      Capacitor.isNativePlatform() ||
      !this._vapidKey() ||
      typeof Notification === "undefined" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return false;
    }

    return (await this._messagingModule()).isSupported();
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
    const module = await this._messagingModule();
    const serviceWorkerRegistration = await this._serviceWorkerRegistration();
    return module.getToken(module.getMessaging(this.firebaseApp), {
      vapidKey: this._vapidKey(),
      serviceWorkerRegistration,
    });
  }

  async deleteToken(): Promise<void> {
    const module = await this._messagingModule();
    await module.deleteToken(module.getMessaging(this.firebaseApp));
  }

  async onMessage(
    listener: (message: WebPushMessage) => void,
  ): Promise<() => void> {
    const module = await this._messagingModule();
    return module.onMessage(module.getMessaging(this.firebaseApp), listener);
  }

  async showNotification(message: WebPushMessage): Promise<boolean> {
    if (this.permissionState() !== "granted") return false;

    const data = message.data ?? {};
    const title = message.notification?.title ?? data["title"];
    const body = message.notification?.body ?? data["body"];
    if (!title && !body) return false;

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
    await registration.showNotification(title || "PK Spot", options);
    return true;
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
