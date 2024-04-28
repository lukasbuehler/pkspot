import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "src/environments/environment";
import {
  Observable,
  BehaviorSubject,
  catchError,
  map,
  of,
  take,
  firstValueFrom,
} from "rxjs";

@Injectable({
  providedIn: "root",
})
export class MapsApiService {
  private _isApiLoaded$: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  public isApiLoaded$: Observable<boolean> = this._isApiLoaded$;

  constructor(private http: HttpClient) {
    this.loadGoogleMapsApi();
  }

  loadGoogleMapsApi() {
    // Load the Google Maps API if it is not already loaded
    if (this._isApiLoaded$.value) return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.keys.google_maps}&libraries=visualization,places`;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    script.onload = () => {
      this._isApiLoaded$.next(true);
    };
  }

  openLatLngInGoogleMaps(location: google.maps.LatLngLiteral) {
    window.open(`https://maps.google.com/?q=${location.lat},${location.lng}`);
  }

  autocompletePlaceSearch(
    input: string,
    types: string[],
    biasRect?: google.maps.LatLngBoundsLiteral
  ): Promise<google.maps.places.AutocompletePrediction[]> {
    if (!input || input.length === 0) return Promise.resolve([]);

    const autocompleteService = new google.maps.places.AutocompleteService();

    return new Promise((resolve, reject) => {
      autocompleteService.getPlacePredictions(
        {
          input: input,
          types: types,
          locationBias: biasRect,
          language: "en",
        },
        (predictions, status) => {
          if (status !== "OK" && status !== "ZERO_RESULTS") {
            reject(status);
            return;
          }

          resolve(predictions);
        }
      );
    });
  }

  getGooglePlaceById(placeId: string): Promise<google.maps.places.PlaceResult> {
    const placesService = new google.maps.places.PlacesService(
      document.createElement("div")
    );

    return new Promise((resolve, reject) => {
      placesService.getDetails(
        {
          placeId: placeId,
          fields: ["name", "geometry", "photos"],
        },
        (place, status) => {
          if (status !== "OK") {
            reject(status);
            return;
          }

          resolve(place);
        }
      );
    });
  }

  getGooglePlaceByLocation(
    location: google.maps.LatLngLiteral,
    type: string = "point_of_interest",
    radius: number = 200
  ): Promise<google.maps.places.PlaceResult> {
    const placesService = new google.maps.places.PlacesService(
      document.createElement("div")
    );

    return new Promise((resolve, reject) => {
      placesService.nearbySearch(
        {
          location: location,
          radius: 200,
          type: type,
        },
        (results, status) => {
          if (status !== "OK") {
            reject(status);
            return;
          }

          resolve(results[0]);
        }
      );
    });
  }

  getPhotoURLOfGooglePlace(
    place: google.maps.places.PlaceResult,
    maxWidth: number = 200,
    maxHeight: number = 200
  ): string | null {
    let photos = place.photos;
    if (!photos || photos.length === 0) return null;

    return photos[0].getUrl({ maxWidth: maxWidth, maxHeight: maxHeight });
  }

  getStaticStreetViewImageForLocation(
    location: google.maps.LatLngLiteral,
    imageWidth: number = 400,
    imageHeight: number = 400
  ): string {
    return `https://maps.googleapis.com/maps/api/streetview?size=${imageWidth}x${imageHeight}&location=${
      location.lat
    },${location.lng}&fov=${120}&source=outdoor&key=${
      environment.keys.google_maps
    }`;
  }
}
