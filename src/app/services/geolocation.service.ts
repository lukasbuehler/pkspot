import { Injectable, signal, WritableSignal, inject } from "@angular/core";
import { Capacitor } from "@capacitor/core";
import { Geolocation, Position } from "@capacitor/geolocation";
import { PlatformService } from "./platform.service";

/**
 * Native plugin error codes that mean location is unavailable to the app
 * (permission denied, restricted, or location services off). Any other code,
 * such as a timeout or a position that could not be read, is transient.
 */
const BLOCKING_NATIVE_ERROR_CODES = new Set([
  "OS-PLUG-GLOC-0003",
  "OS-PLUG-GLOC-0007",
  "OS-PLUG-GLOC-0008",
  "OS-PLUG-GLOC-0009",
]);
/** iOS drops every watch after this error, so the watch must be restarted. */
const NATIVE_TIMEOUT_CODE = "OS-PLUG-GLOC-0010";

/** Above this speed (m/s, a brisk walk) the native watch asks for faster updates. */
export const FAST_MOVEMENT_SPEED_MPS = 1.8;
/** How long the device must stay slow before the watch returns to its normal rate. */
const SLOW_DOWN_AFTER_MS = 20_000;

/** Android update rates; iOS and browsers choose their own rate. */
export function nativeWatchOptions(fast: boolean) {
  return {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 1000,
    interval: fast ? 1000 : 3000,
    minimumUpdateInterval: fast ? 500 : 2000,
  };
}

export function isBlockingNativeLocationError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && BLOCKING_NATIVE_ERROR_CODES.has(code);
}

export interface GeoLocationState {
  location: google.maps.LatLngLiteral;
  accuracy: number;
}

@Injectable({
  providedIn: "root",
})
export class GeolocationService {
  private _platformService = inject(PlatformService);
  private watchId: string | null = null;
  private browserWatchId: number | null = null;
  private fastUpdates = false;
  private lastFastMovementAt = 0;
  private lastNativePosition: Position | null = null;
  private restartingNativeWatch = false;
  public currentLocation: WritableSignal<GeoLocationState | null> =
    signal(null);
  public error: WritableSignal<any | null> = signal(null);

  public loading: WritableSignal<boolean> = signal(false);

  constructor() {}

  async checkPermissions(): Promise<boolean> {
    if (!this._platformService.isNative()) {
      if (!navigator.permissions) return false;
      try {
        const result = await navigator.permissions.query({
          name: "geolocation",
        });
        return result.state === "granted";
      } catch (e) {
        console.warn("Permissions query not supported", e);
        return false;
      }
    }

    try {
      const status = await Geolocation.checkPermissions();
      return status.location === "granted";
    } catch (e) {
      console.error("Error checking permissions", e);
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    // On web, the browser handles permissions automatically when we request location
    if (!this._platformService.isNative()) {
      // For web, we can check if geolocation is available
      if (!navigator.geolocation) {
        console.warn("Geolocation is not supported by this browser");
        return false;
      }
      // Permissions are granted when we actually request position
      return true;
    }

    // On native, use Capacitor
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === "granted") {
        return true;
      }
      const permission = await Geolocation.requestPermissions();
      return permission.location === "granted";
    } catch (e) {
      console.error("Error requesting permissions", e);
      return false;
    }
  }

  async startWatching(): Promise<void> {
    if (this.watchId || this.restartingNativeWatch || this.browserWatchId !== null) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        const error = new Error("Location permission denied");
        this.error.set(error);
        this.loading.set(false);
        throw error;
      }

      // Use browser geolocation on web, Capacitor on native
      if (!this._platformService.isNative()) {
        this.browserWatchId = navigator.geolocation.watchPosition(
          (position) => {
            this.currentLocation.set({
              location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
              accuracy: position.coords.accuracy,
            });
            this.error.set(null);
            this.loading.set(false);
          },
          (err) => {
            // specific error handling
            if (err.code === 1) {
              // PERMISSION_DENIED
              console.error("Geolocation permission denied", err);
              this.error.set(err);
              this.currentLocation.set(null);
              this.browserWatchId = null;
            } else {
              // POSITION_UNAVAILABLE (2) or TIMEOUT (3)
              // These might be transient, so we warn but don't clear current location immediately
              // to prevent UI flashing. The watch continues.
              console.warn("Geolocation transient error", err.message);
            }
            this.loading.set(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 1000,
          }
        );
      } else {
        await this.startNativeWatch();
      }
    } catch (e) {
      console.error("Error starting watch", e);
      this.error.set(e);
      this.loading.set(false);
    }
  }

  async stopWatching(): Promise<void> {
    await this.clearNativeWatch();
    this.fastUpdates = false;
    this.lastNativePosition = null;
    if (this.browserWatchId !== null) {
      navigator.geolocation.clearWatch(this.browserWatchId);
      this.browserWatchId = null;
    }
    this.currentLocation.set(null);
    this.loading.set(false);
  }

  private async startNativeWatch(): Promise<void> {
    this.watchId = await Geolocation.watchPosition(
      nativeWatchOptions(this.fastUpdates),
      (position: Position | null, err?: unknown) => {
        if (err) {
          this.handleNativeWatchError(err);
          return;
        }
        if (!position) return;
        this.currentLocation.set({
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracy: position.coords.accuracy,
        });
        this.error.set(null);
        this.loading.set(false);
        this.adaptUpdateRate(position);
      },
    );
  }

  private async clearNativeWatch(): Promise<void> {
    const id = this.watchId;
    this.watchId = null;
    if (id) await Geolocation.clearWatch({ id }).catch(() => undefined);
  }

  /**
   * The iOS plugin sends errors from any location request (including a
   * one-off `getCurrentPosition`) to every watch, so only blocking errors may
   * end the watch and report location as disabled.
   */
  private handleNativeWatchError(err: unknown): void {
    if (isBlockingNativeLocationError(err)) {
      console.error("Geolocation watch error", err);
      this.error.set(err);
      this.currentLocation.set(null);
      this.loading.set(false);
      void this.clearNativeWatch();
      return;
    }
    console.warn("Geolocation transient error", err);
    if ((err as { code?: unknown }).code === NATIVE_TIMEOUT_CODE) {
      void this.restartNativeWatch();
    }
  }

  private async restartNativeWatch(): Promise<void> {
    if (this.restartingNativeWatch || !this.watchId) return;
    this.restartingNativeWatch = true;
    try {
      await this.clearNativeWatch();
      await this.startNativeWatch();
    } catch (e) {
      console.warn("Could not restart the location watch", e);
    } finally {
      this.restartingNativeWatch = false;
    }
  }

  /** Switches the native watch to fast updates while moving and back after a slow spell. */
  private adaptUpdateRate(position: Position): void {
    const speed = movementSpeed(position, this.lastNativePosition);
    this.lastNativePosition = position;
    const now = position.timestamp;
    if (speed !== null && speed >= FAST_MOVEMENT_SPEED_MPS) {
      this.lastFastMovementAt = now;
      if (this.fastUpdates) return;
      this.fastUpdates = true;
    } else if (!this.fastUpdates || now - this.lastFastMovementAt < SLOW_DOWN_AFTER_MS) {
      return;
    } else {
      this.fastUpdates = false;
    }
    void this.restartNativeWatch();
  }

  async getCurrentPosition(): Promise<GeoLocationState | null> {
    this.loading.set(true);
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        this.loading.set(false);
        return null;
      }

      // Use browser geolocation on web, Capacitor on native
      if (!this._platformService.isNative()) {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              this.loading.set(false);
              resolve({
                location: {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                },
                accuracy: position.coords.accuracy,
              });
            },
            (err) => {
              console.error("Error getting current position", err);
              this.loading.set(false);
              resolve(null);
            },
            {
              enableHighAccuracy: true,
            }
          );
        });
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });

      this.loading.set(false);

      return {
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        accuracy: position.coords.accuracy,
      };
    } catch (e) {
      console.error("Error getting current position", e);
      this.loading.set(false);
      return null;
    }
  }
}

/** Reported speed in m/s, or the speed between the last two fixes when the device reports none. */
export function movementSpeed(position: Position, previous: Position | null): number | null {
  const reported = position.coords.speed;
  if (typeof reported === "number" && reported >= 0) return reported;
  if (!previous) return null;
  const seconds = (position.timestamp - previous.timestamp) / 1000;
  if (seconds <= 0) return null;
  const toRad = Math.PI / 180;
  const dLat = (position.coords.latitude - previous.coords.latitude) * toRad;
  const dLng = (position.coords.longitude - previous.coords.longitude) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(previous.coords.latitude * toRad) *
    Math.cos(position.coords.latitude * toRad) * Math.sin(dLng / 2) ** 2;
  return (2 * 6_371_000 * Math.asin(Math.sqrt(a))) / seconds;
}
