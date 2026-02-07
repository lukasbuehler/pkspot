import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { GeolocationService } from "./geolocation.service";
import { SpotsService } from "./firebase/firestore/spots.service";
import { Spot } from "../../db/models/Spot";
import { getTileCoordinatesForLocationAndZoom } from "../../scripts/TileCoordinateHelpers";
import { MapHelpers } from "../../scripts/MapHelpers";
import { take } from "rxjs";
import { toObservable } from "@angular/core/rxjs-interop";

@Injectable({
  providedIn: "root",
})
export class CheckInService {
  private _geolocationService = inject(GeolocationService);
  private _spotsService = inject(SpotsService);

  // Configuration
  private readonly PROXIMITY_THRESHOLD_METERS = 50;
  private readonly COOLDOWN_DURATION_MS = 1000 * 60 * 60 * 4; // 4 hours
  private readonly STORAGE_KEY_COOLDOWN = "pkspot_checkin_cooldowns";

  // State
  public currentProximitySpot = signal<Spot | null>(null);
  public showGlobalChip = signal<boolean>(true);

  // Cooldowns map: spotId -> timestamp (ms)
  private _cooldowns = signal<Record<string, number>>({});

  constructor() {
    this._loadCooldowns();

    // Effect to monitor location changes
    effect(() => {
      const locationState = this._geolocationService.currentLocation();
      if (locationState && locationState.location) {
        this._checkProximity(locationState.location, locationState.accuracy);
      }
    });

    // Attempt to start watching if we already have permissions
    this._geolocationService.checkPermissions().then((granted) => {
      if (granted) {
        console.debug(
          "Geolocation permissions already granted, starting watch..."
        );
        this._geolocationService.startWatching();
      }
    });
  }

  private _loadCooldowns() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_COOLDOWN);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Clean up expired cooldowns
        const now = Date.now();
        const active: Record<string, number> = {};
        Object.keys(parsed).forEach((key) => {
          if (now - parsed[key] < this.COOLDOWN_DURATION_MS) {
            active[key] = parsed[key];
          }
        });
        this._cooldowns.set(active);
        this._saveCooldowns(active);
      }
    } catch (e) {
      console.warn("Failed to load check-in cooldowns", e);
    }
  }

  private _saveCooldowns(cooldowns: Record<string, number>) {
    try {
      localStorage.setItem(
        this.STORAGE_KEY_COOLDOWN,
        JSON.stringify(cooldowns)
      );
    } catch (e) {
      console.warn("Failed to save check-in cooldowns", e);
    }
  }

  public dismissSpot(spotId: string) {
    const current = this._cooldowns();
    const updated = { ...current, [spotId]: Date.now() };
    this._cooldowns.set(updated);
    this._saveCooldowns(updated);

    // If the dismissed spot is the current one, clear it
    if (this.currentProximitySpot()?.id === spotId) {
      this.currentProximitySpot.set(null);
    }
  }

  // State for speed calculation
  private _lastLocation: google.maps.LatLngLiteral | null = null;
  private _lastLocationTime: number = 0;
  private readonly SPEED_LIMIT_MS = 25 / 3.6; // 25 km/h in m/s (~6.94 m/s)
  private readonly ACCURACY_THRESHOLD_METERS = 50;

  private async _checkProximity(
    location: google.maps.LatLngLiteral,
    accuracy: number = 0
  ) {
    // 0. Accuracy Filter
    if (accuracy > this.ACCURACY_THRESHOLD_METERS) {
      console.debug(
        `Proactive Check-in: Ignoring update due to low accuracy (${accuracy}m)`
      );
      this.currentProximitySpot.set(null);
      return;
    }

    // 0. Speed Filter (prevent checks while driving/busing)
    const now = Date.now();
    if (this._lastLocation) {
      const distance = this._computeDistanceMeters(
        this._lastLocation,
        location
      );
      const timeDiff = (now - this._lastLocationTime) / 1000; // seconds

      if (timeDiff > 0) {
        const speed = distance / timeDiff; // m/s
        if (speed > this.SPEED_LIMIT_MS) {
          console.debug(
            `Proactive Check-in: Ignoring update due to high speed (${(
              speed * 3.6
            ).toFixed(1)} km/h)`
          );
          // Update last location so we don't get stuck if they slow down
          this._lastLocation = location;
          this._lastLocationTime = now;
          this.currentProximitySpot.set(null);
          return;
        }
      }
    }

    // Update last location for next speed check
    this._lastLocation = location;
    this._lastLocationTime = now;

    // 1. Calculate current tile (Overview is usually z16 for loading spots)
    const zoom = 16;
    const tile = getTileCoordinatesForLocationAndZoom(
      location.lat,
      location.lng,
      zoom
    );

    // 2. Identify surrounding tiles to ensure coverage near borders
    const tilesToCheck = [];
    for (let x = tile.x - 1; x <= tile.x + 1; x++) {
      for (let y = tile.y - 1; y <= tile.y + 1; y++) {
        tilesToCheck.push({ x, y, zoom });
      }
    }

    // 3. Fetch spots for these tiles
    this._spotsService
      .getSpotsForTiles(tilesToCheck, "en") // localized to 'en' for internal logic or simple display
      .pipe(take(1))
      .subscribe((spots) => {
        this._findClosestSpot(location, spots);
      });
  }

  private _findClosestSpot(
    currentLocation: google.maps.LatLngLiteral,
    spots: Spot[]
  ) {
    // Filter out spots that are in cooldown
    const cooldowns = this._cooldowns();
    const now = Date.now();
    const activeSpots = spots.filter((spot) => {
      const lastDismissed = cooldowns[spot.id];
      if (lastDismissed && now - lastDismissed < this.COOLDOWN_DURATION_MS) {
        return false;
      }
      return true;
    });

    // Find closest spot
    let closestSpot: Spot | null = null;
    let minDistance = Infinity;

    for (const spot of activeSpots) {
      const spotLoc = spot.location();
      const distance = this._computeDistanceMeters(currentLocation, spotLoc);

      if (distance <= this.PROXIMITY_THRESHOLD_METERS) {
        if (distance < minDistance) {
          minDistance = distance;
          closestSpot = spot;
        }
      }
    }

    // Update signal
    // Only update if changed to avoid signal churn
    if (this.currentProximitySpot()?.id !== closestSpot?.id) {
      console.log(
        `Proactive Check-in: Found spot ${closestSpot?.name()} at ${minDistance}m`
      );
      this.currentProximitySpot.set(closestSpot);
    }
  }

  /**
   * Haversine formula to compute distance in meters
   */
  private _computeDistanceMeters(
    p1: google.maps.LatLngLiteral,
    p2: google.maps.LatLngLiteral
  ): number {
    const R = 6371e3; // metres
    const φ1 = (p1.lat * Math.PI) / 180;
    const φ2 = (p2.lat * Math.PI) / 180;
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
    const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
