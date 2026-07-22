import { Injectable, LOCALE_ID, computed, inject, signal } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  FirebaseMessaging,
  NotificationActionPerformedEvent,
  PermissionStatus,
} from "@capacitor-firebase/messaging";
import { version } from "../../../package.json";
import {
  NotificationPermissionState,
  NotificationPlatform,
  NotificationRegistrationSchema,
} from "../../db/schemas/NotificationSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";
import { AnalyticsService } from "./analytics.service";
import {
  WebPushClientService,
  WebPushMessage,
} from "./web-push-client.service";

interface NotificationSettingsPlugin {
  openAppNotificationSettings(): Promise<void>;
  getSystemNotificationStatus(): Promise<{ enabled: boolean }>;
  setAutoInitEnabled(options: { enabled: boolean }): Promise<void>;
  configureNotificationChannels(): Promise<void>;
}

const NotificationSettings = registerPlugin<NotificationSettingsPlugin>(
  "NotificationSettings",
);
const REGISTRATION_STORAGE_PREFIX = "pkspot_notification_registration_";

@Injectable({ providedIn: "root" })
export class PushNotificationsService {
  private readonly auth = inject(AuthenticationService);
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly analytics = inject(AnalyticsService);
  private readonly webPush = inject(WebPushClientService);
  private readonly locale = inject(LOCALE_ID);
  private readonly supportedState = signal(false);
  private readonly permission = signal<NotificationPermissionState>("unknown");
  private readonly registrationActiveState = signal(false);
  private readonly busyState = signal(false);
  private initialized = false;
  private currentUserId: string | null = null;

  readonly supported = this.supportedState.asReadonly();
  readonly permissionState = this.permission.asReadonly();
  readonly registrationActive = this.registrationActiveState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly systemAllowsNotifications = computed(
    () => this.permission() === "granted",
  );
  readonly blockedBySystem = computed(() => this.permission() === "denied");
  readonly canOpenSystemSettings = Capacitor.isNativePlatform();

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const isNative = Capacitor.isNativePlatform();
    const isSupported = isNative
      ? (await FirebaseMessaging.isSupported()).isSupported
      : await this.webPush.isSupported();
    this.supportedState.set(isSupported);
    if (!isSupported) {
      this.permission.set("unsupported");
      return;
    }

    if (isNative) {
      await this._installNativeListeners();
    } else {
      await this._installWebListeners();
    }
    this.auth.registerBeforeSignOutHandler((userId) =>
      this.prepareForSignOut(userId),
    );
    this.auth.authState$.subscribe((user) => {
      this.currentUserId = user?.uid ?? null;
      if (this.currentUserId) {
        void this.refreshPermissionState().catch((error) => {
          console.warn("Failed to refresh notification permission", error);
        });
      } else {
        this.registrationActiveState.set(false);
        if (isNative) void this._setAutoInitEnabled(false);
      }
    });
    await this.refreshPermissionState();
  }

  async requestPermissionFromUserAction(): Promise<boolean> {
    const userId = this._authenticatedUserId();
    if (!userId || !this.supportedState()) return false;

    this.busyState.set(true);
    try {
      const permission = Capacitor.isNativePlatform()
        ? (
            await this._effectiveNativePermission(
              await FirebaseMessaging.requestPermissions(),
            )
          ).receive
        : await this.webPush.requestPermission();
      this.permission.set(permission);
      if (permission !== "granted") {
        await this._disableStoredRegistration("permission_denied");
        if (Capacitor.isNativePlatform()) {
          await this._setAutoInitEnabled(false);
        }
        return false;
      }

      await this._registerCurrentInstallation(userId);
      return true;
    } finally {
      this.busyState.set(false);
    }
  }

  async refreshPermissionState(): Promise<void> {
    if (!this.supportedState()) return;

    const isNative = Capacitor.isNativePlatform();
    const permission = isNative
      ? (
          await this._effectiveNativePermission(
            await FirebaseMessaging.checkPermissions(),
          )
        ).receive
      : this.webPush.permissionState();
    this.permission.set(permission);
    if (!this.currentUserId) {
      if (isNative) await this._setAutoInitEnabled(false);
    } else if (permission === "granted") {
      await this._registerCurrentInstallation(this.currentUserId);
    } else if (permission === "denied") {
      await this._disableStoredRegistration("permission_denied");
      if (isNative) await this._setAutoInitEnabled(false);
    }
  }

  async openSystemSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await NotificationSettings.openAppNotificationSettings();
    }
  }

  async prepareForSignOut(userId: string): Promise<void> {
    if (!this.supportedState()) return;

    try {
      await this._disableStoredRegistration("signed_out", userId);
      if (Capacitor.isNativePlatform()) {
        await FirebaseMessaging.deleteToken();
      } else {
        await this.webPush.deleteToken();
      }
    } catch (error) {
      console.warn("Failed to fully unregister push notifications", error);
    } finally {
      if (Capacitor.isNativePlatform()) {
        await this._setAutoInitEnabled(false);
      }
      this.registrationActiveState.set(false);
      this._forgetRegistrationId(userId);
    }
  }

  private async _installNativeListeners(): Promise<void> {
    await FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
      if (this.currentUserId && this.permission() === "granted") {
        void this._saveRegistration(this.currentUserId, token);
      }
    });
    await FirebaseMessaging.addListener("notificationReceived", ({ notification }) => {
      if (Capacitor.getPlatform() !== "android") {
        return;
      }
      const message = [notification.title, notification.body]
        .filter((part): part is string => Boolean(part))
        .join(": ");
      if (message) {
        this.snackbar.open(message, $localize`:@@notifications.dismiss:Dismiss`, {
          duration: 5000,
        });
      }
    });
    await FirebaseMessaging.addListener(
      "notificationActionPerformed",
      (event) => this._openNotification(event),
    );
    await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void this.refreshPermissionState().catch((error) => {
          console.warn("Failed to refresh notification permission", error);
        });
      }
    });

    if (Capacitor.getPlatform() === "android") {
      await NotificationSettings.configureNotificationChannels();
    }
  }

  private async _installWebListeners(): Promise<void> {
    await this.webPush.onMessage((message) =>
      this._showWebForegroundNotification(message),
    );
    window.addEventListener("focus", () => {
      void this.refreshPermissionState().catch((error) => {
        console.warn("Failed to refresh web notification permission", error);
      });
    });
  }

  private async _effectiveNativePermission(
    permission: PermissionStatus,
  ): Promise<PermissionStatus> {
    if (permission.receive !== "granted") return permission;

    try {
      const { enabled } =
        await NotificationSettings.getSystemNotificationStatus();
      return enabled ? permission : { receive: "denied" };
    } catch (error) {
      console.warn("Failed to read system notification status", error);
      return permission;
    }
  }

  private async _registerCurrentInstallation(userId: string): Promise<void> {
    const token = Capacitor.isNativePlatform()
      ? (await FirebaseMessaging.getToken()).token
      : await this.webPush.getToken();
    await this._saveRegistration(userId, token);
  }

  private async _saveRegistration(userId: string, token: string): Promise<void> {
    if (!userId || userId !== this._authenticatedUserId()) return;

    const registrationId = await this._hashToken(token);
    const previousRegistrationId = this._storedRegistrationId(userId);
    const path = `users/${userId}/notification_registrations/${registrationId}`;
    const existing =
      await this.firestore.getDocument<NotificationRegistrationSchema>(path);
    const now = Date.now();
    const registration: NotificationRegistrationSchema = {
      token,
      platform: Capacitor.getPlatform() as NotificationPlatform,
      app_version: version,
      locale: this.locale,
      permission_state: "granted",
      enabled: true,
      created_at_raw_ms: existing?.created_at_raw_ms ?? now,
      last_seen_at_raw_ms: now,
    };

    await this.firestore.setDocument(path, registration, { merge: true });
    this._rememberRegistrationId(userId, registrationId);
    this.registrationActiveState.set(true);

    if (
      previousRegistrationId &&
      previousRegistrationId !== registrationId
    ) {
      await this.firestore
        .deleteDocument(
          `users/${userId}/notification_registrations/${previousRegistrationId}`,
        )
        .catch((error) => {
          console.warn("Failed to remove a rotated notification token", error);
        });
    }
  }

  private async _disableStoredRegistration(
    reason: NotificationRegistrationSchema["disabled_reason"],
    userId = this.currentUserId,
  ): Promise<void> {
    if (!userId) return;
    const registrationId = this._storedRegistrationId(userId);
    if (!registrationId) return;

    await this.firestore.setDocument(
      `users/${userId}/notification_registrations/${registrationId}`,
      {
        enabled: false,
        permission_state: this.permission(),
        disabled_reason: reason,
        last_seen_at_raw_ms: Date.now(),
      },
      { merge: true },
    );
    this.registrationActiveState.set(false);
  }

  private _openNotification(event: NotificationActionPerformedEvent): void {
    const data = event.notification.data;
    if (!data || typeof data !== "object") return;
    this._openNotificationData(data as Record<string, unknown>);
  }

  private _showWebForegroundNotification(message: WebPushMessage): void {
    const text = [message.notification?.title, message.notification?.body]
      .filter((part): part is string => Boolean(part))
      .join(": ");
    if (!text) return;

    const data = message.data ?? {};
    const hasPath = this._notificationPath(data) !== null;
    const ref = this.snackbar.open(
      text,
      hasPath
        ? $localize`:@@notifications.open:Open`
        : $localize`:@@notifications.dismiss:Dismiss`,
      { duration: 8000 },
    );
    if (hasPath) {
      ref.onAction().subscribe(() => this._openNotificationData(data));
    }
  }

  private _openNotificationData(
    notificationData: Record<string, unknown>,
  ): void {
    if (
      notificationData["type"] === "event_update" &&
      typeof notificationData["update_id"] === "string"
    ) {
      this.analytics.trackEvent("live_update_notification_opened", {
        event_id: notificationData["event_id"],
        update_type: notificationData["live_update_type"],
      });
    }
    const path = this._notificationPath(notificationData);
    if (path) void this.router.navigateByUrl(path);
  }

  private _notificationPath(
    notificationData: Record<string, unknown>,
  ): string | null {
    const path = notificationData["path"];
    return typeof path === "string" &&
      path.startsWith("/") &&
      !path.startsWith("//")
      ? path
      : null;
  }

  private _authenticatedUserId(): string | null {
    const userId = this.currentUserId ?? this.auth.user.uid;
    return typeof userId === "string" && userId.trim() ? userId : null;
  }

  private async _hashToken(token: string): Promise<string> {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  private _storedRegistrationId(userId: string): string | null {
    return localStorage.getItem(`${REGISTRATION_STORAGE_PREFIX}${userId}`);
  }

  private _rememberRegistrationId(userId: string, registrationId: string): void {
    localStorage.setItem(`${REGISTRATION_STORAGE_PREFIX}${userId}`, registrationId);
  }

  private _forgetRegistrationId(userId: string): void {
    localStorage.removeItem(`${REGISTRATION_STORAGE_PREFIX}${userId}`);
  }

  private async _setAutoInitEnabled(enabled: boolean): Promise<void> {
    try {
      await NotificationSettings.setAutoInitEnabled({ enabled });
    } catch (error) {
      console.warn("Failed to update Firebase Messaging auto-init", error);
    }
  }
}
