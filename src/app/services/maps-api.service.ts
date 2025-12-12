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

@Injectable({
  providedIn: "root",
})
export class MapsApiService extends ConsentAwareService {
  private _isApiLoaded: WritableSignal<boolean> = signal(false);
  public isApiLoaded: Signal<boolean> = this._isApiLoaded;

  private _isLoading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  );
  public isLoading$: Observable<boolean> = this._isLoading$;

  private _loadingProgress$: BehaviorSubject<number> =
    new BehaviorSubject<number>(0);
  public loadingProgress$: Observable<number> = this._loadingProgress$;

  constructor() {
    super();
    // Do not auto-load anything - components will explicitly request loading when needed
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

  storeMapStyle(mapStyle: "roadmap" | "satellite") {
    if (typeof localStorage === "undefined") return;

    localStorage.setItem("mapStyle", mapStyle);
  }

  loadMapStyle(
    defaultStyle: "roadmap" | "satellite"
  ): Promise<"roadmap" | "satellite"> {
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
    window.open(
      `https://maps.apple.com/?address=${location.lat},${location.lng}`
    );
  }

  private _openLatLngInGoogleMaps(location: google.maps.LatLngLiteral) {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`
    );
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
    window.open(
      `https://maps.apple.com/?daddr=${location.lat},${location.lng}`
    );
  }

  private _openDirectionsInGoogleMaps(location: google.maps.LatLngLiteral) {
    if (typeof window === "undefined") return; // abort if not in browser
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
    );
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
            return {
              place_id: placePrediction.placeId || "",
              description: placePrediction.text.text || "",
              terms: [
                {
                  offset: 0,
                  value: placePrediction.text.text || "",
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
    imageHeight: number = 400
  ): string | null {
    // Only return URL if consent is granted
    if (!this.hasConsent()) {
      console.warn("Cannot generate Street View URL: User consent required");
      return null;
    }

    return `https://maps.googleapis.com/maps/api/streetview?size=${imageWidth}x${imageHeight}&location=${
      location.lat
    },${location.lng}&fov=${120}&source=outdoor&key=${
      environment.keys.firebaseConfig.apiKey
    }`;
  }

  // Instance method instead of static to access consent checking
  async loadStreetviewForLocation(
    location: google.maps.LatLngLiteral
  ): Promise<ExternalImage | undefined> {
    // Use consent-aware execution
    return this.executeWithConsent(async () => {
      // street view metadata
      return fetch(
        `https://maps.googleapis.com/maps/api/streetview/metadata?size=800x800&location=${
          location.lat
        },${
          location.lng
        }&fov=${120}&return_error_code=${true}&source=outdoor&key=${
          environment.keys.firebaseConfig.apiKey
        }`
      )
        .then((response) => {
          return response.json();
        })
        .then((data) => {
          if (data.status !== "ZERO_RESULTS") {
            // street view media
            return new ExternalImage(
              `https://maps.googleapis.com/maps/api/streetview?size=800x800&location=${
                location.lat
              },${
                location.lng
              }&fov=${120}&return_error_code=${true}&source=outdoor&key=${
                environment.keys.firebaseConfig.apiKey
              }`,
              "streetview"
            );
          }
        });
    });
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
