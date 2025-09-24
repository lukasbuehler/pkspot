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
import { GeoPoint, Timestamp } from "firebase/firestore";
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
  releaseDate: Date | null;
  location: WritableSignal<google.maps.LatLngLiteral>;
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
    this.releaseDate = data.release_date?.toDate() ?? null;
    this.createdAt = data.created_at?.toDate();
    this.location = signal<google.maps.LatLngLiteral>(
      data.location
        ? {
            lat: data.location.latitude,
            lng: data.location.longitude,
          }
        : spot.location()
    );

    this.label = data.label ?? null;
    this.participantType = data.participant_type ?? null;
    this.isWaterChallenge = data.is_water_challenge ?? null;
    this.isBeginnerFriendly = data.is_beginner_friendly ?? null;
  }

  getData(): SpotChallengeSchema {
    const location = this.location();

    const data: SpotChallengeSchema = {
      spot: {
        id: this.spot.id,
        name: this.spot.name(),
      },
      name: this.nameLocaleMap(),
      media: this.media()?.getData() ?? undefined,
      description: this.descriptionLocaleMap(),
      user: this.user,
      created_at: new Timestamp(this.createdAt.getTime() / 1000, 0),
      release_date: this.releaseDate
        ? new Timestamp(this.releaseDate.getTime() / 1000, 0)
        : undefined,
      location: location ? new GeoPoint(location.lat, location.lng) : undefined,
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

export interface SpotChallengePreview {
  name: Signal<string>;
  id: string;
  media: Signal<AnyMedia>;
  location?: google.maps.LatLngLiteral;
  label?: ChallengeLabel;
  participantType?: ChallengeParticipantType;
}

export const ChallengeLabelNames: Record<ChallengeLabel, string> = {
  sketchy: $localize`Sketchy`,
  creative: $localize`Creative`,
  techy: $localize`Techy`,
  fun: $localize`Fun`,
  core: $localize`Core`,
};

export const ChallengeLabelTooltips: Record<ChallengeLabel, string> = {
  sketchy: $localize`This is a sketchy or mental challenge that requires physical and emotional control`,
  creative: $localize`The goal of this challenge is to be creative. This challenge may also be more open to interpretation.`,
  techy: $localize`This techy challenge requires great precision and control.`,
  fun: $localize`This challenge is for fun! `,
  core: $localize`A core challenge of this spot. An essential challenge for anyone seeking to master this spot.`,
};

export const ChallengeParticipantTypeNames: Record<
  ChallengeParticipantType,
  string
> = {
  solo: $localize`Solo`,
  pair: $localize`Pair`,
  team: $localize`Team`,
};
