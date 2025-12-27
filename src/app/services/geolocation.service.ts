import { Injectable, signal, WritableSignal } from "@angular/core";
import { Capacitor } from "@capacitor/core";
import { Geolocation, Position } from "@capacitor/geolocation";

export interface GeoLocationState {
  location: google.maps.LatLngLiteral;
  accuracy: number;
}

@Injectable({
  providedIn: "root",
})
export class GeolocationService {
  private watchId: string | null = null;
  public currentLocation: WritableSignal<GeoLocationState | null> =
    signal(null);
  public error: WritableSignal<any | null> = signal(null);

  constructor() {}

  async requestPermissions(): Promise<boolean> {
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
    if (this.watchId) return;

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error("Location permission denied");
      }

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
    this.currentLocation.set(null);
  }

  async getCurrentPosition(): Promise<GeoLocationState | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

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
