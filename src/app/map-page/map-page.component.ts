import {
  Component,
  ViewChild,
  AfterViewInit,
  OnInit,
  Inject,
  PLATFORM_ID,
  LOCALE_ID,
  OnDestroy,
  signal,
  WritableSignal,
  afterNextRender,
  PendingTasks,
  inject,
  effect,
} from "@angular/core";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
  ParamMap,
  Router,
  RouterEvent,
  RouterLink,
} from "@angular/router";
import {
  SpeedDialFabButtonConfig,
  SpeedDialFabComponent,
} from "../speed-dial-fab/speed-dial-fab.component";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MapsApiService } from "../services/maps-api.service";
import {
  BehaviorSubject,
  catchError,
  filter,
  firstValueFrom,
  of,
  EMPTY,
  Subscription,
  switchMap,
  take,
  timeout,
} from "rxjs";
import { animate, style, transition, trigger } from "@angular/animations";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { SearchService } from "../services/search.service";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import {
  AsyncPipe,
  isPlatformServer,
  isPlatformBrowser,
  KeyValuePipe,
  NgOptimizedImage,
} from "@angular/common";
import { StorageService } from "../services/firebase/storage.service";
import { GlobalVariables } from "../../scripts/global";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { SpotsService } from "../services/firebase/firestore/spots.service";
import { SpotDetailsComponent } from "../spot-details/spot-details.component";
import { MatOption } from "@angular/material/core";
import {
  MatAutocompleteTrigger,
  MatAutocomplete,
} from "@angular/material/autocomplete";
import { MatInput } from "@angular/material/input";
import { MatIconModule, MatIcon } from "@angular/material/icon";
import { MatMenuTrigger, MatMenu } from "@angular/material/menu";
import { MatButtonModule, MatIconButton } from "@angular/material/button";
import { MatFormField, MatSuffix } from "@angular/material/form-field";
import { Title } from "@angular/platform-browser";
import { MatDividerModule } from "@angular/material/divider";
import { LocaleCode, SpotSlug } from "../../db/models/Interfaces";
import { SlugsService } from "../services/firebase/firestore/slugs.service";
import { MetaInfoService } from "../services/meta-info.service";
import { MatChipsModule } from "@angular/material/chips";
import { MatTooltipModule } from "@angular/material/tooltip";
import { SpotSchema } from "../../../functions/src/spotHelpers";
import { SearchFieldComponent } from "../search-field/search-field.component";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../db/models/SpotChallenge";
import { ChallengeDetailComponent } from "../challenge-detail/challenge-detail.component";
import { SpotChallengesService } from "../services/firebase/firestore/spot-challenges.service";
import { ChallengeListComponent } from "../challenge-list/challenge-list.component";
import { PrimaryInfoPanelComponent } from "../primary-info-panel/primary-info-panel.component";

@Component({
  selector: "app-map-page",
  templateUrl: "./map-page.component.html",
  styleUrls: ["./map-page.component.scss"],
  animations: [
    trigger("fadeInOut", [
      transition(":enter", [
        style({ opacity: 0, scale: 1 }),
        animate("0.3s ease-out", style({ opacity: 1, scale: 1 })),
      ]),
      transition(":leave", [
        style({ opacity: 1, scale: 1, position: "absolute" }),
        animate("0.3s ease-in", style({ opacity: 0, scale: 1 })),
      ]),
    ]),
    trigger("slideInOut", [
      transition(":enter", [
        style({ opacity: 0, scale: 1, translate: "100%" }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 1, scale: 1, translate: "0px" })
        ),
      ]),
      transition(":leave", [
        style({ opacity: 1, scale: 1, translate: "0px", position: "absolute" }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 0, scale: 1, translate: "100%" })
        ),
      ]),
    ]),
  ],
  imports: [
    SpotMapComponent,
    MatButtonModule,
    MatIconModule,
    FormsModule,
    MatChipsModule,
    ReactiveFormsModule,
    SpotDetailsComponent,
    SpotListComponent,
    MatDividerModule,
    MatTooltipModule,
    SearchFieldComponent,
    ChallengeDetailComponent,
    // SpeedDialFabComponent,
    RouterLink,
    ChallengeListComponent,
    PrimaryInfoPanelComponent,
  ],
})
export class MapPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("spotMap", { static: false }) spotMap: SpotMapComponent | null =
    null;
  @ViewChild("bottomSheet") bottomSheet: BottomSheetComponent | undefined;

  pendingTasks = inject(PendingTasks);

  selectedSpot: WritableSignal<Spot | LocalSpot | null> = signal(null);
  selectedSpotIdOrSlug: WritableSignal<SpotId | string | null> = signal(null);
  showAllChallenges: WritableSignal<boolean> = signal(false);
  allSpotChallenges: WritableSignal<SpotChallenge[]> = signal([]);

  isEditing: WritableSignal<boolean> = signal(false);
  mapStyle: "roadmap" | "satellite" | null = null;
  selectedChallenge: WritableSignal<SpotChallenge | LocalSpotChallenge | null> =
    signal(null);

  askedGeoPermission: boolean = false;
  hasGeolocation: boolean = false;

  visibleSpots: Spot[] = [];
  highlightedSpots: SpotPreviewData[] = [];

  alainMode: boolean = false;

  isServer: boolean;

  showAmenities = signal<boolean>(false);

  private _alainModeSubscription?: Subscription;
  private _routerSubscription?: Subscription;

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    @Inject(PLATFORM_ID) private platformId: Object,
    public activatedRoute: ActivatedRoute,
    public authService: AuthenticationService,
    public mapsService: MapsApiService,
    public storageService: StorageService,
    private metaInfoService: MetaInfoService,
    private _spotsService: SpotsService,
    private _challengesService: SpotChallengesService,
    private _searchService: SearchService,
    private _slugsService: SlugsService,
    private router: Router,
    private _snackbar: MatSnackBar,
    private titleService: Title
  ) {
    this._alainModeSubscription = GlobalVariables.alainMode.subscribe(
      (value) => {
        this.alainMode = value;
      }
    );

    this.isServer = isPlatformServer(platformId);

    this.clearTitleAndMetaTags();

    effect(() => {
      // const selectedSpot = this.selectedSpot();
      const challenge = this.selectedChallenge();

      this.updateMapURL();
    });

    effect(() => {
      const showChallenges = this.showAllChallenges();
      const spot = this.selectedSpot();

      if (spot && showChallenges && spot instanceof Spot) {
        this._challengesService
          .getAllChallengesForSpot(spot)
          .then((challenges) => {
            this.allSpotChallenges.set(challenges);
            console.log("setting all challenges", challenges);
          });
      } else {
        this.allSpotChallenges.set([]);
        console.log("clearing all challenges");
      }
    });

    effect(() => {
      const spot = this.selectedSpot();

      if (spot instanceof Spot) {
        this.selectedSpotIdOrSlug.set(spot.slug ?? spot.id);
      } else {
        this.selectedSpotIdOrSlug.set("");
      }
    });
  }

  // Speed dial FAB //////////////////////////////////////////////////////////

  speedDialButtonConfig: SpeedDialFabButtonConfig = {
    mainButton: {
      icon: "add_location",
      tooltip: $localize`:Tooltip for add spot button|Add a new spot@@map.add_spot.tooltip:Add a new spot`,
      color: "primary",
      label: $localize`:@@pk.spotmap.addSpot:Add spot`,
      isExtended: false,
    },
    miniButtonColor: "primary",
    miniButtons: [
      {
        icon: "outlined_flag",
        tooltip: $localize`:Tooltip for add challenge button|Add a challenge@@map.add_challenge.tooltip:Add a challenge`,
      },
      {
        icon: "note_add",
        tooltip: $localize`:Tooltip for import spots button|Import spots from a file@@map.import_spots.tooltip:Import spots from a file`,
      },
    ],
  };

  setVisibleSpots(spots: Spot[]) {
    if (!spots || spots.length === 0) {
      this.visibleSpots = [];
      return;
    }

    this.visibleSpots = spots;
  }

  speedDialMiniFabClick(index: number) {
    switch (index) {
      case 0:
        this.router.navigateByUrl("/kml-import");
        break;
      default:
        console.error("Uncaught fab click registered");
        break;
    }
  }

  // Initialization ///////////////////////////////////////////////////////////

  ngOnInit() {
    console.log("map page init");

    // Collect params from all levels in the route tree
    const spotIdOrSlug: string | null =
      this.activatedRoute.snapshot.firstChild?.paramMap.get("spot") ?? null;
    const challengeId: string | null =
      this.activatedRoute.snapshot.firstChild?.firstChild?.firstChild?.paramMap.get(
        "challenge"
      ) ?? null;
    const showChallenges =
      !!this.activatedRoute.snapshot.firstChild?.firstChild;

    this.pendingTasks.run(async () => {
      this._handleURLParamsChange(spotIdOrSlug, showChallenges, challengeId);
    });
  }

  async _getSpotIdFromSlugOrId(spotIdOrSlug: string): Promise<SpotId | null> {
    const selectedSpot = this.selectedSpot();

    if (
      selectedSpot &&
      selectedSpot instanceof Spot &&
      spotIdOrSlug === (selectedSpot.slug ?? selectedSpot.id)
    ) {
      // don't emit anything if it's already selected
      return null;
    }

    if (spotIdOrSlug) {
      return this._slugsService
        .getSpotIdFromSpotSlugHttp(spotIdOrSlug)
        .catch(() => spotIdOrSlug as SpotId);
    } else {
      // don't emit anything if no spot is provided
      return null;
    }
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this._routerSubscription = this.router.events
        .pipe(filter((event) => event instanceof NavigationStart))
        .subscribe((event) => {
          const navEvent = event as NavigationStart;
          // Only handle navigation events that are for the map page
          if (!navEvent.url.startsWith("/map")) {
            // Navigating away from map, do not interfere
            return;
          }
          const match = navEvent.url.match(
            /^\/map(?:\/([^\/]+))?(?:\/(c)(?:\/([^\/]+))?)?/
          );
          const spotIdOrSlug = match?.[1] ?? null;
          const showChallenges = !!match?.[2];
          const challengeId = match?.[3] ?? null;

          this._handleURLParamsChange(
            spotIdOrSlug,
            showChallenges,
            challengeId
          );
        });
    }
  }

  _handleURLParamsChange(
    spotIdOrSlug: string | null,
    showChallenges: boolean,
    challengeId: string | null
  ) {
    if (challengeId && spotIdOrSlug) {
      // open the spot on a challenge
      const selectedSpot = this.selectedSpot();
      if (selectedSpot && selectedSpot instanceof Spot) {
        this.loadChallengeById(selectedSpot, challengeId, false).then(() => {});
      } else if (!selectedSpot) {
        // load the spot by id then the challenge
      } else {
        // the spot is a local spot
        console.error(
          "Cannot open a challenge of a local spot, it should not have one!"
        );
      }
    } else if (spotIdOrSlug) {
      if (this.selectedChallenge()) this.closeChallenge();
      this.showAllChallenges.set(showChallenges);

      if (this.selectedSpotIdOrSlug() !== spotIdOrSlug) {
        this._getSpotIdFromSlugOrId(spotIdOrSlug).then((spotId) => {
          if (!spotId) {
            console.warn("Could not get spot id from slug or id.");
            return;
          }

          // open the spot
          this.loadSpotById(spotId as SpotId, false).then(() => {});
        });
      }
    } else {
      // close the spot
      this.closeSpot(false);
      this.showAllChallenges.set(false);
    }
  }

  openSpotOrGooglePlace(value: { type: "place" | "spot"; id: string }) {
    if (value.type === "place") {
      this.openGooglePlaceById(value.id);
    } else {
      this.loadSpotById(value.id as SpotId).then(() => {});
    }
  }

  openGooglePlaceById(id: string) {
    this.mapsService.getGooglePlaceById(id).then((place) => {
      if (!place?.geometry?.viewport) return;
      this.spotMap?.focusBounds(place.geometry.viewport);
    });
  }

  async loadSpotById(spotId: SpotId, updateUrl: boolean = true): Promise<Spot> {
    console.debug("loading spot by id", spotId);
    const spot: Spot = await this._spotsService.getSpotByIdHttp(
      spotId,
      this.locale
    );
    this.selectSpot(spot, updateUrl);

    return spot;
  }

  async loadChallengeById(
    spot: Spot,
    challengeId: string,
    updateUrl: boolean = true
  ): Promise<SpotChallenge> {
    console.debug("loading challenge by id", challengeId);

    const challenge: SpotChallenge =
      await this._challengesService.getSpotChallenge(spot, challengeId);

    this.selectChallenge(challenge, updateUrl);

    return challenge;
  }

  updateMapURL() {
    const selectedSpot = this.selectedSpot();
    const selectedChallenge = this.selectedChallenge();

    const urlTree = this.router.createUrlTree(
      selectedChallenge &&
        selectedChallenge instanceof SpotChallenge &&
        selectedSpot &&
        selectedSpot instanceof Spot
        ? [
            "/map",
            selectedSpot.slug ?? selectedSpot.id,
            "c",
            selectedChallenge.id,
          ]
        : selectedSpot &&
          selectedSpot instanceof Spot &&
          this.showAllChallenges()
        ? ["/map", selectedSpot.slug ?? selectedSpot.id, "c"]
        : selectedSpot && selectedSpot instanceof Spot
        ? ["/map", selectedSpot.slug ?? selectedSpot.id]
        : ["/map"]
    );
    const currentUrl = this.router.url;
    const newUrl = this.router.serializeUrl(urlTree);

    console.log(currentUrl, newUrl);

    if (currentUrl === newUrl) {
      return;
    } else if (currentUrl.startsWith("/map")) {
      this.router.navigateByUrl(newUrl);
    }
    // If not on /map, do not update the URL
  }

  selectSpot(spot: Spot | LocalSpot | null, updateUrl: boolean = true) {
    console.debug("selecting spot", spot);
    if (!spot) {
      this.closeSpot(updateUrl);
    } else {
      this.closeChallenge(false);
      this.selectedSpot.set(spot);
      this.setSpotMetaTags();
      this.spotMap?.focusSpot(spot);

      if (updateUrl && spot instanceof Spot) {
        this.updateMapURL();
      }
    }
  }

  selectChallenge(challenge: SpotChallenge, updateUrl: boolean = true) {
    if (!challenge) {
      return this.closeChallenge(updateUrl);
    } else {
      this.selectedChallenge.set(challenge);

      if (updateUrl) {
        this.updateMapURL();
      }
      const location = challenge.location();
      if (location) {
        this.spotMap?.focusPoint(location);
      } else {
        this.spotMap?.focusSpot(challenge.spot);
      }
    }
  }

  closeSpot(updateUrl: boolean = true) {
    this.clearTitleAndMetaTags();
    this.selectedSpot.set(null);
    this.closeChallenge(false);

    if (updateUrl) {
      this.updateMapURL();
    }
  }

  closeChallenge(updateUrl: boolean = true) {
    this.selectedChallenge.set(null);

    if (updateUrl) {
      this.updateMapURL();
    }
  }

  setSpotMetaTags() {
    const spot = this.selectedSpot();

    if (spot === null) {
      this.clearTitleAndMetaTags();
      console.debug("clearing meta tags");
      return;
    }
    console.debug("setting meta tags for spot", spot.name());

    const title: string = `${spot.name()} Spot`;
    const image_src: string =
      spot.previewImageSrc() ?? "/assets/banner_1200x630.png";

    let description: string = "";
    if (spot.localityString()) {
      description =
        $localize`:The text before the localized location of the spot. E.g. Spot in Wiedikon, Zurich, CH@@spot.locality.pretext:Spot in ` +
        spot.localityString();
    }

    if (description) {
      description += " - ";
    }

    if (spot.rating) {
      description += $localize`Rating: ${spot.rating} / 5`;
    }

    if (description) {
      description += " - ";
    }

    if (spot.description()) {
      description += `${spot.description()}`;
    }

    this.metaInfoService.setMetaTags(title, image_src, description);
    // console.debug("Set meta tags for spot", spot.name());
  }

  clearTitleAndMetaTags() {
    this.titleService.setTitle($localize`:@@pk.spotmap.title:PK Spot Map`);
    this.metaInfoService.setMetaTags(
      $localize`:@@pk.spotmap.title:PK Spot Map`,
      "/assets/banner_1200x630.png",
      "Discover, Train, Share. Discover spots and fellow athletes, plan training sessions with your friends and share achievements and memories with them and the world."
    );
  }

  ngOnDestroy() {
    console.debug("destroying map page");
    this.closeSpot();
    this._routerSubscription?.unsubscribe();
    this._alainModeSubscription?.unsubscribe();
  }
}
