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
} from "@angular/core";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
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
  filter,
  firstValueFrom,
  Subscription,
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

@Component({
  selector: "app-map-page",
  templateUrl: "./map-page.component.html",
  styleUrls: ["./map-page.component.scss"],
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
    SpeedDialFabComponent,
  ],
})
export class MapPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("spotMap", { static: false }) spotMap: SpotMapComponent | null =
    null;
  @ViewChild("bottomSheet") bottomSheet: BottomSheetComponent | undefined;

  selectedSpot: WritableSignal<Spot | LocalSpot | null> = signal(null);
  isEditing: boolean = false;
  mapStyle: "roadmap" | "satellite" | null = null;

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
    @Inject(PLATFORM_ID) platformId: Object,
    public route: ActivatedRoute,
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
    this._getSpotIdFromRoute()
      .then((spotId) => {
        if (spotId) {
          console.log("got spotId from route", spotId, "loading now");
          return this.loadSpotById(spotId);
        }
        return Promise.resolve();
      })
      .then(() => {})
      .catch((err) => {
        console.error("Error opening spot", err);
      });
  }

  async ngAfterViewInit() {
    // if (!this.spotMap) {
    //   // wait 200ms then try again
    //   setTimeout(() => {
    //     this.ngAfterViewInit();
    //   }, 2000);
    //   return;
    // }

    // subscribe to changes of the route
    this._routerSubscription = this.router.events
      .pipe(
        filter((event) => {
          return event instanceof NavigationEnd;
        })
      )
      .subscribe(async (event: NavigationEnd) => {
        this._getSpotIdFromRoute()
          .then((spotId) => {
            if (spotId) return this.loadSpotById(spotId); // TODO out of context
          })
          .then(() => {});
      });
  }

  async _getSpotIdFromRoute(): Promise<SpotId | void> {
    let spotIdOrSlug: SpotId | SpotSlug = this.route.snapshot.paramMap.get(
      "spot"
    ) as SpotId | SpotSlug;

    if (["null", "undefined"].includes(spotIdOrSlug as string)) return;

    if (!spotIdOrSlug && this.route.snapshot.queryParamMap.keys.length > 0) {
      spotIdOrSlug = (this.route.snapshot.queryParamMap.get("id") ??
        this.route.snapshot.queryParamMap.get("spot") ??
        this.route.snapshot.queryParamMap.get("spotId") ??
        this.route.snapshot.queryParamMap.get("slug") ??
        "") as SpotId | SpotSlug;
    }

    if (spotIdOrSlug) {
      // first search for possible slugs
      let spotId: SpotId = "" as SpotId;
      try {
        spotId = await this._slugsService.getSpotIdFromSpotSlugHttp(
          spotIdOrSlug as SpotSlug
        );
      } catch (e) {
        // ignore error
      } finally {
        if (!spotId) spotId = spotIdOrSlug as SpotId;

        return spotId;
      }
    }
  }

  openSpotOrGooglePlace(value: { type: "place" | "spot"; id: string }) {
    if (value.type === "place") {
      this.openGooglePlaceById(value.id);
    } else {
      this.loadSpotById(value.id as SpotId);
    }
  }

  openGooglePlaceById(id: string) {
    this.mapsService.getGooglePlaceById(id).then((place) => {
      if (!place?.geometry?.viewport) return;
      this.spotMap?.focusBounds(place.geometry.viewport);
    });
  }

  loadSpotById(spotId: SpotId) {
    this._spotsService.getSpotByIdHttp(spotId, this.locale).then((spot) => {
      if (!spot) return;
      this.selectedSpot.set(spot);
      this.setSpotMetaTags();
      this.spotMap?.focusSpot(spot);
      this.updateMapURL();
      console.log("is selected spot now");
    });
  }

  updateMapURL() {
    if (this.selectedSpot && this.selectedSpot instanceof Spot) {
      this.location.go(`/map/${this.selectedSpot.id}`);
    } else {
      this.location.go(`/map`);
    }
  }

  setSpotMetaTags() {
    const spot = this.selectedSpot();

    if (spot === null) {
      this.clearTitleAndMetaTags();
      return;
    }

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
    this._routerSubscription?.unsubscribe();
    this._alainModeSubscription?.unsubscribe();
  }
}
