import {
  Component,
  inject,
  LOCALE_ID,
  afterNextRender,
  OnInit,
  ViewChild,
  signal,
  OnDestroy,
  AfterViewInit,
  effect,
  ElementRef,
  PLATFORM_ID,
} from "@angular/core";
import { CountdownComponent } from "../countdown/countdown.component";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import {
  isPlatformBrowser,
  KeyValuePipe,
  LocationStrategy,
  NgOptimizedImage,
} from "@angular/common";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { SpotsService } from "../services/firebase/firestore/spots.service";
import {
  filter,
  firstValueFrom,
  lastValueFrom,
  Subscription,
  take,
  timeout,
} from "rxjs";
import { LocaleCode, MediaType } from "../../db/models/Interfaces";
import { MarkerComponent, MarkerSchema } from "../marker/marker.component";
import { MetaInfoService } from "../services/meta-info.service";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { SpotDetailsComponent } from "../spot-details/spot-details.component";
import { trigger, transition, style, animate } from "@angular/animations";
import { CodeBlockComponent } from "../code-block/code-block.component";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatChipListboxChange, MatChipsModule } from "@angular/material/chips";
import { MapsApiService } from "../services/maps-api.service";
import { PolygonSchema } from "../../db/schemas/PolygonSchema";
import { MapComponent } from "../map/map.component";
import { GeoPoint } from "@firebase/firestore";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { MatSidenavModule } from "@angular/material/sidenav";
import { ExternalImage } from "../../db/models/Media";
import { SpotChallengesService } from "../services/firebase/firestore/spot-challenges.service";
import { SpotChallenge } from "../../db/models/SpotChallenge";
import { ChallengeListComponent } from "../challenge-list/challenge-list.component";
import { MatDividerModule } from "@angular/material/divider";
import { ChallengeDetailComponent } from "../challenge-detail/challenge-detail.component";
import { Pipe, PipeTransform } from "@angular/core";
import { ChipSelectComponent } from "../chip-select/chip-select.component";
import { FormControl } from "@angular/forms";
import {
  ChallengeParticipantTypeValues,
  ChallengeParticipantTypeIcons,
} from "../../db/schemas/SpotChallengeLabels";
import {
  ChallengeLabelNames,
  ChallengeParticipantTypeNames,
} from "../../db/models/SpotChallenge";
import {
  ChallengeLabelIcons,
  ChallengeLabelValues,
} from "../../db/schemas/SpotChallengeLabels";

@Pipe({
  name: "reverse",
  standalone: true,
})
export class ReversePipe implements PipeTransform {
  transform<T>(value: T[]): T[] {
    if (!Array.isArray(value)) return value;
    return [...value].reverse();
  }
}

@Component({
  selector: "app-event-page",
  imports: [
    // CountdownComponent,
    SpotMapComponent,
    // NgOptimizedImage,
    SpotListComponent,
    // MarkerComponent,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    SpotDetailsComponent,
    MatMenuModule,
    MatChipsModule,
    MapComponent,
    MatSidenavModule,
    ChallengeListComponent,
    MatDividerModule,
    ChallengeDetailComponent,
    KeyValuePipe,
    MarkerComponent,
    ReversePipe,
    ChipSelectComponent,
  ],
  animations: [
    trigger("fadeInOut", [
      transition(":enter", [
        style({ opacity: 0, scale: 0.8 }),
        animate("0.3s ease-out", style({ opacity: 1, scale: 1 })),
      ]),
      transition(":leave", [
        style({ opacity: 1, scale: 1 }),
        animate("0.3s ease-in", style({ opacity: 0, scale: 0.8 })),
      ]),
    ]),
  ],
  templateUrl: "./event-page.component.html",
  styleUrl: "./event-page.component.scss",
})
export class EventPageComponent implements OnInit, OnDestroy {
  @ViewChild("spotMap") spotMap: SpotMapComponent | MapComponent | undefined;
  @ViewChild("scrollContainer") scrollContainer:
    | ElementRef<HTMLElement>
    | undefined;
  @ViewChild("spotScrollContainer")
  spotScrollContainer?: ElementRef<HTMLElement>;

  metaInfoService = inject(MetaInfoService);
  locale = inject<LocaleCode>(LOCALE_ID);
  private _spotService = inject(SpotsService);
  private _challengeService = inject(SpotChallengesService);
  private _route = inject(ActivatedRoute);
  private _locationStrategy = inject(LocationStrategy);
  private _snackbar = inject(MatSnackBar);
  mapsApiService = inject(MapsApiService);

  private _routeSubscription: Subscription;

  selectedSpot = signal<Spot | LocalSpot | null>(null);
  selectedChallenge = signal<(SpotChallenge & { number: number }) | null>(null);

  sidenavOpen = signal<boolean>(false);
  tabs = {
    spots: $localize`Spots`,
    challenges: $localize`Challenges`,
    // event: $localize`:event locations label:Event`,
  };
  tab = signal<(typeof this.tabs)[keyof typeof this.tabs]>("spots");

  showHeader = signal<boolean>(true);

  isCompactView = false;
  private _isEmbedded = false;

  eventId: string = "swissjam25";
  name: string = "Swiss Jam 2025";
  bannerImageSrc: string = "/assets/swissjam/swissjam0.jpg";
  venueString: string = "Universität Irchel";
  localityString: string = "Zurich, Switzerland";
  start: Date = new Date("2025-05-24T09:00:00+01:00");
  end: Date = new Date("2025-05-25T16:00:00+01:00");
  url: string = "https://www.swissparkourtour.ch/swiss-jam-2025/";
  readableStartDate: string = this.start.toLocaleDateString(this.locale, {
    dateStyle: "full",
  });
  readableEndDate: string = this.end.toLocaleDateString(this.locale, {
    dateStyle: "full",
  });

  swissJamSpotIds: SpotId[] = [
    // "yhRsQmaXABRQVrbtgQ7D" as SpotId, // main spot
    "23Oek5FVSThPbuG6MSjj" as SpotId,
    "EcI4adxBhMYZOXT8tPe3" as SpotId,
    "lhSX9YEqSTKbZ9jfYy6L" as SpotId,
    "ZkDaO5DSY7wyBQkgZMWC" as SpotId,
    "sRX9lb5lNYKGqQ5e4rcO" as SpotId,
    "SpF4Abl5qmH95xalJcIX" as SpotId,
    "KgeGafTHPg4mgJgG00Gj" as SpotId,
    "teekopIoaqy0CublyWrY" as SpotId,
    "Amxf5W61oLpov55sDMGb" as SpotId,
    "cmKGumywcZ4F7ZzSjvl2" as SpotId,
    "UTFmdSsQ6oWOpzsxZVw0" as SpotId,
  ];

  swissJamChallengeIds: Record<string, SpotId> = {
    QLQv51skvhF8JZhRPfIF: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 1
    D7a2hgAmd9508i2eCWxA: "lhSX9YEqSTKbZ9jfYy6L" as SpotId, // CH 2
    K0T1AuHT0qanTaa91YdM: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 3
    gEsMEOnehCnQY48uUu43: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 4
    vqU3zXlgG2OzlU6J7n2J: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 5
    MdELs6auoXeAU83LAb8P: "lhSX9YEqSTKbZ9jfYy6L" as SpotId, // CH 6
    WtQuOWish8CgCOgP2qxx: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 7
    FKMXqEnEWCUvywveQM9V: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 9 (8)
    vk49nGUNxLngnyNUxfbI: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 10 (9)
    TDzQiroN6H4NeXrVI8zP: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 12 (10)
    // vsRLsBYLiL0FIhQx8708: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 13 (11)
    z15ugcuet4cWAL5iBAZY: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 14 (11) Crowded High Pillar
    ZoTqnbxosdeUUnngZjdN: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 15 (12) Parallel bar 180/360
    mlb5C7ws1Fkh2ILjZ2cn: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 16 (13) How can you slide me
    vRSKCWusby7bEz5amSHo: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 17 (14) Water pre
    iftBeXgg70FyI6w2mzUI: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 20 (15) Don't hug the flag
    Fdrag4MGr1Vhj4gv34XP: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 21 (16) One object many ways
    bvbUbCwcnX9Whcrd4e0Y: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 22 (17) Pre on wood
    RqZJxohePhQuKjWGfvF0: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 23 (18) Pre on land
    lRXsLfDbiukLMJQedDQc: "KgeGafTHPg4mgJgG00Gj" as SpotId, // CH 24 (19) Techy climb up
    "68QdJQOfvG8Tk5u524uS": "teekopIoaqy0CublyWrY" as SpotId, // CH 25 (20) Stone pillar pre
    yVOJaJwArvxetV8IebI9: "teekopIoaqy0CublyWrY" as SpotId, // CH 26 (21) Team Run over tables
    Q2x3DfAYEmnztTrJj8Dr: "teekopIoaqy0CublyWrY" as SpotId, // CH 27 (22) Tree-root swing pre
    "9AWj4bLnIK4FPBwziR74": "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 29 (23) Running gap
    uueZk4lnMtbovTcbF2PH: "Amxf5W61oLpov55sDMGb" as SpotId, // CH 30 (24) Lori Chill Standing Pre
    QOxoU0WfCbvePKf2iTXq: "Amxf5W61oLpov55sDMGb" as SpotId, // CH 31 (25) Team climb
    Xdd7GBJpqxVlGboYbqMb: "Amxf5W61oLpov55sDMGb" as SpotId, // CH 58 (26) Team vault
    G0ZiRM4znjHXHLLCawNJ: "Amxf5W61oLpov55sDMGb" as SpotId, // CH 59 (27) Roundabout
    Qzi7FGUREABhRH3AL8Pr: "Amxf5W61oLpov55sDMGb" as SpotId, // CH 60 (28) Fantasy turns
    IiEnyvxfGL8agTR3R1oM: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 32 (?) Side kong to pre
    f0oVghc01nxtGtROZzoj: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 33 (?) Standing kong pre
    cWv5ZCeTfEunNUKHnr4K: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 34 (?) Easy hurdle
    zEzrzAGhwWqOljZ7XJvv: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 35 (?) Nasty pre
    ikUY18abG2fVs8khCygU: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 56 (?) Edge swing
    "1z7JXAqC9vigFJ6BObMO": "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 57 (?) Climb Challenge
    "7KpmrH41UV3RFWztlr2n": "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 36 (?) 90 degree pre
    Q1ljcOISiJUfsep1vuTl: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 37 (?) balcony pre

    JjFpk5AHK7n0AkyBFlzC: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 38 (?) Water kong pre
    "4JgXkTp9WS8mH25esZMf": "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 39 (?) Water standing pre
    TeR2cRngig5vg4SRgpNp: "EcI4adxBhMYZOXT8tPe3" as SpotId, // CH 48 (?) Pass by

    KkM23zLvv1aUq2yFjZaZ: "Amxf5W61oLpov55sDMGb" as SpotId, // CH 44 (?) Funky ting

    oiF8FeZrPiEpI9JX3k84: "UTFmdSsQ6oWOpzsxZVw0" as SpotId, // CH 45 (?) Team plyo
    ajCGEBOnCyDb7TNqtWiA: "UTFmdSsQ6oWOpzsxZVw0" as SpotId, // CH 46 (?) nasty ass pre

    "2bI6mdJqMfnbOoWJoIdy": "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 50 (?) skip the middle step
    TgLyTpfDzDQWkCo6zIYE: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 52 (?) lu gumpiball
    qA3kFOUdZweQkHsM2uZn: "yhRsQmaXABRQVrbtgQ7D" as SpotId, // CH 53 (?) Big Plyo

    "4L6gdXR7Usv32jgJmKZc": "teekopIoaqy0CublyWrY" as SpotId, // CH 47 (?) Böckli vault
    "519ZY623JjKNTnPzMshY": "cmKGumywcZ4F7ZzSjvl2" as SpotId, // CH 49 (?) Floor is Lava

    wmmDfHREL9nPvdDwKSb5: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 54 (?) Ass slide

    CnviOVVgUtkdFrdsM7bk: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 55 (?) Ganja bush
    LSLNGNbkVq1Fypr9enbs: "SpF4Abl5qmH95xalJcIX" as SpotId, // CH 28 (?) Team hurdle
  };
  challenges = signal<(SpotChallenge & { number: number })[]>([]);

  areaPolygon = signal<PolygonSchema | null>(null);

  focusZoom = 20;

  bounds = {
    north: 47.4,
    south: 47.393,
    west: 8.54087,
    east: 8.553,
  };

  customMarkers: MarkerSchema[] = [
    // Parking local_parking
    {
      name: "Parking garage",
      color: "tertiary",
      location: {
        lat: 47.39812077013162,
        lng: 8.546551689295336,
      },
      icons: ["local_parking", "garage"],
    },

    // Tram stations
    {
      name: "Milchbuck (Tram-Station)",
      color: "tertiary",
      location: {
        lat: 47.39778445846257,
        lng: 8.541912684696003,
      },
      icons: ["tram", "directions_bus"],
    },
    {
      name: "Universität Irchel (Tram-Station)",
      color: "tertiary",
      location: {
        lat: 47.39622541657696,
        lng: 8.544870658516267,
      },
      icons: ["tram"],
    },

    // WC
    {
      name: $localize`WC`,
      color: "secondary",
      location: {
        lat: 47.397143104254134,
        lng: 8.549462816940418,
      },
      icons: ["wc"],
    },
    // Info
    {
      name: $localize`Info stand`,
      color: "secondary",
      location: {
        lat: 47.39723002436682,
        lng: 8.548602928177829,
      },
      icons: [
        "info",
        "restaurant",
        "video_camera_front",
      ] /* "local_activity", */,
      priority: "required",
    },
    {
      name: $localize`Open Gym (ASVZ)`,
      color: "secondary",
      location: {
        lat: 47.39791103067576,
        lng: 8.545801263180458,
      },
      icons: ["roofing", "wc"] /* "local_activity", */,
      priority: "required",
    },
  ];

  markers: MarkerSchema[] = this.customMarkers;

  spots = signal<(Spot | LocalSpot)[]>([]);

  platformId = inject(PLATFORM_ID);

  mapStyle: "roadmap" | "satellite" = "satellite";
  tabKeyVal: any;

  selectedLabels = signal<string[]>([]);
  selectedParticipantTypes = signal<string[]>([]);

  challengeParticipantTypes = ChallengeParticipantTypeValues;
  challengeParticipantTypeNames = ChallengeParticipantTypeNames;
  challengeParticipantTypeIcons = ChallengeParticipantTypeIcons;
  participantTypeCtrl = new FormControl<string[]>([], { nonNullable: true });
  labelCtrl = new FormControl<string[]>([], { nonNullable: true });

  readonly challengeLabels = ChallengeLabelValues;
  readonly challengeLabelNames = ChallengeLabelNames;
  readonly challengeLabelIcons = ChallengeLabelIcons;

  constructor() {
    this._routeSubscription = this._route.queryParams.subscribe((params) => {
      if (params["showHeader"]) {
        this.showHeader.set(params["showHeader"] === "true");
      }

      // if (params["mapStyle"]) {
      //   this.mapStyle = params["mapStyle"];
      // }
    });

    // Detect compact view (embedded or mobile)
    this.updateCompactView = this.updateCompactView.bind(this);
    if (isPlatformBrowser(this.platformId) && typeof window !== "undefined") {
      window.addEventListener("resize", this.updateCompactView);

      firstValueFrom(this._route.data.pipe(take(1))).then((data) => {
        if (data["routeName"].toLowerCase().includes("embed")) {
          this._isEmbedded = true;
          this.updateCompactView();
        }
      });

      this.updateCompactView();

      effect(() => {
        const selectedChallenge = this.selectedChallenge();
        // Only scroll if the container exists

        if (this.scrollContainer && this.scrollContainer.nativeElement) {
          setTimeout(() => {
            this.scrollContainer?.nativeElement.scrollTo({
              top: 0,
              behavior: "smooth",
            });
          });
        }
      });

      effect(() => {
        const selectedSpot = this.selectedSpot();
        if (
          this.spotScrollContainer &&
          this.spotScrollContainer.nativeElement
        ) {
          setTimeout(() => {
            this.spotScrollContainer?.nativeElement.scrollTo({
              top: 0,
              behavior: "smooth",
            });
          });
        }
      });

      effect(() => {
        const spots = this.spots();
        const selectedLabels = this.selectedLabels();
        const selectedParticipantTypes = this.selectedParticipantTypes();

        // Load challenges for spots that have them
        const challengePromises: Promise<SpotChallenge | null>[] =
          Object.entries(this.swissJamChallengeIds).map(
            ([challengeId, spotId]) => {
              const spot = spots.find((s) => {
                if (s instanceof Spot) {
                  return s.id === spotId;
                } else {
                  return false;
                }
              });
              if (spot && spot instanceof Spot) {
                return this._challengeService
                  .getSpotChallenge(spot, challengeId)
                  .then((challenge) => {
                    if (challenge) {
                      return challenge;
                    } else {
                      return null;
                    }
                  })
                  .catch(() => null);
              }
              return Promise.resolve(null);
            }
          );

        Promise.all(challengePromises).then((challengeArrays) => {
          // Flatten the array of arrays, keeping nulls for failed fetches
          const allChallenges =
            challengeArrays.flat() as (SpotChallenge | null)[];
          this.challenges.set(
            allChallenges
              .map((c, idx) => [c, idx])
              .filter(([c, idx]) => c instanceof SpotChallenge)
              .map(([c, idx]) => {
                const challenge = c as SpotChallenge;
                // Use object spread to ensure the number property is present on the returned object
                return {
                  ...challenge,
                  number: (idx as number) + 1,
                } as SpotChallenge & { number: number };
              })
          );

          const challengeMarkers: MarkerSchema[] = [];
          allChallenges
            // .filter((challenge) => {
            //   return (
            //     (!selectedLabels.length ||
            //       (challenge &&
            //         challenge.label &&
            //         selectedLabels.includes(challenge.label))) &&
            //     (!selectedParticipantTypes.length ||
            //       (challenge &&
            //         challenge.participantType &&
            //         selectedParticipantTypes.includes(challenge.participantType)))
            //   );
            // })
            .forEach((challenge, index) => {
              if (challenge && challenge.location()) {
                challengeMarkers.push({
                  name: challenge.name(),
                  location: challenge.location()!,
                  color:
                    (!selectedLabels.length ||
                      (challenge &&
                        challenge.label &&
                        selectedLabels.includes(challenge.label))) &&
                    (!selectedParticipantTypes.length ||
                      (challenge &&
                        challenge.participantType &&
                        selectedParticipantTypes.includes(
                          challenge.participantType
                        )))
                      ? "primary"
                      : "gray",
                  number: index + 1,
                });
              }
            });

          if (challengeMarkers.length > 0) {
            this.markers = [...challengeMarkers, ...this.customMarkers];
            this.tab.set("challenges");
          }
        });
      });
    }

    afterNextRender(() => {
      const promises = this.swissJamSpotIds.map((spotId) => {
        return firstValueFrom(
          this._spotService.getSpotById$(spotId, this.locale)
        );
      });

      Promise.all(promises).then((loadedSpots) => {
        this.spots.update((spots) => [...spots, ...loadedSpots]);
      });
    });

    const mainSpot = new Spot(
      "yhRsQmaXABRQVrbtgQ7D" as SpotId,
      {
        location: new GeoPoint(47.39732893509323, 8.548509576285669),
        name: {
          en: { text: `Main Spot`, provider: "user" },
          de: { text: "Hauptspot", provider: "user" },
          fr: { text: "Spot principal", provider: "user" },
          it: { text: "Spot principale", provider: "user" },
        },
        bounds: [
          new GeoPoint(47.397237163433424, 8.54852286554543),
          new GeoPoint(47.39727438598336, 8.548373942307316),
          new GeoPoint(47.39742969172247, 8.548445028774058),
          new GeoPoint(47.397365317957394, 8.548779092061668),
          new GeoPoint(47.39725743643263, 8.548711980937691),
          new GeoPoint(47.397297807170254, 8.548555067641223),
        ],
        media: [
          {
            src: "/assets/swissjam/swissjam2.jpg",
            type: MediaType.Image,
            isInStorage: false,
          },
          {
            src: "/assets/swissjam/swissjam0.jpg",
            type: MediaType.Image,
            isInStorage: false,
          },
          {
            src: "/assets/swissjam/swissjam1.jpg",
            type: MediaType.Image,
            isInStorage: false,
          },
        ],
        // description: {
        //   en: {
        //     text: `The main spot of the Swiss Jam 25. It will have a shade `,
        //     provider: "user",
        //   },},
        is_iconic: true,
        amenities: {
          covered: true,
          entry_fee: true,
          lighting: true,
          outdoor: true,
          changing_room: false,
        },
      },
      this.locale
    );

    this.spots.set([mainSpot]);
  }

  updateCompactView() {
    if (!isPlatformBrowser(this.platformId) || typeof window === "undefined") {
      return;
    }

    this.isCompactView = this._isEmbedded || window.innerWidth <= 576;
  }

  public get isEmbedded(): boolean {
    return this._isEmbedded;
  }

  ngOnInit() {
    this.metaInfoService.setMetaTags(
      this.name,
      this.bannerImageSrc,
      $localize`Event in ` +
        this.localityString +
        ", (" +
        (this.start.toLocaleDateString() === this.end.toLocaleDateString()
          ? this.start.toLocaleDateString()
          : this.start.toLocaleDateString() +
            " - " +
            this.end.toLocaleDateString()) +
        ")"
    );

    if (isPlatformBrowser(this.platformId) && typeof window !== "undefined") {
      // Use effect to wait for Maps API to load
      effect(() => {
        if (this.mapsApiService.isApiLoaded()) {
          this.areaPolygon.set({
            paths: new google.maps.MVCArray<
              google.maps.MVCArray<google.maps.LatLng>
            >([
              new google.maps.MVCArray<google.maps.LatLng>([
                new google.maps.LatLng(0, -90),
                new google.maps.LatLng(0, 90),
                new google.maps.LatLng(90, -90),
                new google.maps.LatLng(90, 90),
              ]),
              new google.maps.MVCArray<google.maps.LatLng>([
                new google.maps.LatLng(47.39690440489847, 8.54137955373239),
                new google.maps.LatLng(47.39922912784592, 8.54270958874722),
                new google.maps.LatLng(47.39976970395402, 8.546988087725437),
                new google.maps.LatLng(47.39852765134482, 8.552592984179212),
                new google.maps.LatLng(47.39266322242201, 8.550449664195357),
                new google.maps.LatLng(47.395861761732796, 8.546175461394029),
              ]),
            ]),
            strokeOpacity: 0,
            strokeWeight: 0,
            fillColor: "#000000",
            fillOpacity: 0.5,
          });
        }
      });
    }

    // add the structured data for the event
    const structuredDataJson = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: this.name,
      startDate: this.start.toISOString(),
      endDate: this.end.toISOString(),
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: "Universität Irchel",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Zürich",
          postalCode: "8057",
          streetAddress:
            "Universitätscampus Irchel, Winterthurerstrasse 190, Zürich, CH",
        },
      },
      image: [this.bannerImageSrc],
      description:
        "The Swiss Jam 2025 invites the whole Parkour community to Zurich.\n" +
        "The main event area is located at the Irchepark. Different workshops for all skill levels can be joined. A big spot with major extensions gives enough room for all kind of movements and inspirations. A big Video-Screeing shows our communitys creativity.\n" +
        "Join the event to jam, to learn, to get inspired and inspire!",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "CHF",
        highPrice: "29.90",
        lowPrice: "14.90",
        offerCount: "3",
        offers: [
          {
            "@type": "Offer",
            name: "All Workshops",
            price: "29.90",
            priceCurrency: "CHF",
          },
          {
            "@type": "Offer",
            name: "2x Workshops",
            price: "24.90",
            priceCurrency: "CHF",
          },
          {
            "@type": "Offer",
            name: "1x Workshops",
            price: "14.90",
            priceCurrency: "CHF",
          },
        ],
        url: "https://eventfrog.ch/de/p/sport-fitness/sonstige-veranstaltungen/swiss-jam-2025-7291100335594076233.html",
      },
      organizer: {
        "@type": "Organization",
        name: "Swiss Parkour Tour",
        url: "https://www.swissparkourtour.ch/",
        memberOf: {
          "@type": "Organization",
          name: "Swiss Parkour Association",
          url: "https://spka.ch",
        },
      },
      url: this.url,
    };

    if (typeof document !== "undefined") {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(structuredDataJson);
      document.body.appendChild(script);
    }
  }

  spotClickedIndex(spotIndex: number) {
    this.selectSpot(this.spots()[spotIndex]);
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId) && typeof window !== "undefined") {
      window.removeEventListener("resize", this.updateCompactView);
    }

    if (this._routeSubscription) {
      this._routeSubscription.unsubscribe();
    }

    // remove the event structured data element
    if (typeof document !== "undefined") {
      const script = document.querySelector(
        'script[type="application/ld+json"]'
      );
      if (script) {
        script.remove();
      }
    }
  }

  async shareEvent() {
    const url = "https://pkspot.app";
    const baseUrl = this._locationStrategy.getBaseHref();

    // TODO use slug instead of id if available

    const link = url + "/events/" + this.eventId;

    if (navigator["share"]) {
      try {
        const shareData = {
          title: this.name,
          text: `PK Spot: ${this.name}`,
          url: link,
        };

        await navigator["share"](shareData);
      } catch (err) {
        console.error("Couldn't share this spot");
        console.error(err);
      }
    } else {
      navigator.clipboard.writeText(`${this.name} - PK Spot \n${link}`);
      this._snackbar.open(
        `Link to ${this.name} event copied to clipboard`,
        "Dismiss",
        {
          duration: 3000,
          horizontalPosition: "center",
          verticalPosition: "top",
        }
      );
    }
  }

  selectSpot(spot: Spot | LocalSpot | SpotId | SpotPreviewData) {
    this.tab.set("spots");
    this.sidenavOpen.set(true);

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      this.selectedSpot.set(spot);
      if (this.spotMap instanceof SpotMapComponent) {
        this.spotMap?.focusSpot(spot);
      } else if (this.spotMap instanceof MapComponent) {
        this.spotMap?.focusOnLocation(spot.location());
      }
    }
  }

  challengeClickedIndex(challengeIndex: number) {
    const challenge = this.challenges()[challengeIndex];
    if (challenge) {
      const location = challenge.location()!;

      this.selectedChallenge.set(challenge);

      if (this.spotMap instanceof SpotMapComponent && this.spotMap.map) {
        this.spotMap.map.focusOnLocation(location);
      } else if (this.spotMap instanceof MapComponent) {
        this.spotMap.focusOnLocation(location);
      }
    }
  }

  deselectSpot() {
    this.selectedSpot.set(null);
  }

  toggleSidenav() {
    this.sidenavOpen.update((open) => !open);
  }

  markerClick(markerIndex: number) {
    const marker = this.markers[markerIndex];
    console.log("Marker clicked", marker);

    if (marker.number) {
      this.challangeMarkerClicked(markerIndex);
    }
  }

  challangeMarkerClicked(challengeIndex: number) {
    const challenge = this.challenges()[challengeIndex];

    console.log("Challenge clicked", challenge);

    if (challenge) {
      // open the challenge tab
      this.tab.set("challenges");
      this.sidenavOpen.set(true);

      // open the challenge in the sidenav
      this.selectedChallenge.set(challenge);
    }
  }

  tabChanged(event: MatChipListboxChange) {
    const selectedTab = event.value;
    if (selectedTab) {
      this.tab.set(selectedTab);
    }
  }
}
