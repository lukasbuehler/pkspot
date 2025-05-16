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
} from "@angular/core";
import { CountdownComponent } from "../countdown/countdown.component";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import { LocationStrategy, NgOptimizedImage } from "@angular/common";
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

@Component({
  selector: "app-event-page",
  imports: [
    CountdownComponent,
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

  sidenavOpen = signal<boolean>(false);
  tab = signal<"spots" | "challenges">("challenges");

  showHeader = signal<boolean>(true);

  isEmbedded = false;

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
  ];

  swissJamChallengeIds: Record<string, string[]> = {
    yhRsQmaXABRQVrbtgQ7D: [
      "QLQv51skvhF8JZhRPfIF",
      "fff",
      "K0T1AuHT0qanTaa91YdM",
      "gEsMEOnehCnQY48uUu43",
      "vqU3zXlgG2OzlU6J7n2J",
    ],
    lhSX9YEqSTKbZ9jfYy6L: ["MdELs6auoXeAU83LAb8P"],
    SpF4Abl5qmH95xalJcIX: ["WtQuOWish8CgCOgP2qxx"],
  };
  challenges = signal<(SpotChallenge & { number: number })[]>([]);

  areaPolygon = signal<PolygonSchema | null>(null);

  focusZoom = 19;

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

  mapStyle: "roadmap" | "satellite" = "satellite";

  constructor() {
    this._routeSubscription = this._route.queryParams.subscribe((params) => {
      if (params["showHeader"]) {
        this.showHeader.set(params["showHeader"] === "true");
      }

      // if (params["mapStyle"]) {
      //   this.mapStyle = params["mapStyle"];
      // }
    });

    firstValueFrom(this._route.data.pipe(take(1))).then((data) => {
      if (data["routeName"].toLowerCase().includes("embed")) {
        this.isEmbedded = true;
      }
    });

    effect(() => {
      const spots = this.spots();

      // Load challenges for spots that have them
      const challengePromises: Promise<(SpotChallenge | null)[]>[] = spots
        .filter((spot: Spot | LocalSpot) => spot instanceof Spot)
        .map((spot: Spot) => {
          const spotId = spot.id;
          if (!(spotId in this.swissJamChallengeIds))
            return Promise.resolve([]);
          const challengeIds = this.swissJamChallengeIds[spotId];
          const promises = challengeIds.map((challengeId: string) => {
            return this._challengeService
              .getSpotChallenge(spot, challengeId)
              .catch(() => null);
          });
          return Promise.all(promises);
        });

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
        allChallenges.forEach((challenge, index) => {
          if (challenge && challenge.location()) {
            challengeMarkers.push({
              name: challenge.name(),
              location: challenge.location()!,
              color: "primary",
              number: index + 1,
            });
          }
        });

        this.customMarkers.unshift(...challengeMarkers);
      });
    });

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

    firstValueFrom(
      this.mapsApiService.isApiLoaded$.pipe(
        filter((isLoaded) => isLoaded),
        take(1)
      )
    ).then(() => {
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
    });

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
      this._snackbar.open("Link to spot copied to clipboard", "Dismiss", {
        duration: 3000,
        horizontalPosition: "center",
        verticalPosition: "top",
      });
    }
  }

  selectSpot(spot: Spot | LocalSpot | SpotId | SpotPreviewData) {
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
    const location = this.challenges()[challengeIndex].location()!;
    console.log("Challenge clicked", challengeIndex, location);
    if (this.spotMap instanceof SpotMapComponent && this.spotMap.map) {
      this.spotMap.map.focusOnLocation(location);
    } else if (this.spotMap instanceof MapComponent) {
      this.spotMap.focusOnLocation(location);
    }
  }

  deselectSpot() {
    this.selectedSpot.set(null);
  }

  toggleSidenav() {
    this.sidenavOpen.update((open) => !open);
  }

  tabChanged(event: MatChipListboxChange) {
    const selectedTab = event.value;

    this.tab.set(selectedTab);
  }
}
