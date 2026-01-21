import { STEPPER_GLOBAL_OPTIONS } from "@angular/cdk/stepper";
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Inject,
  LOCALE_ID,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import {
  MatStepper,
  MatStepperIcon,
  MatStep,
  MatStepLabel,
  MatStepperPrevious,
} from "@angular/material/stepper";
import {
  KmlParserService,
  KMLSetupInfo,
  KMLSpot,
} from "../../services/kml-parser.service";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  SpotTypes,
  SpotTypesIcons,
  SpotTypesNames,
} from "../../../db/schemas/SpotTypeAndAccess";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import {
  filter,
  first,
  firstValueFrom,
  map,
  Observable,
  startWith,
} from "rxjs";
import {
  MyRegex,
  RegexInputComponent,
} from "../regex-input/regex-input.component";
import { LocalSpot } from "../../../db/models/Spot";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { GeoPoint } from "firebase/firestore";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { ResponsiveService } from "../../services/responsive.service";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from "@angular/material/expansion";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { MatOption } from "@angular/material/core";
import {
  MatAutocompleteTrigger,
  MatAutocomplete,
} from "@angular/material/autocomplete";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel, MatHint } from "@angular/material/form-field";
import { AsyncPipe, KeyValuePipe } from "@angular/common";
import { MatButton } from "@angular/material/button";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MatIcon, MatIconModule } from "@angular/material/icon";
import { MatSelect } from "@angular/material/select";
import { locale } from "core-js";
import { LocaleCode } from "../../../db/models/Interfaces";
import { SpotSchema } from "../../../db/schemas/SpotSchema";
import { MarkerSchema } from "../marker/marker.component";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { createUserReference } from "../../../scripts/Helpers";
import { languageCodes } from "../../../scripts/Languages";
import JSZip from "jszip";
import { MapsApiService } from "../../services/maps-api.service";

@Component({
  selector: "app-kml-import-page",
  templateUrl: "./kml-import-page.component.html",
  styleUrls: ["./kml-import-page.component.scss"],
  providers: [
    {
      provide: STEPPER_GLOBAL_OPTIONS,
      useValue: { displayDefaultIndicatorType: false },
    },
  ],
  imports: [
    MatStepper,
    MatStepperIcon,
    MatIcon,
    MatStep,
    MatStepLabel,
    FormsModule,
    ReactiveFormsModule,
    MediaUpload,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatAutocompleteTrigger,
    MatAutocomplete,
    MatOption,
    MatIconModule,
    MatSlideToggle,
    RegexInputComponent,
    MatHint,
    MatCheckbox,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    SpotMapComponent,
    MatStepperPrevious,
    AsyncPipe,
    MatSelect,
    KeyValuePipe,
    MatProgressSpinnerModule,
  ],
})
export class KmlImportPageComponent implements OnInit, AfterViewInit {
  readonly responsive = inject(ResponsiveService);
  @ViewChild("stepperHorizontal") stepperHorizontal: MatStepper | undefined;
  @ViewChild("spotMap") spotMap: SpotMapComponent | undefined;
  @ViewChild("regex") regex: RegexInputComponent | undefined;

  uploadFormGroup?: UntypedFormGroup;
  setupFormGroup?: UntypedFormGroup;

  kmlUploadFile: File | null = null;

  // Expose to template
  readonly SpotTypes = SpotTypes;
  readonly spotTypesNames = SpotTypesNames;
  readonly spotTypesIcons = SpotTypesIcons;
  readonly languages = languageCodes;

  selectedSpot = signal<KMLSpot | null>(null);

  selectedVerificationSpot = computed(() => {
    const s = this.selectedSpot();
    if (!s) return null;
    return this.kmlSpotToLocalSpot(s);
  });

  polygons = computed<PolygonSchema[]>(() => {
    const spot = this.selectedSpot();
    if (!spot || !spot.paths) return [];

    const p = spot.paths.get(0)!;
    return [
      {
        paths: [p],
        strokeColor: "#FF0000",
        fillColor: "#FF0000",
        fillOpacity: 0.35,
        strokeWeight: 2,
      },
    ] as any as PolygonSchema[];
  });

  importedSpotsBounds = computed<google.maps.LatLngBoundsLiteral | null>(() => {
    const spots = this.spotsToImport();
    if (!spots || spots.length === 0) return null;

    const bounds = new google.maps.LatLngBounds();
    spots.forEach((s) => bounds.extend(s.spot.location));
    return bounds.toJSON();
  });

  displayFn(lang: LocaleCode): string {
    return (
      (lang && languageCodes[lang] && languageCodes[lang].name_native) || ""
    );
  }

  spotsToImport = toSignal(this.kmlParserService.spotsToImport$, {
    initialValue: [],
  });

  // languages: LocaleCode[] = Object.keys(languageCodes); // Removed duplicate
  filteredLanguages: Observable<LocaleCode[]> | undefined;

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    public kmlParserService: KmlParserService,
    private _formBuilder: UntypedFormBuilder,
    private _spotEditsService: SpotEditsService,
    private _authService: AuthenticationService,
    private cdr: ChangeDetectorRef,
    private _mapsApiService: MapsApiService
  ) {}

  ngOnInit(): void {
    this.uploadFormGroup = this._formBuilder.group({
      uploadCtrl: ["", Validators.required],
    });
    this.setupFormGroup = this._formBuilder.group({
      setupLangCtrl: ["", Validators.required],
      setupRegexCtrl: [{ value: "", disabled: true }, []],
    });

    // Ensure Google Maps API is loaded for the map component
    this._mapsApiService.loadGoogleMapsApi();

    this.filteredLanguages = this.setupFormGroup
      ?.get("setupLangCtrl")
      ?.valueChanges.pipe(
        startWith(""),
        map((value) => this._filterLanguages(value || ""))
      );
  }

  private _filterLanguages(value: string): LocaleCode[] {
    const filterValue = value.toLowerCase();
    return (Object.keys(this.languages) as LocaleCode[]).filter(
      (lang) =>
        this.languages[lang].name_native?.toLowerCase().includes(filterValue) ||
        this.languages[lang].name_english.toLowerCase().includes(filterValue) ||
        lang.toLowerCase().includes(filterValue)
    );
  }

  regexEnabled: boolean = false;
  regexValue: RegExp | null = null;

  setRegexEnabled(enabled: boolean) {
    if (!this.kmlParserService.setupInfo) {
      console.error("setupInfo is invalid");
      return;
    }

    this.regexEnabled = enabled;

    const control = this.setupFormGroup?.get("setupRegexCtrl");

    if (!enabled) {
      this.kmlParserService.setupInfo.regex = null;
      control?.disable();
    } else {
      this.kmlParserService.setupInfo.regex = this.regexValue;
      control?.enable();
    }
  }

  updateRegex(regex: MyRegex) {
    this.regexValue = new RegExp(regex.regularExpression);
    if (!this.kmlParserService.setupInfo) {
      console.error("setupInfo is invalid");
      return;
    }

    if (this.regexEnabled)
      this.kmlParserService.setupInfo.regex = this.regexValue;
  }

  ngAfterViewInit(): void {}

  onUploadMediaSelect(file: File) {
    this.kmlUploadFile = file;
  }

  getSpotLocations(spots: KMLSpot[]): google.maps.LatLngLiteral[] {
    return spots.map((spot) => spot.spot.location);
  }

  getSpotMarkers(spots: KMLSpot[] | null): MarkerSchema[] {
    if (!spots) return [];

    const selected = this.selectedVerificationSpot();

    return this.spotsToImport()
      .filter((spot) => {
        if (!selected) return true;
        // Don't show marker for the selected spot (it has its own marker)
        // Use small epsilon for float comparison or just exact since they come from same source
        return (
          spot.spot.location.lat !== selected.location().lat ||
          spot.spot.location.lng !== selected.location().lng
        );
      })
      .map((spot) => {
        // Use location_on icon for priority markers
        return {
          color: "tertiary",
          location: spot.spot.location,
          icons: ["location_on"],
          priority: 100000,
        };
      });
  }

  get totalBounds() {
    return this.importedSpotsBounds;
  }

  kmlSpotToLocalSpot(kmlSpot: KMLSpot | null | undefined): LocalSpot | null {
    if (!kmlSpot) return null;
    let type = this.getSpotType(kmlSpot);

    let localSpot = new LocalSpot(
      {
        name: { [kmlSpot.language]: kmlSpot.spot.name },
        location: new GeoPoint(
          kmlSpot.spot.location.lat,
          kmlSpot.spot.location.lng
        ),
        address: null,
        type: type,
      },
      kmlSpot.language
    );
    return localSpot;
  }

  getSpotType(kmlSpot: KMLSpot): SpotTypes {
    const folderInfo = this.kmlParserService.setupInfo?.folders.find(
      (f) => f.name === kmlSpot.folder
    );

    if (folderInfo && folderInfo.type && folderInfo.type !== SpotTypes.Other) {
      return folderInfo.type;
    }
    return this.getSpotTypeFromName(kmlSpot.spot.name);
  }

  getSpotTypeFromName(name?: string): SpotTypes {
    if (!name) return SpotTypes.Other;
    const lower = name.toLowerCase();

    if (
      lower.includes("gym") ||
      lower.includes("gimnasio") ||
      lower.includes("turnhalle")
    )
      return SpotTypes.ParkourGym;
    if (lower.includes("parkour park") || lower.includes("pk park"))
      return SpotTypes.PkPark;
    if (
      lower.includes("playground") ||
      lower.includes("spielplatz") ||
      lower.includes("parque infantil")
    )
      return SpotTypes.Playground;
    if (
      lower.includes("school") ||
      lower.includes("schule") ||
      lower.includes("escuela") ||
      lower.includes("college") ||
      lower.includes("university") ||
      lower.includes("campus")
    )
      return SpotTypes.School; // Broad mapping for education
    if (
      lower.includes("park") ||
      lower.includes("parque") ||
      lower.includes("garden")
    )
      return SpotTypes.Park; // Generic park
    if (
      lower.includes("wall") ||
      lower.includes("muro") ||
      lower.includes("rail") ||
      lower.includes("valla")
    )
      return SpotTypes.UrbanLandscape;
    if (
      lower.includes("nature") ||
      lower.includes("naturaleza") ||
      lower.includes("rock") ||
      lower.includes("roca") ||
      lower.includes("tree")
    )
      return SpotTypes.NaturalLandscape;
    if (
      lower.includes("water") ||
      lower.includes("agua") ||
      lower.includes("fountain") ||
      lower.includes("fuente")
    )
      return SpotTypes.Water;
    if (
      lower.includes("monument") ||
      lower.includes("monumento") ||
      lower.includes("statue")
    )
      return SpotTypes.Monument;
    if (lower.includes("skate")) return SpotTypes.SkatePark;
    if (lower.includes("roof")) return SpotTypes.Rooftop;
    if (lower.includes("calisthenic") || lower.includes("workout"))
      return SpotTypes.Calisthenics;

    return SpotTypes.Other;
  }

  continueToSetup() {
    if (!this.kmlUploadFile) {
      // the file doesn't exist
      console.error("The KML file was not set properly or is invalid!");
      return;
    }

    const fileExtension = this.kmlUploadFile.name
      .split(".")
      .pop()
      ?.toLowerCase();

    if (fileExtension === "kmz") {
      const zip = new JSZip();
      zip.loadAsync(this.kmlUploadFile).then(
        (zipContents) => {
          // Find the first .kml file
          const kmlFilename = Object.keys(zipContents.files).find((filename) =>
            filename.toLowerCase().endsWith(".kml")
          );

          if (kmlFilename) {
            zipContents.files[kmlFilename].async("string").then((data) => {
              this.parseKmlString(data);
            });
          } else {
            console.error("No KML file found inside KMZ!");
            // Handle error
          }
        },
        (err) => {
          console.error("Error reading KMZ:", err);
        }
      );
    } else {
      this.kmlUploadFile.text().then((data) => {
        this.parseKmlString(data);
      });
    }
  }

  parseKmlString(data: string) {
    this.kmlParserService.parseKMLFromString(data).then(
      () => {
        if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
          console.error("stepperHorizontal is not defined");
          return;
        }

        // Pre-calculate spot types for folders
        if (this.kmlParserService.setupInfo?.folders) {
          this.kmlParserService.setupInfo.folders.forEach((folder) => {
            folder.type = this.getSpotTypeFromName(folder.name);
          });
        }

        // parsing was successful
        this.stepperHorizontal.selected.completed = true;
        this.stepperHorizontal.next();
        //this.cdr.detectChanges();
      },
      (error: any) => {
        // parsing was not successful
        console.error(error);
      }
    );
  }

  continueToVerification() {
    this.kmlParserService.confirmSetup().then(() => {
      if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
        console.error("stepperHorizontal is not defined");
        return;
      }

      this.stepperHorizontal.selected.completed = true;
      this.stepperHorizontal.next();

      firstValueFrom(
        this.kmlParserService.spotsToImport$.pipe(
          filter((spots: KMLSpot[]) => !!spots && spots.length > 0),
          first()
        )
      ).then((spots: KMLSpot[]) => {
        if (spots && spots.length > 0) {
          const nameCounts = new Map<string, number>();

          const spotsToImport = spots; // Use the 'spots' from the observable
          console.log("Importing spots", spotsToImport);

          spotsToImport.forEach((spot) => {
            let name = spot.spot.name.trim(); // Ensure we check trimmed names
            if (nameCounts.has(name)) {
              const count = nameCounts.get(name)! + 1;
              nameCounts.set(name, count);
              spot.spot.name = `${name} ${count}`; // Changed from (${count}) to ${count}
            } else {
              nameCounts.set(name, 1);
              spot.spot.name = name; // Ensure the spot name is trimmed
            }
          });

          if (!this.selectedSpot()) {
            this.selectedSpot.set(spots[0]);
            // console.log("Selected spot: ", this.selectedVerificationSpot);
          }
        }
      });

      this.cdr.detectChanges();
    });
  }

  goBack() {
    if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
      console.error("stepperHorizontal is not defined");
      return;
    }

    this.stepperHorizontal.previous();
  }

  /**
   * Import the spots into the database
   */
  importSpots() {
    if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
      console.error("stepperHorizontal is not defined");
      return;
    }

    this.stepperHorizontal.selected.completed = true;
    this.stepperHorizontal.next();

    firstValueFrom(this.kmlParserService.spotsToImport$).then((kmlSpots) => {
      // Check if user is authenticated
      if (!this._authService.isSignedIn || !this._authService.user.uid) {
        console.error("User must be authenticated to import spots");
        this._spotImportFailed();
        return;
      }

      // Create user reference for the edits
      const userReference = createUserReference(this._authService.user.data!);

      // Create spot edits for each KML spot
      const spotEditPromises = (kmlSpots as KMLSpot[]).map(
        (kmlSpot: KMLSpot) => {
          let location = new GeoPoint(
            kmlSpot.spot.location.lat,
            kmlSpot.spot.location.lng
          );

          let bounds: GeoPoint[] | undefined = undefined;
          if (kmlSpot.spot.bounds) {
            bounds = kmlSpot.spot.bounds.map((b) => new GeoPoint(b.lat, b.lng));
          }

          let type: SpotTypes = SpotTypes.Other;
          const folderInfo = this.kmlParserService.setupInfo?.folders.find(
            (f) => f.name === kmlSpot.folder
          );

          if (
            folderInfo &&
            folderInfo.type &&
            folderInfo.type !== SpotTypes.Other
          ) {
            type = folderInfo.type;
          } else {
            type = this.getSpotTypeFromName(kmlSpot.spot.name);
          }

          const spot = new LocalSpot(
            {
              name: { [this.locale]: kmlSpot.spot.name.trim() },
              location: location,
              bounds: bounds,

              address: null,
              type: type,
            },
            this.locale
          );

          // Create a new spot with edit (server-side ID generation)
          return this._spotEditsService.createSpotWithEdit(
            spot.data(),
            userReference
          );
        }
      );

      // Wait for all spots to be created
      Promise.all(spotEditPromises).then(
        () => {
          // all spots created successfully
          this._spotImportSuccessful();
        },
        (error) => {
          // spot creation failed
          console.error("Failed to create spots:", error);
          this._spotImportFailed();
        }
      );
    });
  }

  private _spotImportSuccessful() {
    if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
      console.error("stepperHorizontal is not defined");
      return;
    }

    this.stepperHorizontal.selected.completed = true;
    this.stepperHorizontal.next();
  }

  private _spotImportFailed() {
    if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
      console.error("stepperHorizontal is not defined");
      return;
    }

    this.stepperHorizontal.selected.completed = false;
    this.stepperHorizontal.previous();
  }
}
