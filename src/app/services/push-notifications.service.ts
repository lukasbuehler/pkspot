import { Injectable, LOCALE_ID, computed, inject, signal } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  FirebaseMessaging,
  Importance,
  NotificationActionPerformedEvent,
  PermissionStatus,
  Visibility,
} from "@capacitor-firebase/messaging";
import { version } from "../../../package.json";
import {
  NotificationPermissionState,
  NotificationPlatform,
  NotificationRegistrationSchema,
} from "../../db/schemas/NotificationSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";

interface NotificationSettingsPlugin {
  openAppNotificationSettings(): Promise<void>;
  getSystemNotificationStatus(): Promise<{ enabled: boolean }>;
  setAutoInitEnabled(options: { enabled: boolean }): Promise<void>;
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

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (!Capacitor.isNativePlatform()) {
      this.permission.set("unsupported");
      return;
    }

    const { isSupported } = await FirebaseMessaging.isSupported();
    this.supportedState.set(isSupported);
    if (!isSupported) {
      this.permission.set("unsupported");
      return;
    }

    await this._installListeners();
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
        void this._setAutoInitEnabled(false);
      }
    });
    await this.refreshPermissionState();
  }

  async requestPermissionFromUserAction(): Promise<boolean> {
    if (!this.currentUserId || !this.supportedState()) return false;

    this.busyState.set(true);
    try {
      const result = await this._effectivePermission(
        await FirebaseMessaging.requestPermissions(),
      );
      this._setPermission(result);
      if (result.receive !== "granted") {
        await this._disableStoredRegistration("permission_denied");
        await this._setAutoInitEnabled(false);
        return false;
      }

      await this._registerCurrentInstallation(this.currentUserId);
      return true;
    } finally {
      this.busyState.set(false);
    }
  }

  async refreshPermissionState(): Promise<void> {
    if (!this.supportedState()) return;

    const result = await this._effectivePermission(
      await FirebaseMessaging.checkPermissions(),
    );
    this._setPermission(result);
    if (!this.currentUserId) {
      await this._setAutoInitEnabled(false);
    } else if (result.receive === "granted") {
      await this._registerCurrentInstallation(this.currentUserId);
    } else if (result.receive === "denied") {
      await this._disableStoredRegistration("permission_denied");
      await this._setAutoInitEnabled(false);
    }
  }

  async openSystemSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await NotificationSettings.openAppNotificationSettings();
    }
  }

  async prepareForSignOut(userId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await this._disableStoredRegistration("signed_out", userId);
      await FirebaseMessaging.deleteToken();
    } catch (error) {
      console.warn("Failed to fully unregister push notifications", error);
    } finally {
      await this._setAutoInitEnabled(false);
      this.registrationActiveState.set(false);
      this._forgetRegistrationId(userId);
    }
  }

  private async _installListeners(): Promise<void> {
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
      await Promise.all([
        FirebaseMessaging.createChannel({
          id: "social",
          name: "Social",
          description: "Follow requests and social activity",
          importance: Importance.Default,
          visibility: Visibility.Private,
          vibration: true,
        }),
        FirebaseMessaging.createChannel({
          id: "events",
          name: "Events",
          description: "Event reminders and important event changes",
          importance: Importance.Default,
          visibility: Visibility.Public,
          vibration: true,
        }),
        FirebaseMessaging.createChannel({
          id: "account",
          name: "Account and contributions",
          description: "Updates about your account and contributions",
          importance: Importance.Default,
          visibility: Visibility.Private,
          vibration: true,
        }),
      ]);
    }
  }

  private _setPermission(result: PermissionStatus): void {
    this.permission.set(result.receive);
  }

  private async _effectivePermission(
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
    const { token } = await FirebaseMessaging.getToken();
    await this._saveRegistration(userId, token);
  }

  private async _saveRegistration(userId: string, token: string): Promise<void> {
    if (!userId || userId !== this.currentUserId) return;

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
    const path = (data as Record<string, unknown>)["path"];
    if (
      typeof path === "string" &&
      path.startsWith("/") &&
      !path.startsWith("//")
    ) {
      void this.router.navigateByUrl(path);
    }
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
