import {
  computed,
  inject,
  LOCALE_ID,
  signal,
  Signal,
  WritableSignal,
} from "@angular/core";
import { getBestLocale } from "../../scripts/LanguageHelpers";
import { SpotChallengeSchema } from "../schemas/SpotChallengeSchema";
import { LocaleCode, LocaleMap } from "./Interfaces";
import { Spot } from "./Spot";
import { User } from "./User";
import { UserReferenceSchema } from "../schemas/UserSchema";
import { GeoPoint } from "@firebase/firestore";
import { AuthenticationService } from "../../app/services/firebase/authentication.service";
import { AnyMedia } from "./Media";
import { makeAnyMediaFromMediaSchema } from "../../scripts/Helpers";
import {
  ChallengeLabel,
  ChallengeParticipantType,
} from "../schemas/SpotChallengeLabels";

export class LocalSpotChallenge {
  spot: Spot;
  name: Signal<string>;
  nameLocaleMap: WritableSignal<LocaleMap>;
  media: WritableSignal<AnyMedia | null>;
  descriptionLocaleMap: WritableSignal<LocaleMap>;
  user: UserReferenceSchema;
  createdAt: Date;
  location: WritableSignal<google.maps.LatLngLiteral | null>;
  // posts: Signal<SpotChallengeSchema["top_posts"]>;
  label: ChallengeLabel | null;
  participantType: ChallengeParticipantType | null;
  isWaterChallenge: boolean | null;
  isBeginnerFriendly: boolean | null;

  constructor(data: SpotChallengeSchema, spot: Spot, appLocale: LocaleCode) {
    if (!spot) {
      // TODO in the future, here get spot by id with store or something
      throw new Error("Spot is required");
    } else {
      this.spot = spot;
    }

    // name
    this.nameLocaleMap = signal<LocaleMap>(data.name ?? {});
    this.name = computed(() => {
      const nameLocaleMap = this.nameLocaleMap();

      const nameLocales = Object.keys(nameLocaleMap);
      if (nameLocales.length == 0) {
        return $localize`Unnamed Challenge`;
      } else {
        const locale = getBestLocale(nameLocales, appLocale);
        return nameLocaleMap[locale]!.text;
      }
    });

    // media
    this.media = signal<AnyMedia | null>(
      data.media ? makeAnyMediaFromMediaSchema(data.media) : null
    );

    // description
    this.descriptionLocaleMap = signal<LocaleMap>(data.description ?? {});

    this.user = data.user;
    this.createdAt = data.createdAt;
    this.location = signal<google.maps.LatLngLiteral | null>(
      data.location
        ? {
            lat: data.location.latitude,
            lng: data.location.longitude,
          }
        : null
    );

    this.label = data.label ?? null;
    this.participantType = data.participant_type ?? null;
    this.isWaterChallenge = data.is_water_challenge ?? null;
    this.isBeginnerFriendly = data.is_beginner_friendly ?? null;
  }

  getData(): SpotChallengeSchema {
    const data: SpotChallengeSchema = {
      spot: {
        id: this.spot.id,
        name: this.spot.name(),
      },
      name: this.nameLocaleMap(),
      media: this.media()?.getData() ?? undefined,
      description: this.descriptionLocaleMap(),
      user: this.user,
      createdAt: this.createdAt,
      location: new GeoPoint(
        this.spot.location().lat,
        this.spot.location().lng
      ),
      label: this.label ?? undefined,
      participant_type: this.participantType ?? undefined,
      is_water_challenge: this.isWaterChallenge ?? undefined,
      is_beginner_friendly: this.isBeginnerFriendly ?? undefined,
    };
    return data;
  }
}

export class SpotChallenge extends LocalSpotChallenge {
  readonly id: string;

  constructor(
    id: string,
    data: SpotChallengeSchema,
    spot: Spot,
    locale: LocaleCode
  ) {
    super(data, spot, locale);
    this.id = id;
  }
}

export const ChallengeLabelNames: Record<ChallengeLabel, string> = {
  sketchy: $localize`Sketchy`,
  creative: $localize`Creative`,
  techy: $localize`Techy`,
  fun: $localize`Fun`,
};

export const ChallengeParticipantTypeNames: Record<
  ChallengeParticipantType,
  string
> = {
  solo: $localize`Solo`,
  pair: $localize`Pair`,
  group: $localize`Group`,
};
