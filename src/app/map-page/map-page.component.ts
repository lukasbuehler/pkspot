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
  Location,
  NgIf,
  NgFor,
  AsyncPipe,
  isPlatformServer,
  isPlatformBrowser,
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
    BottomSheetComponent,
    MatDividerModule,
    MatTooltipModule,
    SearchFieldComponent,
    ChallengeDetailComponent,
    // SpeedDialFabComponent,
  ],
})
export class MapPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("spotMap", { static: false }) spotMap: SpotMapComponent | null =
    null;
  @ViewChild("bottomSheet") bottomSheet: BottomSheetComponent | undefined;

  pendingTasks = inject(PendingTasks);

  selectedSpot: WritableSignal<Spot | LocalSpot | null> = signal(null);
  isEditing: boolean = false;
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
    private _searchService: SearchService,
    private _slugsService: SlugsService,
    private router: Router,
    private location: Location,
    private _snackbar: MatSnackBar,
    private titleService: Title
  ) {
    this._alainModeSubscription = GlobalVariables.alainMode.subscribe(
      (value) => {
        this.alainMode = value;
      }
    );

    this.isServer = isPlatformServer(platformId);

    this.titleService.setTitle($localize`:@@pk.spotmap.title:PK Spot map`);

    effect(() => {
      const selectedSpot = this.selectedSpot();
      const challenge = this.selectedChallenge();

      if (!selectedSpot || !(selectedSpot instanceof Spot)) return;

      console.debug("updating URL for challenge");

      if (challenge && challenge instanceof SpotChallenge) {
        this.location.go(
          [
            "/map",
            selectedSpot.slug ?? selectedSpot.id,
            "c",
            challenge.id,
          ].join("/")
        );
      } else {
        this.location.go(
          ["/map", selectedSpot.slug ?? selectedSpot.id].join("/")
        );
      }
    });
  }

  // Speed dial FAB //////////////////////////////////////////////////////////

  speedDialButtonConfig: SpeedDialFabButtonConfig = {
    mainButton: {
      icon: "add_location",
      tooltip: $localize`Add a new spot`,
      color: "primary",
      label: $localize`:@@pk.spotmap.addSpot:Add spot`,
      isExtended: false,
    },
    miniButtonColor: "primary",
    miniButtons: [
      {
        icon: "outlined_flag",
        tooltip: $localize`Add a challenge`,
      },
      {
        icon: "note_add",
        tooltip: $localize`Import spots from a file`,
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
    this.pendingTasks.run(async () => {
      const spotIdOrSlug = this.activatedRoute.snapshot.paramMap.get("spot");

      console.log("spotIdOrSlug", spotIdOrSlug);

      if (spotIdOrSlug) {
        const spotId = await this._getSpotIdFromSlugOrId(spotIdOrSlug);

        console.log("spotId", spotId);

        if (spotId) {
          await this.loadSpotById(spotId as SpotId);
        }
      }
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
      // after the first load
      this._routerSubscription = this.activatedRoute.paramMap
        .pipe(
          switchMap(async (params: ParamMap) => {
            const spotIdOrSlug = params.get("spot") ?? "";

            if (!spotIdOrSlug) {
              return EMPTY;
            }
            const spotId = await this._getSpotIdFromSlugOrId(spotIdOrSlug);

            if (spotId) {
              return spotId;
            } else {
              return EMPTY;
            }
          })
        )
        .subscribe((spotId) => {
          if (spotId) {
            this.loadSpotById(spotId as SpotId).then(() => {});
          } else {
            this.closeSpot();
          }
        });
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

  async loadSpotById(spotId: SpotId) {
    console.debug("loading spot by id", spotId);
    const spot: Spot = await this._spotsService.getSpotByIdHttp(
      spotId,
      this.locale
    );
    this.selectSpot(spot);
  }

  updateMapURL() {
    const selectedSpot = this.selectedSpot();
    if (selectedSpot && selectedSpot instanceof Spot) {
      this.location.go(
        ["/map", selectedSpot.slug ?? selectedSpot.id].join("/")
      );
    } else {
      this.location.go(["/map"].join("/"));
    }
  }

  selectSpot(spot: Spot | LocalSpot | null) {
    // console.debug("selecting spot", spot);
    if (!spot) {
      this.closeSpot();
    } else {
      this.selectedSpot.set(spot);
      this.setSpotMetaTags();
      this.spotMap?.focusSpot(spot);

      if (spot instanceof Spot) {
        this.updateMapURL();
      }
    }
  }

  closeSpot() {
    this.clearTitleAndMetaTags();
    this.selectedSpot.set(null);
    this.updateMapURL();
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
    this.titleService.setTitle($localize`:@@pk.spotmap.title:PK Spot map`);
  }

  ngOnDestroy() {
    console.debug("destroying map page");
    this.closeSpot();
    this._routerSubscription?.unsubscribe();
    this._alainModeSubscription?.unsubscribe();
  }
}
