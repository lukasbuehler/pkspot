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

  constructor() {}

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

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error("Location permission denied");
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
          },
          (err) => {
            console.error("Geolocation watch error", err);
            this.error.set(err);
            this.currentLocation.set(null);
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
            }
          }
        );
      }
    } catch (e) {
      console.error("Error starting watch", e);
      this.error.set(e);
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
  }

  async getCurrentPosition(): Promise<GeoLocationState | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      // Use browser geolocation on web, Capacitor on native
      if (!this._platformService.isNative()) {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
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

      return {
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        accuracy: position.coords.accuracy,
      };
    } catch (e) {
      console.error("Error getting current position", e);
      return null;
    }
  }
}
