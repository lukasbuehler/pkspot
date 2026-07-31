import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { FirebaseApp } from "@angular/fire/app";
import { Capacitor } from "@capacitor/core";
import { environment } from "../../environments/environment.default";
import type { NotificationPermissionState } from "../../db/schemas/NotificationSchema";

export interface WebPushMessage {
  notification?: {
    title?: string;
    body?: string;
  };
  data?: Record<string, string>;
}

// Keep Messaging on the same Firebase SDK instance that created FirebaseApp.
type MessagingModule = typeof import("@angular/fire/messaging");

interface WebPushEnvironment {
  webPush?: {
    vapidKey?: string;
  };
}

@Injectable({ providedIn: "root" })
export class WebPushClientService {
  private readonly firebaseApp = inject(FirebaseApp);
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

  private async _serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    return navigator.serviceWorker.ready;
  }

  private async _messagingModule(): Promise<MessagingModule> {
    this.messagingModule ??= await import("@angular/fire/messaging");
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
}
