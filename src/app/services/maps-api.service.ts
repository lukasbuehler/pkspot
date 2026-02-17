import {
  Injectable,
  signal,
  Signal,
  WritableSignal,
  inject,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "../../environments/environment";
import {
  Observable,
  BehaviorSubject,
  catchError,
  map,
  of,
  take,
  firstValueFrom,
} from "rxjs";
import { ExternalImage } from "../../db/models/Media";
import { ConsentAwareService } from "./consent-aware.service";

interface LocationAndZoom {
  location: google.maps.LatLngLiteral;
  zoom: number;
}

type StreetViewMetadataStatus = "OK" | "ZERO_RESULTS" | "UNKNOWN";

import { AnalyticsService } from "./analytics.service";

@Injectable({
  providedIn: "root",
})
export class MapsApiService extends ConsentAwareService {
  private _analytics = inject(AnalyticsService);
  private _isApiLoaded: WritableSignal<boolean> = signal(false);
  public isApiLoaded: Signal<boolean> = this._isApiLoaded;

  private _isLoading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  );
  public isLoading$: Observable<boolean> = this._isLoading$;

  private _loadingProgress$: BehaviorSubject<number> =
    new BehaviorSubject<number>(0);
  public loadingProgress$: Observable<number> = this._loadingProgress$;

  /**
   * Cache for street view URLs.
   * Maps spotId -> street view URL or null (if error/not available).
   * Keep this in-memory only to avoid persistent Street View content caching.
   */
  private streetViewCache = new Map<string, string | null>();
  /**
   * Session cache for Street View metadata availability.
   * Maps spot/location cache key -> whether a panorama is available.
   */
  private streetViewMetadataCache = new Map<string, boolean>();
  /**
   * Dedupes concurrent metadata checks for the same location.
   */
  private streetViewMetadataInFlight = new Map<string, Promise<boolean>>();
  private readonly STREET_VIEW_PREVIEW_MIN_ZOOM = 12;

  constructor() {
    super();
  }

  loadGoogleMapsApi() {
    // Check for consent before loading using inherited method
    if (!this.hasConsent()) {
      console.warn("Cannot load Google Maps API: User consent required");
      return;
    }

    // Load the Google Maps API if it is not already loaded
    if (this.isApiLoaded()) return;
    if (this._isLoading$.value) return;

    if (typeof document === "undefined") return; // abort if not in browser (e.g. server-side rendering

    this._isLoading$.next(true);
    this._loadingProgress$.next(25); // Starting to load

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${environment.keys.firebaseConfig.apiKey}` +
      `&libraries=visualization,places&loading=async&callback=mapsCallback`;
    script.async = true;
    script.defer = true;

    // Add script load events for progress tracking
    script.onload = () => {
      this._loadingProgress$.next(75); // Script loaded, waiting for callback
    };

    script.onerror = () => {
      this._isLoading$.next(false);
      this._loadingProgress$.next(0);
      console.error("Failed to load Google Maps API");
    };

    document.body.appendChild(script);
    this._loadingProgress$.next(50); // Script added to DOM

    // add the callback function to the global scope
    (window as any)["mapsCallback"] = () => {
      this._loadingProgress$.next(100); // API fully loaded
      this._isApiLoaded.set(true);
      this._isLoading$.next(false);
    };
  }

  storeLastLocationAndZoom(lastLocationAndZoom: LocationAndZoom) {
    if (typeof localStorage === "undefined") return;

    localStorage.setItem(
      "lastLocationAndZoom",
      JSON.stringify(lastLocationAndZoom)
    );
  }

  loadLastLocationAndZoom(): Promise<LocationAndZoom | null> {
    if (typeof localStorage === "undefined") return Promise.resolve(null);

    let lastLocationAndZoom = localStorage.getItem("lastLocationAndZoom");
    if (!lastLocationAndZoom) return Promise.resolve(null);

    return Promise.resolve(JSON.parse(lastLocationAndZoom));
  }

  storeMapStyle(mapStyle: "roadmap" | "satellite" | "hybrid" | "terrain") {
    if (typeof localStorage === "undefined") return;

    localStorage.setItem("mapStyle", mapStyle);
  }

  loadMapStyle(
    defaultStyle: "roadmap" | "satellite" | "hybrid" | "terrain"
  ): Promise<"roadmap" | "satellite" | "hybrid" | "terrain"> {
    if (typeof localStorage === "undefined")
      return Promise.resolve(defaultStyle);

    let mapStyle = localStorage.getItem("mapStyle");
    if (!mapStyle) return Promise.resolve(defaultStyle);

    return Promise.resolve(mapStyle as "roadmap" | "satellite");
  }

  isMacOSOriOS(): boolean {
    if (typeof window === "undefined") return false; // abort if not in browser

    const appleDevices = [
      "iPad Simulator",
      "iPhone Simulator",
      "iPod Simulator",
      "iPad",
      "iPhone",
      "iPod",
      "Mac",
    ];
    return RegExp(`/${appleDevices.join("|")}/`).test(navigator.userAgent);
  }

  openLatLngInMaps(location: google.maps.LatLngLiteral) {
    if (typeof window === "undefined") return; // abort if not in browser

    if (this.isMacOSOriOS()) {
      this._openLatLngInAppleMaps(location);
    } else {
      this._openLatLngInGoogleMaps(location);
    }
  }

  private _openLatLngInAppleMaps(location: google.maps.LatLngLiteral) {
    const url = `https://maps.apple.com/?address=${location.lat},${location.lng}`;
    const taggedUrl = this._analytics.addUtmToUrl(
      url,
      "open_in_maps",
      "pkspot",
      "referral"
    );

    this._analytics.trackEvent("open_maps", {
      platform: "apple",
      location: location,
      url: taggedUrl || url,
    });

    if (taggedUrl) window.open(taggedUrl);
  }

  private _openLatLngInGoogleMaps(location: google.maps.LatLngLiteral) {
    const url = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
    const taggedUrl = this._analytics.addUtmToUrl(
      url,
      "open_in_maps",
      "pkspot",
      "referral"
    );

    this._analytics.trackEvent("open_maps", {
      platform: "google",
      location: location,
      url: taggedUrl || url,
    });

    if (taggedUrl) window.open(taggedUrl);
  }

  openDirectionsInMaps(location: google.maps.LatLngLiteral) {
    if (typeof window === "undefined") return; // abort if not in browser

    if (this.isMacOSOriOS()) {
      this._openDirectionsInAppleMaps(location);
    } else {
      this._openDirectionsInGoogleMaps(location);
    }
  }

  private _openDirectionsInAppleMaps(location: google.maps.LatLngLiteral) {
    if (typeof window === "undefined") return; // abort if not in browser
    const url = `https://maps.apple.com/?daddr=${location.lat},${location.lng}`;
    const taggedUrl = this._analytics.addUtmToUrl(
      url,
      "directions",
      "pkspot",
      "referral"
    );

    this._analytics.trackEvent("get_directions", {
      platform: "apple",
      location: location,
      url: taggedUrl || url,
    });

    if (taggedUrl) window.open(taggedUrl);
  }

  private _openDirectionsInGoogleMaps(location: google.maps.LatLngLiteral) {
    if (typeof window === "undefined") return; // abort if not in browser
    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
    const taggedUrl = this._analytics.addUtmToUrl(
      url,
      "directions",
      "pkspot",
      "referral"
    );

    this._analytics.trackEvent("get_directions", {
      platform: "google",
      location: location,
      url: taggedUrl || url,
    });

    if (taggedUrl) window.open(taggedUrl);
  }

  async autocompletePlaceSearch(
    input: string,
    types?: string[],
    biasRect?: google.maps.LatLngBoundsLiteral
  ): Promise<google.maps.places.AutocompletePrediction[]> {
    if (!input || input.length === 0) return Promise.resolve([]);

    // Use consent-aware execution for Places API calls
    return this.executeWithConsent(async () => {
      // Use new AutocompleteSuggestion API instead of deprecated AutocompleteService
      const request: google.maps.places.AutocompleteRequest = {
        input: input,
        language: "en",
      };

      // Add location bias if provided
      if (biasRect) {
        request.locationBias = biasRect;
      }

      // Note: The new API doesn't support type filtering in the same way.
      // We'll filter results client-side after fetching suggestions.

      const { suggestions } =
        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
          request
        );

      // Convert new suggestions format to legacy AutocompletePrediction format
      // for backward compatibility
      const predictions: google.maps.places.AutocompletePrediction[] =
        suggestions
          .filter((s) => s.placePrediction)
          .map((suggestion) => {
            const placePrediction = suggestion.placePrediction!;
            const fullText = placePrediction.text.text || "";
            // Split into main text (first comma-separated part) and secondary text (rest)
            const commaIndex = fullText.indexOf(",");
            const mainText =
              commaIndex >= 0 ? fullText.substring(0, commaIndex) : fullText;
            const secondaryText =
              commaIndex >= 0 ? fullText.substring(commaIndex + 1).trim() : "";

            return {
              place_id: placePrediction.placeId || "",
              description: fullText,
              structured_formatting: {
                main_text: mainText,
                secondary_text: secondaryText,
                main_text_matched_substrings: [],
              },
              terms: [
                {
                  offset: 0,
                  value: fullText,
                },
              ],
              types: placePrediction.types || [],
              matched_substrings: [],
              getPlacePrediction: () => {
                return placePrediction;
              },
            } as any;
          });

      return predictions;
    });
  }

  async getGooglePlaceById(placeId: string): Promise<google.maps.places.Place> {
    if (!this._isApiLoaded()) {
      return Promise.reject(new Error("Google Maps API is not loaded yet."));
    }
    if (!placeId || placeId.length === 0) {
      return Promise.reject(new Error("Invalid place ID."));
    }

    console.debug("Fetching Google Place by ID:", placeId);

    // Use consent-aware execution for Places API calls
    return this.executeWithConsent(async () => {
      const place = new google.maps.places.Place({
        id: placeId,
        requestedLanguage: "en",
      });

      await place.fetchFields({
        fields: [
          "displayName",
          "location",
          "photos",
          "rating",
          "websiteURI",
          "businessStatus",
          "regularOpeningHours",
          "types",
          "viewport",
        ],
      });

      return place;
    });
  }

  async getGooglePlaceByLocation(
    location: google.maps.LatLngLiteral,
    type: string = "point_of_interest",
    radius: number = 200
  ): Promise<google.maps.places.Place | null> {
    console.log("Searching for Google Place at location:", location);
    return Promise.reject(new Error("Not implemented"));

    // Use consent-aware execution for Places API calls
    return this.executeWithConsent(async () => {
      const request: google.maps.places.SearchNearbyRequest = {
        fields: ["displayName", "location", "businessStatus"],
        locationRestriction: {
          center: location,
          radius: radius,
        },
        includedPrimaryTypes: [type],
        maxResultCount: 1,
      };

      const { places } = await google.maps.places.Place.searchNearby(request);
      return places.length > 0 ? places[0] : null;
    });
  }

  getPhotoURLOfGooglePlace(
    place: google.maps.places.Place,
    maxWidth: number = 200,
    maxHeight: number = 200
  ): string | null {
    // Get photos from the Place object using the new API structure
    const photos = place.photos;
    if (!photos || photos.length === 0) return null;

    return photos[0].getURI({ maxWidth: maxWidth, maxHeight: maxHeight });
  }

  getStaticStreetViewImageForLocation(
    location: google.maps.LatLngLiteral,
    imageWidth: number = 400,
    imageHeight: number = 400,
    spotId?: string
  ): string | null {
    if (!this.isStreetViewPreviewEnabled()) {
      return null;
    }

    // Only return URL if consent is granted
    if (!this.hasConsent()) {
      console.warn("Cannot generate Street View URL: User consent required");
      return null;
    }

    if (spotId && this.streetViewCache.has(spotId)) {
      const cached = this.streetViewCache.get(spotId);
      if (cached === null) {
        // console.log(
        //   `Street View for spot ${spotId} is known to be unavailable (cached).`
        // );
        return null;
      }
      // Return cached URL if not undefined
      if (cached !== undefined) {
        return cached;
      }
    }

    const url = this._makeStreetViewImageUrl(location, imageWidth, imageHeight);

    if (spotId) {
      //   console.debug(
      //     `Generatred Street View URL for spot ${spotId}, caching it.`
      //   );
      this.streetViewCache.set(spotId, url);
    }

    return url;
  }

  reportStreetViewError(spotId: string) {
    // console.log(`Marking Street View as unavailable for spot ${spotId}`);
    this.streetViewCache.set(spotId, null);
    this.streetViewMetadataCache.set(
      this._getStreetViewMetadataCacheKey(spotId),
      false
    );
  }

  isStreetViewPreviewEnabled(): boolean {
    return environment.features.streetView.preview;
  }

  isStreetViewDetailEnabled(): boolean {
    return environment.features.streetView.detail;
  }

  getStreetViewPreviewMinZoom(): number {
    return this.STREET_VIEW_PREVIEW_MIN_ZOOM;
  }

  isStreetViewPreviewAllowedAtZoom(zoom: number | null | undefined): boolean {
    return typeof zoom === "number" && zoom > this.STREET_VIEW_PREVIEW_MIN_ZOOM;
  }

  private _getStreetViewMetadataCacheKey(
    spotIdOrLocation: string | google.maps.LatLngLiteral
  ): string {
    if (typeof spotIdOrLocation === "string") {
      return `spot:${spotIdOrLocation}`;
    }

    const { lat, lng } = spotIdOrLocation;
    return `loc:${lat.toFixed(6)},${lng.toFixed(6)}`;
  }

  private _makeStreetViewMetadataUrl(location: google.maps.LatLngLiteral): string {
    return `https://maps.googleapis.com/maps/api/streetview/metadata?size=800x800&location=${
      location.lat
    },${
      location.lng
    }&fov=${120}&return_error_code=${true}&source=outdoor&key=${
      environment.keys.firebaseConfig.apiKey
    }`;
  }

  private _makeStreetViewImageUrl(
    location: google.maps.LatLngLiteral,
    imageWidth: number,
    imageHeight: number
  ): string {
    return `https://maps.googleapis.com/maps/api/streetview?size=${imageWidth}x${imageHeight}&location=${
      location.lat
    },${
      location.lng
    }&fov=${120}&return_error_code=${true}&source=outdoor&key=${
      environment.keys.firebaseConfig.apiKey
    }`;
  }

  async hasStreetViewPanoramaForLocation(
    location: google.maps.LatLngLiteral,
    spotId?: string
  ): Promise<boolean> {
    if (!this.isStreetViewDetailEnabled()) {
      return false;
    }

    if (!this.hasConsent()) {
      return false;
    }

    const cacheKey = spotId
      ? this._getStreetViewMetadataCacheKey(spotId)
      : this._getStreetViewMetadataCacheKey(location);

    if (this.streetViewMetadataCache.has(cacheKey)) {
      return this.streetViewMetadataCache.get(cacheKey)!;
    }

    const inFlight = this.streetViewMetadataInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = this.executeWithConsent(async () => {
      const response = await fetch(this._makeStreetViewMetadataUrl(location));
      const data = (await response.json()) as { status?: string };

      const status: StreetViewMetadataStatus =
        data.status === "OK"
          ? "OK"
          : data.status === "ZERO_RESULTS"
          ? "ZERO_RESULTS"
          : "UNKNOWN";

      const hasPanorama = status === "OK";
      this.streetViewMetadataCache.set(cacheKey, hasPanorama);

      if (!hasPanorama && status === "ZERO_RESULTS" && spotId) {
        this.reportStreetViewError(spotId);
      }

      return hasPanorama;
    })
      .catch((error) => {
        console.warn("Street View metadata check failed", error);
        return false;
      })
      .finally(() => {
        this.streetViewMetadataInFlight.delete(cacheKey);
      });

    this.streetViewMetadataInFlight.set(cacheKey, request);
    return request;
  }

  // Instance method instead of static to access consent checking
  async loadStreetviewForLocation(
    location: google.maps.LatLngLiteral,
    spotId?: string
  ): Promise<ExternalImage | undefined> {
    if (!this.isStreetViewDetailEnabled()) {
      return undefined;
    }

    // Check persistent cache first if spotId is provided
    if (spotId && this.streetViewCache.has(spotId)) {
      if (this.streetViewCache.get(spotId) === null) {
        // console.log(`Skipping Street View load for spot ${spotId} (known failure)`);
        return undefined;
      }
    }

    const hasPanorama = await this.hasStreetViewPanoramaForLocation(
      location,
      spotId
    );

    if (!hasPanorama) {
      return undefined;
    }

    return new ExternalImage(
      this._makeStreetViewImageUrl(location, 400, 400),
      "streetview"
    );
  }

  /**
   * Calculate appropriate zoom level based on place type.
   * Returns higher zoom (more zoomed in) for smaller/more specific places,
   * and lower zoom (more zoomed out) for larger/broader areas.
   */
  getZoomForPlaceType(place: google.maps.places.Place): number {
    const types = (place as any).types as string[] | undefined;
    if (!types || types.length === 0) return 16; // default zoom

    // Check for specific place types that should have more detailed zoom
    const detailedTypes = [
      "restaurant",
      "cafe",
      "bar",
      "store",
      "shopping_mall",
      "point_of_interest",
      "premise",
      "street_address",
      "locality",
    ];

    const isDetailedType = types.some((t) =>
      detailedTypes.some((dt) => t.includes(dt))
    );

    // Broader place types
    const broaderTypes = [
      "administrative_area_level_1",
      "country",
      "postal_code",
    ];
    const isBroaderType = types.some((t) =>
      broaderTypes.some((bt) => t.includes(bt))
    );

    if (isDetailedType) return 18; // High zoom for specific places
    if (isBroaderType) return 10; // Low zoom for countries/states
    return 15; // Medium zoom default
  }

  /**
   * Fetch nearby places sorted by distance from a given location.
   * Returns up to maxResults places (default 5).
   */
  async getNearbyPlacesByDistance(
    location: google.maps.LatLngLiteral,
    type: string = "restaurant",
    maxResults: number = 5
  ): Promise<google.maps.places.Place[]> {
    console.log("Fetching nearby places by distance:", location, type);

    // Early return if API not loaded
    if (!this._isApiLoaded()) {
      console.warn("Google Maps API not loaded yet");
      return [];
    }

    return this.executeWithConsent(async () => {
      const request: google.maps.places.SearchNearbyRequest = {
        fields: ["displayName", "location", "businessStatus"],
        locationRestriction: {
          center: location,
          radius: 50000, // 50km radius for distance-based search
        },
        includedPrimaryTypes: [type],
        maxResultCount: maxResults,
        rankPreference: google.maps.places.SearchNearbyRankPreference.DISTANCE,
      };

      const { places } = await google.maps.places.Place.searchNearby(request);
      return places;
    });
  }
}
