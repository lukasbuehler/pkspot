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
  KMLImportStats,
  KMLSetupInfo,
  KMLSpot,
} from "../../services/kml-parser.service";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  SpotAccess,
  SpotTypes,
  SpotAccessIcons,
  SpotAccessNames,
  SpotTypesIcons,
  SpotTypesNames,
} from "../../../db/schemas/SpotTypeAndAccess";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import { firstValueFrom, map, Observable, startWith } from "rxjs";
import {
  MyRegex,
  RegexInputComponent,
} from "../regex-input/regex-input.component";
import { LocalSpot } from "../../../db/models/Spot";
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
import { MatButton, MatIconButton } from "@angular/material/button";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MatIcon, MatIconModule } from "@angular/material/icon";
import { MatSelect } from "@angular/material/select";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { MarkerSchema } from "../marker/marker.component";
import { createUserReference, generateUUID } from "../../../scripts/Helpers";
import { languageCodes } from "../../../scripts/Languages";
import JSZip from "jszip";
import { MapsApiService } from "../../services/maps-api.service";
import { AmenitiesMap } from "../../../db/schemas/Amenities";
import { ImportsService } from "../../services/firebase/firestore/imports.service";
import { ImportSchema } from "../../../db/schemas/ImportSchema";
import { StorageService } from "../../services/firebase/storage.service";
import { StorageBucket } from "../../../db/schemas/Media";
import { MatDialog } from "@angular/material/dialog";
import { SpotAmenitiesDialogComponent } from "../spot-amenities-dialog/spot-amenities-dialog.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { ImgCarouselComponent } from "../img-carousel/img-carousel.component";
import { AnyMedia, ExternalImage } from "../../../db/models/Media";

interface VerificationSpotItem {
  spot: KMLSpot;
  include: boolean;
  reason?: "duplicate" | "regex" | "manual";
  folder: string;
  localSpot: LocalSpot;
}

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
    MatIconButton,
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
    SpotPreviewCardComponent,
    ImgCarouselComponent,
  ],
})
export class KmlImportPageComponent implements OnInit, AfterViewInit {
  readonly responsive = inject(ResponsiveService);
  @ViewChild("stepperHorizontal") stepperHorizontal: MatStepper | undefined;
  @ViewChild("spotMap") spotMap: SpotMapComponent | undefined;
  @ViewChild("regex") regex: RegexInputComponent | undefined;

  legalFormGroup?: UntypedFormGroup;
  creditsFormGroup?: UntypedFormGroup;
  uploadFormGroup?: UntypedFormGroup;
  setupFormGroup?: UntypedFormGroup;

  kmlUploadFile: File | null = null;

  // Expose to template
  readonly SpotTypes = SpotTypes;
  readonly SpotAccess = SpotAccess;
  readonly spotTypesNames = SpotTypesNames;
  readonly spotTypesIcons = SpotTypesIcons;
  readonly spotAccessNames = SpotAccessNames;
  readonly spotAccessIcons = SpotAccessIcons;
  readonly languages = languageCodes;

  verificationItems = signal<VerificationSpotItem[]>([]);
  selectedSpot = signal<KMLSpot | null>(null);
  previewMode = signal<"map" | "details">("map");

  includedVerificationItems = computed(() =>
    this.verificationItems().filter((item) => item.include)
  );
  includedSpots = computed(() =>
    this.includedVerificationItems().map((item) => item.spot)
  );
  includedSpotCount = computed(() => this.includedVerificationItems().length);
  totalVerificationCount = computed(() => this.verificationItems().length);

  verificationGroups = computed(() => {
    const items = this.verificationItems();
    const folderOrder = this.kmlParserService.setupInfo?.folders.map(
      (folder) => folder.name
    ) ?? ["Ungrouped"];
    const byFolder = new Map<string, VerificationSpotItem[]>();

    items.forEach((item) => {
      const folder = item.folder || "Ungrouped";
      const group = byFolder.get(folder) ?? [];
      group.push(item);
      byFolder.set(folder, group);
    });

    const groups: {
      folder: string;
      items: VerificationSpotItem[];
      includedCount: number;
    }[] = [];

    folderOrder.forEach((folder) => {
      const groupItems = byFolder.get(folder);
      if (!groupItems || groupItems.length === 0) {
        return;
      }
      groups.push({
        folder,
        items: groupItems.sort(
          (a, b) =>
            (a.spot.importIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.spot.importIndex ?? Number.MAX_SAFE_INTEGER)
        ),
        includedCount: groupItems.filter((item) => item.include).length,
      });
      byFolder.delete(folder);
    });

    Array.from(byFolder.entries()).forEach(([folder, groupItems]) => {
      groups.push({
        folder,
        items: groupItems,
        includedCount: groupItems.filter((item) => item.include).length,
      });
    });

    return groups;
  });

  selectedVerificationSpot = computed(() => {
    const s = this.selectedSpot();
    if (!s) return null;
    const existing = this.verificationItems().find(
      (item) => this._spotKey(item.spot) === this._spotKey(s)
    );
    return existing?.localSpot ?? this.kmlSpotToLocalSpot(s);
  });
  selectedVerificationItem = computed<VerificationSpotItem | null>(() => {
    const selected = this.selectedSpot();
    if (!selected) {
      return null;
    }
    return (
      this.verificationItems().find(
        (item) => this._spotKey(item.spot) === this._spotKey(selected)
      ) ?? null
    );
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
    const spots = this.includedSpots();
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

  selectedSpotMedia = computed<AnyMedia[]>(() => {
    const selected = this.selectedSpot();
    if (!selected?.spot.mediaUrls || selected.spot.mediaUrls.length === 0) {
      return [];
    }
    return selected.spot.mediaUrls.map(
      (url) =>
        new ExternalImage(
          url,
          undefined,
          {
            title: selected.spot.name,
            source_url: url,
            author: this.creditsFormGroup?.get("sourceNameCtrl")?.value,
          },
          "other"
        )
    );
  });

  // languages: LocaleCode[] = Object.keys(languageCodes); // Removed duplicate
  filteredLanguages: Observable<LocaleCode[]> | undefined;

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    public kmlParserService: KmlParserService,
    private _formBuilder: UntypedFormBuilder,
    private _importsService: ImportsService,
    private _storageService: StorageService,
    private _dialog: MatDialog,
    private _authService: AuthenticationService,
    private cdr: ChangeDetectorRef,
    private _mapsApiService: MapsApiService
  ) {}

  ngOnInit(): void {
    this.uploadFormGroup = this._formBuilder.group({
      uploadCtrl: ["", Validators.required],
    });
    this.setupFormGroup = this._formBuilder.group({
      setupLangCtrl: [this.locale, Validators.required],
      setupRegexCtrl: [{ value: "", disabled: true }, []],
    });
    this.legalFormGroup = this._formBuilder.group({
      rightsConfirmedCtrl: [false, Validators.requiredTrue],
      externalImagesRightsConfirmedCtrl: [false],
      allowFutureAutoUpdateCtrl: [false],
    });
    this.creditsFormGroup = this._formBuilder.group({
      sourceNameCtrl: ["", Validators.required],
      importIdCtrl: [""],
      attributionTextCtrl: [""],
      websiteUrlCtrl: [""],
      instagramUrlCtrl: [""],
      licenseCtrl: ["CC BY-NC-SA 4.0", Validators.required],
      autoUpdateUrlCtrl: [""],
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
  isParsingSetup = false;

  get importStats(): KMLImportStats {
    return this.kmlParserService.getImportStats();
  }

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

  openFolderAmenitiesDialog(folder: KMLSetupInfo["folders"][number]) {
    const dialogRef = this._dialog.open(SpotAmenitiesDialogComponent, {
      data: {
        amenities: { ...(folder.amenities ?? {}) },
      },
    });
    dialogRef.afterClosed().subscribe((result?: AmenitiesMap) => {
      if (result) {
        folder.amenities = result;
      }
    });
  }

  getFolderAmenitySummary(folder: KMLSetupInfo["folders"][number]): string {
    const amenities = folder.amenities ?? {};
    const setCount = Object.values(amenities).filter(
      (value) => value !== undefined && value !== null
    ).length;
    return setCount === 0 ? "No template" : `${setCount} configured`;
  }

  setSpotIncluded(spot: KMLSpot, include: boolean) {
    const key = this._spotKey(spot);
    this.verificationItems.update((items) =>
      items.map((item) =>
        this._spotKey(item.spot) === key
          ? {
              ...item,
              include,
              reason:
                item.reason === "duplicate" && include ? "manual" : item.reason,
            }
          : item
      )
    );
  }

  toggleSpotIncluded(spot: KMLSpot) {
    const current = this.isSpotIncluded(spot);
    this.setSpotIncluded(spot, !current);
  }

  isSpotIncluded(spot: KMLSpot): boolean {
    const key = this._spotKey(spot);
    const item = this.verificationItems().find(
      (verificationItem) => this._spotKey(verificationItem.spot) === key
    );
    return item?.include ?? false;
  }

  selectVerificationSpot(spot: KMLSpot) {
    this.selectedSpot.set(spot);
  }

  verificationSpotReasonText(item: VerificationSpotItem): string | null {
    if (item.reason === "duplicate" && !item.include) {
      return "Duplicate detected";
    }
    if (item.reason === "regex" && !item.include) {
      return "Regex filtered out";
    }
    if (!item.include) {
      return "Excluded";
    }
    return null;
  }

  selectedAmenitiesEntries(): [string, boolean | null | undefined][] {
    const item = this.selectedVerificationItem();
    if (!item) {
      return [];
    }
    const amenities = item.localSpot.amenities();
    return Object.entries(amenities ?? {}).filter(
      ([, value]) => value !== undefined
    );
  }

  private _sanitizeUrl(value: string | null | undefined): string | undefined {
    const v = (value ?? "").trim();
    if (!v) return undefined;
    if (v.startsWith("http://") || v.startsWith("https://")) {
      return v;
    }
    return `https://${v}`;
  }

  private _spotKey(spot: KMLSpot): string {
    return `${spot.importIndex ?? "noidx"}:${spot.spot.location.lat}:${
      spot.spot.location.lng
    }`;
  }

  ngAfterViewInit(): void {}

  onUploadMediaSelect(file: File) {
    this.kmlUploadFile = file;
    this.continueToSetup();
  }

  getSpotLocations(spots: KMLSpot[]): google.maps.LatLngLiteral[] {
    return spots.map((spot) => spot.spot.location);
  }

  getSpotMarkers(spots: KMLSpot[] | null): MarkerSchema[] {
    if (!spots) return [];

    const selected = this.selectedVerificationSpot();

    return spots
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
    const folderInfo = this.kmlParserService.setupInfo?.folders.find(
      (f) => f.name === kmlSpot.folder
    );

    let localSpot = new LocalSpot(
      {
        name: { [kmlSpot.language]: kmlSpot.spot.name },
        description: kmlSpot.spot.description
          ? { [kmlSpot.language]: kmlSpot.spot.description }
          : undefined,
        media:
          kmlSpot.spot.mediaUrls?.map((url) => ({
            type: MediaType.Image,
            src: url,
            isInStorage: false,
            origin: "other",
          })) ?? undefined,
        location: new GeoPoint(
          kmlSpot.spot.location.lat,
          kmlSpot.spot.location.lng
        ),
        address: null,
        type: type,
        access: folderInfo?.access ?? SpotAccess.Other,
        amenities: folderInfo?.amenities,
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

  async continueToSetup() {
    if (!this.kmlUploadFile) {
      // the file doesn't exist
      console.error("The KML file was not set properly or is invalid!");
      return;
    }
    if (this.isParsingSetup) {
      return;
    }

    this.isParsingSetup = true;

    try {
      const fileExtension = this.kmlUploadFile.name
        .split(".")
        .pop()
        ?.toLowerCase();

      if (fileExtension === "kmz") {
        const zip = new JSZip();
        const zipContents = await zip.loadAsync(this.kmlUploadFile);
        // Find the first .kml file
        const kmlFilename = Object.keys(zipContents.files).find((filename) =>
          filename.toLowerCase().endsWith(".kml")
        );

        if (kmlFilename) {
          const data = await zipContents.files[kmlFilename].async("string");
          await this.parseKmlString(data);
        } else {
          console.error("No KML file found inside KMZ!");
        }
      } else {
        const data = await this.kmlUploadFile.text();
        await this.parseKmlString(data);
      }
    } catch (error) {
      console.error("Error preparing import file:", error);
    } finally {
      this.isParsingSetup = false;
    }
  }

  async parseKmlString(data: string): Promise<void> {
    try {
      await this.kmlParserService.parseKMLFromString(data);
      if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
        console.error("stepperHorizontal is not defined");
        return;
      }

      // Pre-calculate spot types for folders
      if (this.kmlParserService.setupInfo?.folders) {
        this.kmlParserService.setupInfo.folders.forEach((folder) => {
          folder.type = this.getSpotTypeFromName(folder.name);
          folder.access = SpotAccess.Other;
        });
      }

      const autoUpdateUrlControl =
        this.creditsFormGroup?.get("autoUpdateUrlCtrl");
      if (
        autoUpdateUrlControl &&
        !autoUpdateUrlControl.value &&
        this.kmlParserService.setupInfo?.networkLinks?.length
      ) {
        autoUpdateUrlControl.setValue(
          this.kmlParserService.setupInfo.networkLinks[0]
        );
      }

      // parsing was successful
      this.stepperHorizontal.selected.completed = true;
      this.stepperHorizontal.next();
    } catch (error: unknown) {
      // parsing was not successful
      console.error(error);
    }
  }

  continueToVerification() {
    if (!this.setupFormGroup || !this.creditsFormGroup || !this.legalFormGroup) {
      return;
    }
    if (
      this.setupFormGroup.invalid ||
      this.creditsFormGroup.invalid ||
      this.legalFormGroup.invalid
    ) {
      this.setupFormGroup.markAllAsTouched();
      this.creditsFormGroup.markAllAsTouched();
      this.legalFormGroup.markAllAsTouched();
      return;
    }
    if (this.kmlParserService.setupInfo) {
      this.kmlParserService.setupInfo.lang = this.setupFormGroup.get(
        "setupLangCtrl"
      )?.value as LocaleCode;
    }

    this.kmlParserService.confirmSetup().then(() => {
      if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
        console.error("stepperHorizontal is not defined");
        return;
      }

      this.stepperHorizontal.selected.completed = true;
      this.stepperHorizontal.next();
      Promise.all([
        firstValueFrom(this.kmlParserService.spotsToImport$),
        firstValueFrom(this.kmlParserService.spotsNotToImport$),
      ]).then(([spotsToImport, spotsNotToImport]) => {
        const allSpots = [...spotsToImport, ...spotsNotToImport];
        if (allSpots.length === 0) {
          this.verificationItems.set([]);
          this.selectedSpot.set(null);
          return;
        }

        const includedKeys = new Set(
          spotsToImport.map((spot) => this._spotKey(spot))
        );
        const uniqueSpotsByKey = new Map<string, KMLSpot>();
        allSpots.forEach((spot) => {
          const key = this._spotKey(spot);
          const existing = uniqueSpotsByKey.get(key);
          if (!existing) {
            uniqueSpotsByKey.set(key, spot);
            return;
          }
          // Prefer the "to import" variant if duplicate entries exist.
          const shouldPreferCurrent =
            includedKeys.has(key) &&
            existing.possibleDuplicateOf.length > 0 &&
            spot.possibleDuplicateOf.length === 0;
          if (shouldPreferCurrent) {
            uniqueSpotsByKey.set(key, spot);
          }
        });
        const uniqueSpots = Array.from(uniqueSpotsByKey.values());

        const selectedLanguage =
          (this.setupFormGroup?.get("setupLangCtrl")?.value as LocaleCode) ||
          this.locale;
        uniqueSpots.forEach((spot) => {
          spot.language = selectedLanguage;
          spot.spot.name = (spot.spot.name ?? "").trim();
        });

        const regexApplied = !!this.kmlParserService.setupInfo?.regex;
        const items: VerificationSpotItem[] = uniqueSpots.map((spot) => {
          const include = includedKeys.has(this._spotKey(spot));
          return {
            spot,
            include,
            reason:
              !include && spot.possibleDuplicateOf.length > 0
                ? "duplicate"
                : !include && regexApplied
                ? "regex"
                : undefined,
            folder: spot.folder ?? "Ungrouped",
            localSpot: this.kmlSpotToLocalSpot(spot)!,
          };
        });
        this.verificationItems.set(items);

        const firstIncluded = items.find((item) => item.include)?.spot;
        this.selectedSpot.set(firstIncluded ?? items[0].spot);
        this.previewMode.set("map");
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
  async importSpots() {
    if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
      console.error("stepperHorizontal is not defined");
      return;
    }

    this.stepperHorizontal.selected.completed = true;
    this.stepperHorizontal.next();

    try {
      if (!this._authService.isSignedIn || !this._authService.user.uid) {
        console.error("User must be authenticated to import spots");
        this._spotImportFailed();
        return;
      }
      if (!this._authService.user.data) {
        console.error("Authenticated user profile data missing.");
        this._spotImportFailed();
        return;
      }
      if (
        !this.creditsFormGroup?.valid ||
        !this.setupFormGroup?.valid ||
        !this.legalFormGroup?.valid
      ) {
        this._spotImportFailed();
        return;
      }

      const includedItems = this.verificationItems().filter(
        (item) => item.include
      );
      const excludedItems = this.verificationItems().filter(
        (item) => !item.include
      );
      const kmlSpots = includedItems.map((item) => item.spot);
      const skippedSpots = excludedItems.map((item) => item.spot);

      const chunkSize = 25;
      const chunks = this._chunkSpots(kmlSpots, chunkSize);
      const storageUrl = await this._uploadImportFileToStorage();
      const importId = await this._createImportDocument(
        kmlSpots,
        skippedSpots,
        storageUrl,
        chunks.length
      );

      await Promise.all(
        chunks.map((chunk, index) =>
          this._importsService.setImportChunk(
            importId,
            `chunk-${String(index + 1).padStart(5, "0")}`,
            {
              status: "PENDING",
              chunk_index: index,
              spot_count: chunk.length,
              spots: chunk.map((kmlSpot) => {
                const folderInfo =
                  this.kmlParserService.setupInfo?.folders.find(
                    (f) => f.name === kmlSpot.folder
                  );
                const type =
                  folderInfo?.type && folderInfo.type !== SpotTypes.Other
                    ? folderInfo.type
                    : this.getSpotTypeFromName(kmlSpot.spot.name);
                const access = folderInfo?.access ?? SpotAccess.Other;
                const amenities = folderInfo?.amenities;
                return {
                  name: kmlSpot.spot.name.trim(),
                  language:
                    ((this.setupFormGroup?.get("setupLangCtrl")
                      ?.value as LocaleCode) ||
                      this.locale) ??
                    "en",
                  description: kmlSpot.spot.description,
                  media_urls: kmlSpot.spot.mediaUrls,
                  location: kmlSpot.spot.location,
                  bounds: kmlSpot.spot.bounds,
                  type,
                  access,
                  amenities,
                };
              }),
            }
          )
        )
      );

      await this._importsService.updateImport(importId, {
        status: chunks.length > 0 ? "PROCESSING" : "COMPLETED",
      });

      this._spotImportSuccessful();
    } catch (error) {
      console.error("Failed to import spots:", error);
      this._spotImportFailed();
    }
  }

  private async _uploadImportFileToStorage(): Promise<string | undefined> {
    if (!this.kmlUploadFile) {
      return undefined;
    }
    try {
      const fileExtension = this.kmlUploadFile.name.split(".").pop() ?? "kml";
      const filename = `import_${generateUUID()}`;
      return await this._storageService.setUploadToStorage(
        this.kmlUploadFile,
        StorageBucket.Imports,
        undefined,
        filename,
        fileExtension,
        "private, max-age=0, no-store"
      );
    } catch (error) {
      console.warn("Could not upload import source file to storage", error);
      return undefined;
    }
  }

  private async _createImportDocument(
    spotsToImport: KMLSpot[],
    skippedSpots: KMLSpot[],
    storageUrl?: string,
    chunkCount: number = 0
  ): Promise<string> {
    const sourceName = this.creditsFormGroup?.get("sourceNameCtrl")?.value;
    const attributionText = this.creditsFormGroup?.get(
      "attributionTextCtrl"
    )?.value;
    const websiteUrl = this._sanitizeUrl(
      this.creditsFormGroup?.get("websiteUrlCtrl")?.value
    );
    const instagramUrl = this._sanitizeUrl(
      this.creditsFormGroup?.get("instagramUrlCtrl")?.value
    );
    const license = this.creditsFormGroup?.get("licenseCtrl")?.value;
    const sourceUrl = this._sanitizeUrl(
      this.creditsFormGroup?.get("autoUpdateUrlCtrl")?.value
    );
    const allowFutureAutoUpdate = !!this.legalFormGroup?.get(
      "allowFutureAutoUpdateCtrl"
    )?.value;
    const preferredImportId = this.creditsFormGroup?.get("importIdCtrl")?.value;
    let importId = this._makeReadableImportId(sourceName, preferredImportId);
    const existing = await this._importsService.getImportById(importId);
    if (existing) {
      importId = `${importId}-${generateUUID().split("-")[0]}`;
    }

    const importDoc: Omit<ImportSchema, "created_at"> = {
      status: "PENDING",
      updated_at: undefined,
      user: createUserReference(this._authService.user.data!),
      file_name: this.kmlUploadFile?.name ?? "unknown",
      file_type:
        this.kmlUploadFile?.name.toLowerCase().endsWith(".kmz") === true
          ? "kmz"
          : this.kmlUploadFile?.name.toLowerCase().endsWith(".kml") === true
          ? "kml"
          : "unknown",
      file_size_bytes: this.kmlUploadFile?.size,
      storage_url: storageUrl,
      credits: {
        source_name: sourceName,
        attribution_text: attributionText || undefined,
        website_url: websiteUrl,
        instagram_url: instagramUrl,
        license: license,
      },
      legal: {
        confirmed_rights: !!this.legalFormGroup?.get("rightsConfirmedCtrl")
          ?.value,
        confirmed_external_image_rights: !!this.legalFormGroup?.get(
          "externalImagesRightsConfirmedCtrl"
        )?.value,
      },
      source_url: sourceUrl,
      allow_future_auto_update: allowFutureAutoUpdate,
      language: this.setupFormGroup?.get("setupLangCtrl")?.value,
      spot_count_total: spotsToImport.length + skippedSpots.length,
      spot_count_imported: 0,
      spot_count_skipped: skippedSpots.length,
      skipped_indices: skippedSpots
        .map((spot) => spot.importIndex)
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b),
      folder_templates: this.kmlParserService.setupInfo?.folders.map(
        (folder) => ({
          name: folder.name,
          type: folder.type,
          access: folder.access,
          amenities: folder.amenities,
        })
      ),
      chunk_count_total: chunkCount,
      chunk_count_processed: 0,
    };

    return this._importsService.createImport(importDoc, importId);
  }

  private _chunkSpots(spots: KMLSpot[], chunkSize: number): KMLSpot[][] {
    const result: KMLSpot[][] = [];
    for (let i = 0; i < spots.length; i += chunkSize) {
      result.push(spots.slice(i, i + chunkSize));
    }
    return result;
  }

  private _slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50);
  }

  private _makeReadableImportId(
    sourceName: string,
    preferredImportId?: string
  ): string {
    const preferred = this._slugify(preferredImportId || "");
    if (preferred.length > 0) {
      return preferred;
    }
    const username =
      this._authService.user?.data?.displayName ??
      this._authService.user?.uid ??
      "user";
    const date = new Date();
    const dateToken = `${date.getFullYear()}${String(
      date.getMonth() + 1
    ).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const sourceToken = this._slugify(sourceName || "import");
    const userToken = this._slugify(username || "user");
    const random = generateUUID().split("-")[0];
    return `${sourceToken}-${userToken}-${dateToken}-${random}`;
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
