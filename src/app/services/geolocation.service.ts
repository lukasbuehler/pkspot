import { Injectable, signal, WritableSignal, inject } from "@angular/core";
import { Capacitor } from "@capacitor/core";
import { Geolocation, Position } from "@capacitor/geolocation";
import { PlatformService } from "./platform.service";

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
    if (this.watchId || this.browserWatchId !== null) return;

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
        this.watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 1000,
          },
          (position: Position | null, err?: any) => {
            if (err) {
              console.error("Geolocation watch error", err);
              this.error.set(err);
              this.currentLocation.set(null);
              this.loading.set(false);
              this.watchId = null; // Clear watch ID to allow retry
              return;
            }

            if (position) {
              this.currentLocation.set({
                location: {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                },
                accuracy: position.coords.accuracy,
              });
              this.error.set(null);
              this.loading.set(false);
            }
          }
        );
      }
    } catch (e) {
      console.error("Error starting watch", e);
      this.error.set(e);
      this.loading.set(false);
    }
  }

  async stopWatching(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
    if (this.browserWatchId !== null) {
      navigator.geolocation.clearWatch(this.browserWatchId);
      this.browserWatchId = null;
    }
    this.currentLocation.set(null);
    this.loading.set(false);
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
