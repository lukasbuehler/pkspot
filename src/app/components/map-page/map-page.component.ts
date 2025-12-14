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
  PendingTasks,
  inject,
  effect,
  computed,
} from "@angular/core";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import {
  ActivatedRoute,
  NavigationStart,
  Router,
  RouterLink,
} from "@angular/router";
import {
  SpeedDialFabButtonConfig,
  SpeedDialFabComponent,
} from "../speed-dial-fab/speed-dial-fab.component";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MapsApiService } from "../../services/maps-api.service";
import { filter, Subscription } from "rxjs";
import { animate, style, transition, trigger } from "@angular/animations";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { SearchService } from "../../services/search.service";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import {
  AsyncPipe,
  isPlatformServer,
  isPlatformBrowser,
  NgComponentOutlet,
  NgTemplateOutlet,
} from "@angular/common";
import { StorageService } from "../../services/firebase/storage.service";
import { GlobalVariables } from "../../../scripts/global";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotDetailsComponent } from "../spot-details/spot-details.component";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { Title } from "@angular/platform-browser";
import { MatDividerModule } from "@angular/material/divider";
import { LocaleCode, MediaType, SpotSlug } from "../../../db/models/Interfaces";
import { SlugsService } from "../../services/firebase/firestore/slugs.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { MatChipsModule } from "@angular/material/chips";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { SearchFieldComponent } from "../search-field/search-field.component";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../db/models/SpotChallenge";
import { ChallengeDetailComponent } from "../challenge-detail/challenge-detail.component";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { ChallengeListComponent } from "../challenge-list/challenge-list.component";
import { PrimaryInfoPanelComponent } from "../primary-info-panel/primary-info-panel.component";
import { ConsentService } from "../../services/consent.service";
import { RouteContentData } from "../../resolvers/content.resolver";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { SpotEditDetailsComponent } from "../spot-edit-details/spot-edit-details.component";
import { Timestamp } from "firebase/firestore";
import { SpotEdit } from "../../../db/models/SpotEdit";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { MatSidenavModule } from "@angular/material/sidenav";
import { ResponsiveService } from "../../services/responsive.service";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";
import { ChipSelectComponent } from "../chip-select/chip-select.component";
import { StructuredDataService } from "../../services/structured-data.service";

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
    MatProgressBarModule,
    SearchFieldComponent,
    ChallengeDetailComponent,
    // SpeedDialFabComponent,
    RouterLink,
    ChallengeListComponent,
    // PrimaryInfoPanelComponent,
    AsyncPipe,
    SpotEditDetailsComponent,
    MatSidenavModule,
    NgTemplateOutlet,
    BottomSheetComponent,
  ],
})
export class MapPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("spotMap", { static: false }) spotMap: SpotMapComponent | null =
    null;

  pendingTasks = inject(PendingTasks);
  responsiveService = inject(ResponsiveService);
  private _structuredDataService = inject(StructuredDataService);

  selectedSpot: WritableSignal<Spot | LocalSpot | null> = signal(null);
  selectedSpotIdOrSlug: WritableSignal<SpotId | string | null> = signal(null);
  showAllChallenges: WritableSignal<boolean> = signal(false);
  allSpotChallenges: WritableSignal<SpotChallenge[]> = signal([]);
  showSpotEditHistory: WritableSignal<boolean> = signal(false);

  isEditing: WritableSignal<boolean> = signal(false);
  mapStyle: "roadmap" | "satellite" | null = null;
  selectedChallenge: WritableSignal<SpotChallenge | LocalSpotChallenge | null> =
    signal(null);

  askedGeoPermission: boolean = false;
  hasGeolocation: boolean = false;

  visibleSpots: Spot[] = [];
  private _highlightedSpots: SpotPreviewData[] = [];

  /**
   * Highlighted spots shown on the map. Setting this also updates
   * structured data for SEO.
   */
  get highlightedSpots(): SpotPreviewData[] {
    return this._highlightedSpots;
  }
  set highlightedSpots(spots: SpotPreviewData[]) {
    this._highlightedSpots = spots;
    this._updateHighlightedSpotsStructuredData(spots);
  }

  alainMode: boolean = false;

  isServer: boolean;

  showAmenities = signal<boolean>(true);
  bottomSheetOpen = signal<boolean>(false);
  bottomSheetProgress = signal<number>(0);

  sidenavOpen = signal<boolean>(true);

  filterCtrl = new FormControl<string[]>([], { nonNullable: true });
  selectedFilters = signal<string[]>([]);

  toggleSidenav() {
    this.sidenavOpen.update((open) => !open);
  }

  private _alainModeSubscription?: Subscription;
  private _routerSubscription?: Subscription;

  spotEdits: WritableSignal<SpotEdit[]> = signal([]);

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    @Inject(PLATFORM_ID) private platformId: Object,
    public activatedRoute: ActivatedRoute,
    public authService: AuthenticationService,
    public mapsService: MapsApiService,
    public storageService: StorageService,
    private metaTagService: MetaTagService,
    private _spotsService: SpotsService,
    private _challengesService: SpotChallengesService,
    private _searchService: SearchService,
    private _slugsService: SlugsService,
    private router: Router,
    private _snackbar: MatSnackBar,
    private titleService: Title,
    private _consentService: ConsentService,
    private breakpointObserver: BreakpointObserver,
    private _spotEditsService: SpotEditsService
  ) {
    this._alainModeSubscription = GlobalVariables.alainMode.subscribe(
      (value) => {
        this.alainMode = value;
      }
    );

    this.isServer = isPlatformServer(platformId);

    effect(() => {
      // Read all relevant routing state signals so URL stays in sync
      this.selectedSpot();
      this.selectedChallenge();
      this.showAllChallenges();
      this.showSpotEditHistory();

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

    // Effect to update meta tags when spot/challenge changes (for client-side navigation)
    effect(() => {
      const spot = this.selectedSpot();
      const challenge = this.selectedChallenge();

      if (challenge && challenge instanceof SpotChallenge) {
        this.metaTagService.setChallengeMetaTags(challenge);
      } else if (spot) {
        this.metaTagService.setSpotMetaTags(spot);
      } else {
        this.metaTagService.setDefaultMapMetaTags();
      }
    });

    // Effect to load spot edits when showSpotEditHistory changes
    effect(() => {
      const showEditHistory = this.showSpotEditHistory();
      const spot = this.selectedSpot();

      if (showEditHistory && spot instanceof Spot) {
        // Load edits for this spot
        this._spotEditsService.getSpotEditsBySpotId$(spot.id).subscribe({
          next: (editsWithIds) => {
            // Convert to SpotEdit instances with proper IDs
            let spotEdits = editsWithIds.map(
              (item) => new SpotEdit(item.id, item.schema)
            );
            // Sort by timestamp descending (newest first)
            spotEdits.sort((a, b) => {
              const timeA =
                a.timestamp instanceof Timestamp ? a.timestamp.toMillis() : 0;
              const timeB =
                b.timestamp instanceof Timestamp ? b.timestamp.toMillis() : 0;
              return timeB - timeA;
            });
            this.spotEdits.set(spotEdits);
            console.log("Loaded spot edits:", spotEdits);
          },
          error: (err) => {
            console.error("Error loading spot edits:", err);
            this.spotEdits.set([]);
          },
        });
      } else {
        // Clear edits if not showing edit history
        this.spotEdits.set([]);
      }
    });
  }

  /**
   * Get a nice display text for the source field
   */
  getSourceDisplayText(source: string | undefined): string {
    const earlyPKSpotSource = $localize`:@@map.spot.source.earlyPKSpot:Early PK Spot Community Contribution`;
    if (!source) {
      return earlyPKSpotSource;
    }

    // Map specific sources to nice display names
    const sourceMap: Record<string, string> = {
      "horizn-app": "Horizn Community",
      pkspot: "PK Spot Community",
    };

    return sourceMap[source] || source;
  }

  spotSourceDisplayText = computed(() => {
    const spot = this.selectedSpot();
    if (!spot) return "";
    return this.getSourceDisplayText(spot.source());
  });

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
      console.debug(
        "[dbg] setVisibleSpots -> empty (prev length)",
        this.visibleSpots?.length
      );
      this.visibleSpots = [];
      return;
    }

    console.debug(
      "[dbg] setVisibleSpots -> prev length",
      this.visibleSpots?.length,
      "new length",
      spots.length,
      new Error().stack
    );
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

    // Trigger Google Maps API loading since this page needs it
    // this.tryLoadMapsApi(); // TODO wtf

    // Listen for consent changes to retry Maps API loading when consent is granted
    this._consentService.consentGranted$.subscribe((hasConsent) => {
      if (hasConsent && !this.mapsService.isApiLoaded()) {
        this.tryLoadMapsApi();
      }
    });

    // Check if we have resolved data from the resolver
    const contentData = this.activatedRoute.snapshot.data?.["content"] as
      | RouteContentData
      | undefined;

    if (contentData?.spot) {
      console.log("Using resolved spot data for SSR", contentData.spot.name());
      this.selectedSpot.set(contentData.spot);
    }

    if (contentData?.challenge) {
      console.log(
        "Using resolved challenge data for SSR",
        contentData.challenge.name()
      );
      this.selectedChallenge.set(contentData.challenge);
    }

    // Parse URL to handle the edits route correctly since Angular router
    // might interpret /map/:spot/edits as /map/:spot where :spot="edits"
    const urlParts = this.router.url.split("/").filter((segment) => segment);
    // urlParts will be like ['map', 'spotId', 'edits'] or ['map', 'spotId', 'c', 'challengeId']

    let spotIdOrSlug: string | null = null;
    let showChallenges = false;
    let challengeId: string | null = null;
    let showEditHistory = false;

    if (urlParts.length >= 2 && urlParts[0] === "map") {
      const potentialSpot = decodeURIComponent(urlParts[1]);

      if (urlParts.length === 2) {
        // /map/:spot
        spotIdOrSlug = potentialSpot;
      } else if (urlParts.length >= 3) {
        const nextSegment = urlParts[2].split("?")[0];

        if (nextSegment === "c") {
          // /map/:spot/c or /map/:spot/c/:challenge
          spotIdOrSlug = potentialSpot;
          showChallenges = true;
          if (urlParts.length >= 4) {
            challengeId = decodeURIComponent(urlParts[3].split("?")[0]);
          }
        } else if (nextSegment === "edits") {
          // /map/:spot/edits
          spotIdOrSlug = potentialSpot;
          showEditHistory = true;
        } else {
          // Might be /map/:spot where :spot is actually a multi-part ID like "edits"
          // Check if the potential spot looks like a real spot ID (not a known reserved word)
          spotIdOrSlug = potentialSpot;
        }
      }
    }

    console.log("DEBUG ngOnInit URL parsing:", {
      url: this.router.url,
      urlParts,
      spotIdOrSlug,
      showChallenges,
      challengeId,
      showEditHistory,
    });

    this.pendingTasks.run(async () => {
      this._handleURLParamsChange(
        spotIdOrSlug,
        showChallenges,
        challengeId,
        showEditHistory,
        contentData?.spot || null,
        contentData?.challenge || null
      );
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
            /^\/map(?:\/([^\/]+))?(?:\/(c)(?:\/([^\/]+))?)?(\/(edits)(?:\/)?)?/
          );
          const spotIdOrSlug = match?.[1] ?? null;
          const showChallenges = !!match?.[2];
          const challengeId = match?.[3] ?? null;
          const showEditHistory = !!match?.[4];

          this._handleURLParamsChange(
            spotIdOrSlug,
            showChallenges,
            challengeId,
            showEditHistory
          );
        });
    }
  }

  _handleURLParamsChange(
    spotIdOrSlug: string | null,
    showChallenges: boolean,
    challengeId: string | null,
    showEditHistory: boolean,
    resolvedSpot: Spot | null = null,
    resolvedChallenge: SpotChallenge | null = null
  ) {
    if (challengeId && spotIdOrSlug) {
      // open the spot on a challenge
      if (resolvedChallenge) {
        // Use resolved challenge data
        this.selectChallenge(resolvedChallenge, false);
      } else {
        // Load challenge dynamically
        const selectedSpot = this.selectedSpot();
        if (selectedSpot && selectedSpot instanceof Spot) {
          this.loadChallengeById(selectedSpot, challengeId, false).then(
            () => {}
          );
        } else if (!selectedSpot) {
          // load the spot by id then the challenge
        } else {
          // the spot is a local spot
          console.error(
            "Cannot open a challenge of a local spot, it should not have one!"
          );
        }
      }
    } else if (spotIdOrSlug) {
      if (this.selectedChallenge()) this.closeChallenge();
      this.showAllChallenges.set(showChallenges);
      this.showSpotEditHistory.set(showEditHistory);

      // If we already have the resolved spot, use it
      if (resolvedSpot && this.selectedSpot() !== resolvedSpot) {
        this.selectSpot(resolvedSpot, false);
      } else if (this.selectedSpotIdOrSlug() !== spotIdOrSlug) {
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
    console.log("[DEBUG openGooglePlaceById] Opening place with id:", id);
    this.mapsService
      .getGooglePlaceById(id)
      .then((place) => {
        console.log("[DEBUG openGooglePlaceById] Got place:", place);
        if (!place?.location) {
          console.warn("[DEBUG openGooglePlaceById] No location found");
          return;
        }

        // Try to use viewport bounds if available (preferred for proper framing)
        const viewport = (place as any).viewport as
          | google.maps.LatLngBounds
          | undefined;
        if (viewport) {
          console.log(
            "[DEBUG openGooglePlaceById] Using viewport bounds for place"
          );
          this.spotMap?.focusBounds(viewport);
          return;
        }

        // Fallback: Calculate appropriate zoom based on place type
        const zoomLevel = this.mapsService.getZoomForPlaceType(place);
        console.log(
          "[DEBUG openGooglePlaceById] Calculated zoom level:",
          zoomLevel
        );

        // Convert LatLng to LatLngLiteral - location is a LatLng object with functions
        const lat = (place.location as any).lat();
        const lng = (place.location as any).lng();
        const locationLiteral: google.maps.LatLngLiteral = { lat, lng };
        console.log(
          "[DEBUG openGooglePlaceById] Location literal:",
          locationLiteral
        );
        console.log("[DEBUG openGooglePlaceById] spotMap:", this.spotMap);
        this.spotMap?.focusPoint(locationLiteral, zoomLevel);
      })
      .catch((err) => {
        console.error("[DEBUG openGooglePlaceById] Error fetching place:", err);
      });
  }

  async loadSpotById(spotId: SpotId, updateUrl: boolean = true): Promise<Spot> {
    console.debug("loading spot by id", spotId);

    // Retry loading the spot if it's not yet populated by the cloud function
    let lastError: any;
    const maxAttempts = 15;
    const delayMs = 200;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const spot: Spot = await this._spotsService.getSpotByIdHttp(
          spotId,
          this.locale
        );
        this.selectSpot(spot, updateUrl);
        return spot;
      } catch (error) {
        lastError = error;
        console.debug(
          `Attempt ${
            attempt + 1
          }/${maxAttempts} to load spot failed, retrying...`,
          error
        );

        // Wait before next attempt
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All attempts failed
    console.error("Failed to load spot after retries:", lastError);
    throw lastError;
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
    const showEditHistory = this.showSpotEditHistory();

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
        : selectedSpot && selectedSpot instanceof Spot && showEditHistory
        ? ["/map", selectedSpot.slug ?? selectedSpot.id, "edits"]
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
    // console.debug("selecting spot", spot);
    if (!spot) {
      this.closeSpot(updateUrl);
    } else {
      this.closeChallenge(false);
      this.selectedSpot.set(spot);
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
      this.showSpotEditHistory.set(false);
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
    this.selectedSpot.set(null);
    this.showSpotEditHistory.set(false);
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

  private tryLoadMapsApi() {
    if (!this.mapsService.isApiLoaded()) {
      this.mapsService.loadGoogleMapsApi();
    }
  }

  /**
   * Updates the structured data for highlighted spots when they change.
   * This helps search engines understand the notable parkour spots in the area.
   */
  private _updateHighlightedSpotsStructuredData(spots: SpotPreviewData[]) {
    if (spots.length > 0) {
      const itemList = this._structuredDataService.generateSpotItemList(
        spots,
        $localize`:@@map.highlighted_spots.structured_data_name:Featured Parkour Spots`
      );
      this._structuredDataService.addStructuredData(
        "highlighted-spots",
        itemList
      );
    } else {
      this._structuredDataService.removeStructuredData("highlighted-spots");
    }
  }

  ngOnDestroy() {
    console.debug("destroying map page");
    this.closeSpot();
    this._routerSubscription?.unsubscribe();
    this._alainModeSubscription?.unsubscribe();
    this._structuredDataService.removeStructuredData("highlighted-spots");
  }
}
