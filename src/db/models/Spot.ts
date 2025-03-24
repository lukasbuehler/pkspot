import {
  SizedUserMedia,
  LocaleMap,
  MediaType,
  LocaleCode,
  OtherMedia,
  Media,
  mediaIsUserMedia,
  SizedStorageSrc,
} from "./Interfaces";
import {
  AmenitiesMap,
  AmenityIcons,
  AmenitiesOrder,
} from "../schemas/Amenities";
import { AmenityNames } from "./Amenities";
import { MapHelpers } from "../../scripts/MapHelpers";
import { environment } from "../../environments/environment";
import { GeoPoint } from "@firebase/firestore";
import { SpotAddressSchema, SpotSchema } from "../schemas/SpotSchema";
import { computed, Signal, signal, WritableSignal } from "@angular/core";
import { defaultSpotNames } from "../../../functions/src/spotHelpers";
import { SpotReviewSchema } from "../schemas/SpotReviewSchema";
import { StorageService } from "../../app/services/firebase/storage.service";
import { getBestLocale, makeLocaleMapFromObject } from "../../scripts/Helpers";

export type SpotId = string & { __brand: "SpotId" };
export type SpotSlug = string & { __brand: "SpotSlug" };

/**
 * A spot is a location of interest to the Parkour and Freerunning community.
 * It has information like a name, location, description, media, and more metadata.
 * A LocalSpot is like a Spot, but only exists locally on the client and not
 * in the Firestore database, hence it does not have an id.
 */
export class LocalSpot {
  names: WritableSignal<LocaleMap>;
  readonly name: Signal<string>;

  location: WritableSignal<google.maps.LatLngLiteral>;
  locationString: Signal<string>;

  readonly tileCoordinates: SpotSchema["tile_coordinates"];
  descriptions: WritableSignal<LocaleMap | undefined>;
  description: Signal<string>;

  // Media stuff
  userMedia: WritableSignal<SizedUserMedia[]>;
  private _streetview?: Signal<OtherMedia | undefined>; // signal that is computed from location
  readonly media: Signal<Media[]>;
  readonly hasMedia: Signal<boolean>;
  readonly previewImageSrc: Signal<string>;

  isIconic: boolean = false;
  rating: number | null = null; // from 1 to 5, set by cloud function.
  numReviews: number; // integer
  ratingHistogram: WritableSignal<{
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    "5": number;
  }>;
  normalizedRatingHistogram: Signal<{
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    "5": number;
  }>;
  readonly highlightedReviews?: SpotReviewSchema[];

  address: WritableSignal<SpotAddressSchema | null>;
  formattedAddress: Signal<string>;
  localityString: Signal<string>;

  googlePlaceId = signal<string | undefined>(undefined);

  type?: string;
  area?: string;
  amenities: WritableSignal<AmenitiesMap>;
  amentitiesArray;

  paths?: google.maps.LatLngLiteral[][];

  constructor(data: SpotSchema, readonly locale: LocaleCode) {
    this.names = signal(makeLocaleMapFromObject(data.name));
    this.name = computed(() => {
      const namesMap = this.names();
      console.log("namesMap", namesMap, "locale:", this.locale);
      const nameLocale = getBestLocale(Object.keys(namesMap), this.locale);
      console.log("nameLocale", nameLocale);
      return namesMap[nameLocale]?.text ?? $localize`Unnamed Spot`;
    });

    this.location = signal({
      lat: data.location.latitude,
      lng: data.location.longitude,
    });
    this.tileCoordinates = data.tile_coordinates;

    this.locationString = computed(() => {
      return MapHelpers.getHumanReadableCoordinates(this.location());
    });

    this.descriptions = signal(
      data.description ? makeLocaleMapFromObject(data.description) : undefined
    );
    this.description = computed(() => {
      const descriptionsObj = this.descriptions();
      if (descriptionsObj && Object.keys(descriptionsObj).length > 0) {
        const descriptionLocales: LocaleCode[] = Object.keys(
          descriptionsObj
        ) as LocaleCode[];
        const descLocale = getBestLocale(descriptionLocales, this.locale);

        if (typeof descriptionsObj[descLocale] === "string") {
          return descriptionsObj[descLocale];
        } else {
          return descriptionsObj[descLocale]?.text || "";
        }
      }
      return "";
    });

    const userMediaArr: SizedUserMedia[] | undefined = data?.media?.map(
      (media) => {
        const userMedia: SizedUserMedia = {
          src: media.src,
          type: media.type,
          uid: media.uid,
          isSized: media.isSized ?? true,
        };
        return userMedia;
      }
    );

    this.userMedia = signal(userMediaArr ?? []);
    // initilize media signal with streetview
    this._loadStreetviewForLocation(this.location()).then((streetview) => {
      this._streetview = signal(streetview);
    });

    // effect(() => {
    // const location = this.location();
    // const streetview = await this._loadStreetviewForLocation(location);
    // const arr = [].concat(this.media(), streetview ?? []);
    // this.media.set(arr);
    // });

    this.media = computed(() => {
      const userMedia = this.userMedia();
      // const streetview = this._streetview();
      // if (streetview) {
      //   return [streetview, ...userMedia];
      // } else {
      //   return userMedia;
      return [...userMedia];
    });

    this.hasMedia = computed(() => {
      const media = this.media();
      return media.length > 0;
    });

    this.previewImageSrc = computed(() => {
      const previewSize = 200;

      if (this.hasMedia()) {
        const media = this.media()[0];

        if (mediaIsUserMedia(media)) {
          const src = media.src;
          return StorageService.getSrc(src, previewSize);
        } else {
          return media.src;
        }
      }
      return "";
    });

    this.isIconic = data.is_iconic ?? false;
    this.rating = data.rating ?? null;
    this.numReviews = data.num_reviews ?? 0;
    this.ratingHistogram = signal(
      data.rating_histogram ?? {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      }
    );

    this.normalizedRatingHistogram = computed(() => {
      const hist = this.ratingHistogram();
      // get the maximum number of reviews for a single rating
      let maxNumReviews = 0;
      for (const key of Object.keys(hist) as unknown as (keyof typeof hist)[]) {
        if (hist[key] > maxNumReviews) {
          maxNumReviews = hist[key];
        }
      }

      if (maxNumReviews === 0) {
        return hist;
      }

      // divide every histogram value by the max
      let normalizedHistogram = {
        1: hist[1] / maxNumReviews,
        2: hist[2] / maxNumReviews,
        3: hist[3] / maxNumReviews,
        4: hist[4] / maxNumReviews,
        5: hist[5] / maxNumReviews,
      };

      return normalizedHistogram;
    });

    this.highlightedReviews = data.highlighted_reviews;

    this.address = signal(data.address ?? null);
    this.formattedAddress = computed(() => this.address()?.formatted ?? "");
    this.localityString = computed(() => {
      const address = this.address();
      let str = "";
      if (address?.sublocality) {
        str += address.sublocality + ", ";
      }
      if (address?.locality) {
        str += address.locality + ", ";
      }
      if (address?.country) {
        str += address.country.code.toUpperCase();
      }
      return str;
    });

    // set google place id
    if (data.external_references?.google_maps_place_id) {
      this.googlePlaceId.set(data.external_references.google_maps_place_id);
    }

    this.type = data.type;
    this.area = data.area;

    // Set the default amenities if they don't exist
    if (!data.amenities) data.amenities = {};
    if (!data.amenities.indoor) data.amenities.indoor = false;
    if (!data.amenities.outdoor) data.amenities.outdoor = false;
    this.amenities = signal(data.amenities);
    this.amentitiesArray = computed(() => {
      const amenities = this.amenities();
      if (!amenities) return [];

      return AmenitiesOrder.map((key) => {
        if (!amenities[key as keyof AmenitiesMap]) return null;
        return { name: AmenityNames[key], icon: AmenityIcons[key] };
      }).filter((val) => val !== null);
    });

    this.paths = this._makePathsFromBounds(data.bounds ?? []);
  }

  /**
   * Returns the spot's data in the format of the SpotSchema interface.
   * @returns SpotSchema
   */
  public data(): SpotSchema {
    const location = this.location();

    const data: SpotSchema = {
      name: this.names(),
      location: new GeoPoint(location.lat, location.lng),
      tile_coordinates: MapHelpers.getTileCoordinates(location),
      description: this.descriptions(),
      media: this.userMedia(),
      is_iconic: this.isIconic,
      rating: this.rating ?? undefined,
      num_reviews: this.numReviews,
      rating_histogram: this.ratingHistogram(),
      highlighted_reviews: this.highlightedReviews,
      address: this.address() ?? undefined,
      type: this.type,
      area: this.area,
      amenities: this.amenities(),
      bounds: this._makeBoundsFromPaths(this.paths ?? []),
    };

    // delete all the fields from the object that are undefined
    for (const key of Object.keys(data) as (keyof SpotSchema)[]) {
      if (data[key] === undefined) {
        delete data[key];
      }
    }

    return data;
  }

  public setName(newName: string | undefined, locale: LocaleCode) {
    if (!newName) {
      return;
    }

    this.names.update((names) => {
      names[locale] = {
        text: newName,
        provider: "user",
        timestamp: new Date(),
      };
      return names;
    });
  }

  public setDescription(newDescription: string, locale: LocaleCode) {
    let descriptions = this.descriptions() ?? {};
    if (!descriptions) {
      descriptions = {};
    }
    descriptions[locale] = {
      text: newDescription,
      provider: "user",
      timestamp: new Date(),
    };

    this.descriptions.set(descriptions);
  }

  public hasBounds() {
    return !!(this.paths && this.paths.length > 0 && this.paths[0].length > 0);
  }

  public getMediaByIndex(index: number): Media {
    return this.media()[index];
  }

  public addMedia(src: SizedStorageSrc, type: MediaType, uid: string) {
    const _userMedia: SizedUserMedia[] = this.userMedia();
    _userMedia.push({ src: src, type: type, uid: uid });
    this.userMedia.set(_userMedia);
  }

  public clone(): LocalSpot {
    const dataCopy: SpotSchema = JSON.parse(JSON.stringify(this.data()));
    return new LocalSpot(dataCopy, this.locale);
  }

  private _makePathsFromBounds(
    bounds: GeoPoint[]
  ): Array<Array<google.maps.LatLngLiteral>> {
    if (!bounds) return [];

    return [
      bounds.map((point) => {
        return {
          lat: point.latitude || point.latitude,
          lng: point.longitude || point.longitude,
        };
      }),
    ];
  }

  private _makeBoundsFromPaths(
    paths: Array<Array<google.maps.LatLngLiteral>>
  ): GeoPoint[] | undefined {
    if (!paths || paths.length === 0) return undefined;

    return paths[0].map((point) => {
      return new GeoPoint(point.lat, point.lng);
    });
  }

  // TODO move this to maps api service
  private async _loadStreetviewForLocation(
    location: google.maps.LatLngLiteral
  ): Promise<OtherMedia | undefined> {
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
          const streetView: OtherMedia = {
            src: `https://maps.googleapis.com/maps/api/streetview?size=800x800&location=${
              location.lat
            },${
              location.lng
            }&fov=${120}&return_error_code=${true}&source=outdoor&key=${
              environment.keys.firebaseConfig.apiKey
            }`,
            type: MediaType.Image,
            origin: "streetview",
          };

          return streetView;
        }
      });
  }
}

/**
 * A Spot is a LocalSpot with an id, since it is stored in the Firestore database.
 */
export class Spot extends LocalSpot {
  readonly id: SpotId;

  constructor(private _id: SpotId, _data: SpotSchema, locale: LocaleCode) {
    super(_data, locale);
    this.id = _id;
  }

  public override clone(): Spot {
    const dataCopy = JSON.parse(JSON.stringify(this.data()));
    return new Spot(this.id, dataCopy, this.locale);
  }
}

/**
 * Converts the a local spot (without an id) to a spot with an id.
 * @param _id the id of the spot in the database
 * @returns A spot object
 */
export function convertLocalSpotToSpot(
  localSpot: LocalSpot,
  _id: SpotId
): Spot {
  let spotPlusId = localSpot as LocalSpot & { id: SpotId };
  spotPlusId.id = _id;
  return spotPlusId as Spot;
}
