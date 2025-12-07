import { LocaleMap, MediaType, LocaleCode } from "./Interfaces";
import { AmenitiesMap } from "../schemas/Amenities";
import { makeAmenitiesArray, makeSmartAmenitiesArray } from "./Amenities";
import { MapHelpers } from "../../scripts/MapHelpers";
import { environment } from "../../environments/environment";
import { GeoPoint } from "firebase/firestore";
import { SpotAddressSchema, SpotId, SpotSchema } from "../schemas/SpotSchema";
import {
  SpotTypes,
  SpotAccess,
  parseSpotAccess,
  parseSpotType,
} from "../schemas/SpotTypeAndAccess";
import { computed, Signal, signal, WritableSignal } from "@angular/core";
import { SpotReviewSchema } from "../schemas/SpotReviewSchema";
import {
  getBestLocale,
  makeLocaleMapFromObject,
} from "../../scripts/LanguageHelpers";
import { SpotPreviewData } from "../schemas/SpotPreviewData";
import {
  StorageMedia,
  StorageImage,
  ExternalImage,
  Media,
  StorageVideo,
  ExternalVideo,
  AnyMedia,
} from "./Media";
import { MediaSchema } from "../schemas/Media";
import { ChallengePreviewSchema } from "../schemas/SpotChallengeSchema";
import { makeAnyMediaFromMediaSchema } from "../../scripts/Helpers";
import { MapsApiService } from "../../app/services/maps-api.service";
import { SpotChallengePreview } from "./SpotChallenge";
import {
  ChallengeLabel,
  ChallengeParticipantType,
} from "../schemas/SpotChallengeLabels";

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
  descriptionLocale: WritableSignal<LocaleCode>;
  numDescriptions: Signal<number>;

  // Media stuff
  userMedia: WritableSignal<AnyMedia[]>;
  private _streetview: WritableSignal<ExternalImage | undefined>; // signal that is computed from location
  readonly media: Signal<AnyMedia[]>;
  readonly hasMedia: Signal<boolean>;
  readonly previewImageSrc: Signal<string>;

  readonly isEligableForHighlights: Signal<boolean> = computed(() => {
    return (
      this.userMedia().length > 0 && this.rating !== null && this.rating > 0
    );
  });
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

  // 0-3 challenges
  topChallenges = signal<SpotChallengePreview[]>([]);
  numChallenges = signal<number>(0); // integer

  address: WritableSignal<SpotAddressSchema | null>;
  formattedAddress: Signal<string>;
  localityString: Signal<string>;

  hideStreetview: boolean;

  googlePlaceId = signal<string | undefined>(undefined);

  type = signal<SpotTypes>(SpotTypes.Other);
  access = signal<SpotAccess>(SpotAccess.Other);

  source = signal<string | undefined>(undefined);

  amenities: WritableSignal<AmenitiesMap>;
  amenitiesArray: Signal<{ name?: string; icon?: string }[]>;
  smartAmenitiesArray: Signal<
    {
      name?: string;
      icon?: string;
      priority?: "high" | "medium" | "low";
      isNegative?: boolean;
    }[]
  >;
  importantAmenitiesArray = computed(() => {
    return this.smartAmenitiesArray().filter(
      (amenity) => amenity.priority === "high"
    );
  });

  paths = signal<google.maps.LatLngLiteral[][] | undefined>(undefined);

  constructor(data: SpotSchema, readonly locale: LocaleCode) {
    this.names = signal(makeLocaleMapFromObject(data.name));
    this.name = computed(() => {
      const namesMap = this.names();
      const nameLocale = getBestLocale(Object.keys(namesMap), this.locale);
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

    this.source = signal<string | undefined>(data.source ?? undefined);

    this.descriptions = signal(
      data.description ? makeLocaleMapFromObject(data.description) : undefined
    );
    const descriptionLocales: LocaleCode[] = Object.keys(
      this.descriptions() ?? {}
    ) as LocaleCode[];

    const descLocale =
      descriptionLocales.length > 0
        ? getBestLocale(descriptionLocales, this.locale)
        : this.locale;
    this.descriptionLocale = signal<LocaleCode>(descLocale);

    this.description = computed(() => {
      const descLocale = this.descriptionLocale();
      const descriptionsObj = this.descriptions();
      if (descriptionsObj && Object.keys(descriptionsObj).length > 0) {
        if (typeof descriptionsObj[descLocale] === "string") {
          return descriptionsObj[descLocale];
        } else {
          return descriptionsObj[descLocale]?.text || "";
        }
      }
      return "";
    });
    this.numDescriptions = computed(() => {
      return Object.keys(this.descriptions() ?? {}).length;
    });

    const userMediaArr: AnyMedia[] | undefined = data.media
      ? data.media.map((mediaSchema) =>
          makeAnyMediaFromMediaSchema(mediaSchema)
        )
      : undefined;

    this.userMedia = signal(userMediaArr ?? []);

    // initilize media signal with streetview
    this.hideStreetview = data.hide_streetview ?? false;
    this._streetview = signal<ExternalImage | undefined>(undefined);

    this.media = computed(() => {
      const userMedia = this.userMedia();
      const streetview = this._streetview();

      if (streetview) {
        return [...userMedia, streetview];
      }
      return userMedia;
    });

    this.hasMedia = computed(() => {
      const media = this.media();
      return media.length > 0;
    });

    // Note: Streetview loading is now instance-method only and requires
    // dependency injection. This functionality can be added to components that
    // have access to the MapsApiService instance.
    // if (!data.hide_streetview && !this.hasMedia()) {
    //   MapsApiService.loadStreetviewForLocation(this.location()).then(
    //     (streetview) => {
    //       this._streetview.set(streetview);
    //     }
    //   );
    // }

    this.previewImageSrc = computed(() => {
      const previewSize = 200;

      if (!this.hasMedia()) return "";

      const imageMedia = this.media().filter(
        (media) => media.type === MediaType.Image
      );

      if (imageMedia.length > 0) {
        if (imageMedia[0] instanceof StorageMedia) {
          return imageMedia[0].getPreviewImageSrc();
        } else {
          if (imageMedia[0] instanceof ExternalImage) {
            return imageMedia[0].src;
          }
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

    this.topChallenges = signal(
      data.top_challenges?.map((data) => {
        const bestLocaleForChallenge = getBestLocale(
          Object.keys(data.name),
          this.locale
        );
        const name = data.name[bestLocaleForChallenge]!.text;
        const media: AnyMedia = makeAnyMediaFromMediaSchema(data.media);
        const newData: SpotChallengePreview = {
          name: signal(name),
          id: data.id,
          media: signal(media),
        };
        if (data.location) {
          newData.location = {
            lat: data.location.latitude,
            lng: data.location.longitude,
          };
        } else {
          newData.location = this.location();
        }
        if (data.label as ChallengeLabel)
          newData.label = data.label as ChallengeLabel;
        if (data.participant_type as ChallengeParticipantType)
          newData.participantType =
            data.participant_type as ChallengeParticipantType;

        return newData;
      }) ?? []
    );
    this.numChallenges.set(data.num_challenges ?? 0);

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

    // Coerce raw strings from DB to known enums with fallback to Other
    this.type.set(parseSpotType(data.type ?? null));
    this.access.set(parseSpotAccess(data.access ?? null));

    // Set the default amenities if they don't exist
    if (!data.amenities) data.amenities = {};
    // With nullable booleans, we don't force defaults - let them remain null/undefined for unknown state
    this.amenities = signal(data.amenities);
    this.amenitiesArray = computed(() => {
      const amenities = this.amenities();
      return makeAmenitiesArray(amenities);
    });

    // Add smart amenities array that considers context and conflicts
    this.smartAmenitiesArray = computed(() => {
      const amenities = this.amenities();
      return makeSmartAmenitiesArray(amenities, this.type());
    });

    this.paths.set(this._makePathsFromBounds(data.bounds ?? []));
  }

  /**
   * Apply new server data to this LocalSpot by updating signals in place.
   * This allows live updates (snapshots) without replacing object references.
   */
  public applyFromSchema(data: SpotSchema): void {
    // Names and descriptions
    this.names.set(makeLocaleMapFromObject(data.name));

    const newLocation = {
      lat: data.location.latitude,
      lng: data.location.longitude,
    };
    this.location.set(newLocation);

    const descMap = data.description
      ? makeLocaleMapFromObject(data.description)
      : undefined;
    this.descriptions.set(descMap);

    // Keep current description locale if still present; otherwise fallback
    const descriptionLocales: LocaleCode[] = Object.keys(descMap ?? {}) as any;
    if (
      descriptionLocales.length > 0 &&
      !descriptionLocales.includes(this.descriptionLocale())
    ) {
      const descLocale = getBestLocale(descriptionLocales, this.locale);
      this.descriptionLocale.set(descLocale);
    }

    // Media
    const userMediaArr: AnyMedia[] | undefined = data.media
      ? data.media.map((m) => makeAnyMediaFromMediaSchema(m))
      : undefined;
    this.userMedia.set(userMediaArr ?? []);

    // Settings and computed fields
    this.hideStreetview = data.hide_streetview ?? false;
    // Do not mutate _streetview here; it is derived separately

    this.isIconic = data.is_iconic ?? false;
    this.rating = data.rating ?? null;
    this.numReviews = data.num_reviews ?? 0;
    this.ratingHistogram.set(
      data.rating_histogram ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    );

    // Highlighted reviews and top challenges
    (this as any).highlightedReviews = data.highlighted_reviews;
    this.topChallenges.set(
      data.top_challenges?.map((d) => {
        const best = getBestLocale(Object.keys(d.name), this.locale);
        const name = d.name[best]!.text;
        const media: AnyMedia = makeAnyMediaFromMediaSchema(d.media);
        const newData: SpotChallengePreview = {
          name: signal(name),
          id: d.id,
          media: signal(media),
        };
        if (d.location) {
          newData.location = {
            lat: d.location.latitude,
            lng: d.location.longitude,
          };
        } else {
          newData.location = newLocation;
        }
        if (d.label as ChallengeLabel)
          newData.label = d.label as ChallengeLabel;
        if (d.participant_type as ChallengeParticipantType)
          newData.participantType =
            d.participant_type as ChallengeParticipantType;
        return newData;
      }) ?? []
    );
    this.numChallenges.set(data.num_challenges ?? 0);

    this.address.set(data.address ?? null);

    // External references
    if (data.external_references?.google_maps_place_id) {
      this.googlePlaceId.set(data.external_references.google_maps_place_id);
    } else {
      this.googlePlaceId.set(undefined);
    }

    // Type & access (with robust parsing)
    this.type.set(parseSpotType(data.type ?? null));
    this.access.set(parseSpotAccess(data.access ?? null));

    // Amenities
    if (!data.amenities) data.amenities = {};
    this.amenities.set(data.amenities);

    // Bounds
    this.paths.set(this._makePathsFromBounds(data.bounds ?? []));
  }

  /**
   * Returns the spot's data in the format of the SpotSchema interface.
   * @returns SpotSchema
   */
  public data(): SpotSchema {
    const location = this.location();
    const mediaSchema: SpotSchema["media"] = this.userMedia().map(
      (mediaObj) => {
        const isInStorage = mediaObj instanceof StorageMedia;
        const obj: MediaSchema = {
          src: isInStorage ? mediaObj.baseSrc : mediaObj.src,
          type: mediaObj.type,
          uid: mediaObj.userId,
          origin: mediaObj.origin,
          isInStorage: isInStorage,
        };

        Object.keys(obj).forEach((key) => {
          if (obj[key as keyof MediaSchema] === undefined) {
            delete obj[key as keyof MediaSchema];
          }
        });

        return obj;
      }
    );

    const data: SpotSchema = {
      name: this.names(),
      location: new GeoPoint(location.lat, location.lng),
      tile_coordinates: MapHelpers.getTileCoordinates(location),
      description: this.descriptions(),
      media: mediaSchema,
      is_iconic: this.isIconic,
      rating: this.rating ?? undefined, // undefined will be removed
      num_reviews: this.numReviews,
      rating_histogram: this.ratingHistogram(),
      highlighted_reviews: this.highlightedReviews,
      address: this.address() ?? null,
      type: this.type(),
      access: this.access(),
      amenities: this.amenities(),
      bounds: this._makeBoundsFromPaths(this.paths() ?? []),
      hide_streetview: this.hideStreetview,
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

  readonly hasBounds = computed(() => {
    const paths = this.paths();
    return !!(paths && paths.length > 0 && paths[0].length > 0);
  });

  public getMediaByIndex(index: number): Media {
    return this.media()[index];
  }

  public addMedia(
    src: string,
    type: MediaType,
    uid: string,
    isFromStorage: boolean,
    isProcessing: boolean = false
  ) {
    let media: AnyMedia | undefined;
    if (isFromStorage) {
      if (type === MediaType.Image) {
        media = new StorageImage(src, uid, "user", isProcessing);
      } else if (type === MediaType.Video) {
        media = new StorageVideo(src, uid, "user");
      } else {
        console.error("Unknown media type for storage media: ", type);
        return;
      }
    } else {
      if (type === MediaType.Image) {
        media = new ExternalImage(src, "user");
      } else if (type === MediaType.Video) {
        media = new ExternalVideo(src, "user");
      } else {
        console.error("Unknown media type for external media: ", type);
        return;
      }
    }

    this.userMedia.update((userMedia) => {
      return [...userMedia, media];
    });
  }

  public clone(): LocalSpot {
    const dataCopy: SpotSchema = JSON.parse(JSON.stringify(this.data()));
    return new LocalSpot(dataCopy, this.locale);
  }

  private _makePathsFromBounds(
    bounds: GeoPoint[]
  ): Array<Array<google.maps.LatLngLiteral>> | undefined {
    if (!bounds || bounds.length === 0) {
      return undefined;
    }

    const paths = [
      bounds.map((point) => {
        // GeoPoint can have either 'latitude'/'longitude' or '_latitude'/'_longitude'
        const lat = (point as any).latitude ?? (point as any)._latitude;
        const lng = (point as any).longitude ?? (point as any)._longitude;

        return {
          lat,
          lng,
        };
      }),
    ];
    return paths;
  }

  private _makeBoundsFromPaths(
    paths: Array<Array<google.maps.LatLngLiteral>>
  ): GeoPoint[] | undefined {
    if (!paths || paths.length === 0) return undefined;

    return paths[0].map((point) => {
      return new GeoPoint(point.lat, point.lng);
    });
  }
}

/**
 * A Spot is a LocalSpot with an id, since it is stored in the Firestore database.
 */
export class Spot extends LocalSpot {
  readonly id: SpotId;
  slug: string | null = null;

  constructor(_id: SpotId, _data: SpotSchema, locale: LocaleCode) {
    super(_data, locale);
    this.id = _id;

    if (_data.slug) {
      this.slug = _data.slug;
    }
  }

  /**
   * Apply new server data and update slug too.
   */
  public override applyFromSchema(data: SpotSchema): void {
    super.applyFromSchema(data);
    this.slug = data.slug ?? null;
  }

  public override clone(): Spot {
    const dataCopy = JSON.parse(JSON.stringify(this.data()));
    return new Spot(this.id, dataCopy, this.locale);
  }

  makePreviewData(): SpotPreviewData {
    return {
      name: this.name(),
      id: this.id,
      slug: this.slug ?? undefined,
      locality: this.localityString(),
      imageSrc: this.previewImageSrc(),
      isIconic: this.isIconic,
      rating: this.rating ?? undefined,
      amenities: this.amenities(),
    };
  }

  public override data(): SpotSchema {
    const data = super.data();

    if (this.slug) {
      data.slug = this.slug;
    }

    return data;
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
