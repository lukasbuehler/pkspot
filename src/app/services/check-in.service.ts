import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  PLATFORM_ID,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { GeolocationService } from "./geolocation.service";
import { SearchService } from "./search.service";
import { Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";

@Injectable({
  providedIn: "root",
})
export class CheckInService {
  private _geolocationService = inject(GeolocationService);
  private _searchService = inject(SearchService);

  // Configuration
  private readonly PROXIMITY_THRESHOLD_METERS = 50;
  private readonly COOLDOWN_DURATION_MS = 1000 * 60 * 60 * 4; // 4 hours
  private readonly STORAGE_KEY_COOLDOWN = "pkspot_checkin_cooldowns";

  // Throttling for Typesense queries (massive cost savings)
  private readonly MIN_QUERY_INTERVAL_MS = 5000; // 5 seconds between queries
  private _lastQueryTime = 0;
  private _isQuerying = false;

  // State
  public currentProximitySpot = signal<Spot | null>(null);
  public showGlobalChip = signal<boolean>(true);

  // Track selected spot to allow checking in to it if in range, overriding closest
  public selectedSpot = signal<Spot | null>(null);

  // Cooldowns map: spotId -> timestamp (ms)
  private _cooldowns = signal<Record<string, number>>({});

  constructor() {
    this._loadCooldowns();

    // Effect to monitor location changes and selected spot changes
    effect(() => {
      const locationState = this._geolocationService.currentLocation();
      const selected = this.selectedSpot(); // depend on selected spot

      if (locationState && locationState.location) {
        console.log(
          `[CheckIn Debug] Location update: (${locationState.location.lat.toFixed(
            6
          )}, ${locationState.location.lng.toFixed(6)}), accuracy: ${
            locationState.accuracy?.toFixed(0) ?? "?"
          }m`
        );
        this._checkProximity(locationState.location, locationState.accuracy);
      } else {
        console.log(`[CheckIn Debug] No location available yet`);
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

  private _platformId = inject(PLATFORM_ID);

  private _loadCooldowns() {
    if (!isPlatformBrowser(this._platformId)) return;
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
    if (!isPlatformBrowser(this._platformId)) return;
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

    // Throttle queries to save costs (Typesense is cheap but not free)
    if (this._isQuerying) {
      return; // Already querying, skip
    }

    const timeSinceLastQuery = now - this._lastQueryTime;
    if (timeSinceLastQuery < this.MIN_QUERY_INTERVAL_MS) {
      // Not enough time since last query, but we can still check
      // against existing data if we have any
      return;
    }

    this._isQuerying = true;
    this._lastQueryTime = now;

    console.log(
      `[CheckIn Debug] Querying Typesense at (${location.lat.toFixed(
        6
      )}, ${location.lng.toFixed(6)})`
    );

    // Use Typesense geo-radius search (single fast query vs 9 Firestore tile queries)
    // Search within 500m to catch spots with large bounds
    this._searchService
      .searchSpotsNearLocation(location, 500, 50)
      .then((result) => {
        this._isQuerying = false;
        console.log(
          `[CheckIn Debug] Typesense returned ${result.hits.length} hits (found: ${result.found})`
        );
        if (result.hits.length > 0) {
          // Log full first hit document to see all available fields
          console.log(
            `[CheckIn Debug] Full first hit document:`,
            JSON.stringify(result.hits[0].document, null, 2)
          );
          console.log(
            `[CheckIn Debug] First few hits summary:`,
            result.hits.slice(0, 3).map((h) => ({
              id: h.document?.id,
              name: h.document?.name,
              location: h.document?.location,
              bounds: h.document?.bounds?.length ?? 0,
              bounds_raw: h.document?.bounds_raw?.length ?? 0,
            }))
          );
        }
        this._findClosestSpotFromHits(location, result.hits);
      })
      .catch((error) => {
        this._isQuerying = false;
        console.error("Check-in proximity search failed:", error);
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

    // Also check if selected spot is in range
    let selectedSpotInRange: Spot | null = null;
    const selected = this.selectedSpot();

    for (const spot of activeSpots) {
      // Calculate effective distance - considering both center and bounds
      const distance = this._getEffectiveDistance(currentLocation, spot);

      if (distance <= this.PROXIMITY_THRESHOLD_METERS) {
        if (distance < minDistance) {
          minDistance = distance;
          closestSpot = spot;
        }

        if (selected && spot.id === selected.id) {
          selectedSpotInRange = spot;
        }
      }
    }

    // Prioritize selected spot if in range
    const targetSpot = selectedSpotInRange || closestSpot;

    // Update signal
    // Only update if changed to avoid signal churn
    if (this.currentProximitySpot()?.id !== targetSpot?.id) {
      console.log(
        `Proactive Check-in: Found spot ${targetSpot?.name()} (Selected: ${!!selectedSpotInRange})`
      );
      this.currentProximitySpot.set(targetSpot);
    }
  }

  /**
   * Find closest spot from Typesense hits data.
   * Converts hits to Spot objects for compatibility with existing proximity logic.
   */
  private _findClosestSpotFromHits(
    currentLocation: google.maps.LatLngLiteral,
    hits: any[]
  ) {
    // Convert hits to Spot objects
    const spots: Spot[] = hits
      .map((hit) => this._spotFromTypesenseHit(hit))
      .filter((spot): spot is Spot => spot !== null);

    console.log(
      `[CheckIn Debug] Converted ${spots.length}/${hits.length} hits to Spot objects`
    );

    if (spots.length > 0) {
      // Calculate distances for debugging
      spots.slice(0, 5).forEach((spot) => {
        const dist = this._getEffectiveDistance(currentLocation, spot);
        console.log(
          `[CheckIn Debug] Spot "${spot.name()}" - distance: ${dist.toFixed(
            1
          )}m, hasBounds: ${spot.hasBounds()}, threshold: ${
            this.PROXIMITY_THRESHOLD_METERS
          }m`
        );
      });
    }

    // Use existing logic
    this._findClosestSpot(currentLocation, spots);
  }

  /**
   * Convert a Typesense hit to a Spot object.
   * Only includes data needed for proximity detection.
   */
  private _spotFromTypesenseHit(hit: any): Spot | null {
    try {
      const doc = hit.document || hit;
      if (!doc.id) return null;

      // Build location
      let location: google.maps.LatLngLiteral | null = null;
      if (doc.location) {
        if (Array.isArray(doc.location) && doc.location.length >= 2) {
          location = { lat: doc.location[0], lng: doc.location[1] };
        } else if (doc.location.latitude && doc.location.longitude) {
          location = {
            lat: doc.location.latitude,
            lng: doc.location.longitude,
          };
        }
      }
      if (!location) return null;

      // Debug: Log what bounds data we have
      console.log(`[CheckIn Debug] Hit "${doc.id}" raw bounds data:`, {
        bounds: doc.bounds,
        bounds_raw: doc.bounds_raw,
        boundsType: typeof doc.bounds,
        boundsIsArray: Array.isArray(doc.bounds),
        boundsLength: doc.bounds?.length,
      });

      // Build bounds if available - try bounds_raw first (for mobile), then bounds
      let bounds: { latitude: number; longitude: number }[] | undefined;
      const boundsSource = doc.bounds_raw || doc.bounds;

      if (
        boundsSource &&
        Array.isArray(boundsSource) &&
        boundsSource.length >= 3
      ) {
        bounds = boundsSource
          .map((point: [number, number] | { lat: number; lng: number }) => {
            if (Array.isArray(point)) {
              return { latitude: point[0], longitude: point[1] };
            }
            // Handle {lat, lng} format from bounds_raw
            if (
              typeof point.lat === "number" &&
              typeof point.lng === "number"
            ) {
              return { latitude: point.lat, longitude: point.lng };
            }
            return null;
          })
          .filter(
            (p: any): p is { latitude: number; longitude: number } => p !== null
          );

        console.log(`[CheckIn Debug] Converted bounds:`, bounds?.slice(0, 2));
      }

      // Build minimal SpotSchema for Spot constructor
      const spotData: any = {
        name: doc.name || {},
        location_raw: location,
        bounds: bounds,
      };

      const spot = new Spot(doc.id as SpotId, spotData, "en");
      console.log(
        `[CheckIn Debug] Created Spot "${spot.name()}" hasBounds: ${spot.hasBounds()}, paths: ${
          spot.paths()?.length ?? 0
        }`
      );

      return spot;
    } catch (e) {
      console.error("Error converting Typesense hit to Spot:", e);
      return null;
    }
  }

  /**
   * Get the effective distance to a spot, considering both center location and bounds.
   * For spots with bounds, returns the minimum of:
   * - Distance to the center (location)
   * - Distance to the nearest edge of the bounds polygon
   */
  private _getEffectiveDistance(
    currentLocation: google.maps.LatLngLiteral,
    spot: Spot
  ): number {
    const spotLoc = spot.location();
    const centerDistance = this._computeDistanceMeters(
      currentLocation,
      spotLoc
    );

    // If spot has no bounds, just use center distance
    if (!spot.hasBounds()) {
      return centerDistance;
    }

    // Get the paths (polygon coordinates)
    const paths = spot.paths();
    if (!paths || paths.length === 0 || paths[0].length < 3) {
      return centerDistance;
    }

    // First check if user is inside the polygon
    if (this._isPointInPolygon(currentLocation, paths[0])) {
      return 0; // User is inside the spot bounds
    }

    // Calculate minimum distance to any edge of the polygon
    const boundsDistance = this._distanceToPolygonEdge(
      currentLocation,
      paths[0]
    );

    // Return the smaller of center distance and bounds distance
    return Math.min(centerDistance, boundsDistance);
  }

  /**
   * Check if a point is inside a polygon using ray casting algorithm
   */
  private _isPointInPolygon(
    point: google.maps.LatLngLiteral,
    polygon: google.maps.LatLngLiteral[]
  ): boolean {
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      const intersect =
        yi > point.lat !== yj > point.lat &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Calculate minimum distance from a point to any edge of a polygon
   */
  private _distanceToPolygonEdge(
    point: google.maps.LatLngLiteral,
    polygon: google.maps.LatLngLiteral[]
  ): number {
    let minDistance = Infinity;
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edgeDistance = this._distanceToLineSegment(
        point,
        polygon[i],
        polygon[j]
      );
      if (edgeDistance < minDistance) {
        minDistance = edgeDistance;
      }
    }

    return minDistance;
  }

  /**
   * Calculate distance from a point to a line segment (edge)
   */
  private _distanceToLineSegment(
    point: google.maps.LatLngLiteral,
    lineStart: google.maps.LatLngLiteral,
    lineEnd: google.maps.LatLngLiteral
  ): number {
    // Convert to projected coordinates for distance calculation
    // Using simple approximation for short distances
    const px = point.lng;
    const py = point.lat;
    const x1 = lineStart.lng;
    const y1 = lineStart.lat;
    const x2 = lineEnd.lng;
    const y2 = lineEnd.lat;

    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
      // Line segment is just a point
      return this._computeDistanceMeters(point, lineStart);
    }

    // Calculate projection parameter
    const t = Math.max(
      0,
      Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy))
    );

    // Find the closest point on the segment
    const closestPoint: google.maps.LatLngLiteral = {
      lng: x1 + t * dx,
      lat: y1 + t * dy,
    };

    return this._computeDistanceMeters(point, closestPoint);
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

  public checkIn(spotId: SpotId) {
    console.log(`Check-in: ${spotId}`);
  }
}
