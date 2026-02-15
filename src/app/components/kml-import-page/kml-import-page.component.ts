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
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import {
  SpotAccess,
  SpotTypes,
  SpotAccessIcons,
  SpotAccessNames,
  SpotTypesIcons,
  SpotTypesNames,
} from "../../../db/schemas/SpotTypeAndAccess";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import {
  combineLatest,
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
import { MatSidenavModule } from "@angular/material/sidenav";
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
  originalMediaUrls: string[];
  selectedMediaUrls: string[];
}

type SetupMediaValidationStatus = "valid" | "invalid" | "unknown";

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
    MatProgressBarModule,
    MatButtonToggleModule,
    SpotPreviewCardComponent,
    ImgCarouselComponent,
    MatSidenavModule,
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
    const selectedItem = this.selectedVerificationItem();
    const selected = this.selectedSpot();
    if (!selectedItem || !selected || selectedItem.selectedMediaUrls.length === 0) {
      return [];
    }
    return selectedItem.selectedMediaUrls.map(
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
      permissionStatusCtrl: [null as "yes" | "no" | null],
      abandonwareStatusCtrl: [null as "yes" | "no" | null],
      imageRightsStatusCtrl: ["no" as "yes" | "no"],
      allowFutureAutoUpdateCtrl: [true],
    });
    this.creditsFormGroup = this._formBuilder.group({
      sourceNameCtrl: ["", Validators.required],
      importIdCtrl: [""],
      attributionTextCtrl: [""],
      viewerMapIdCtrl: [""],
      instagramHandleCtrl: [""],
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

    const permissionStatusCtrl = this.legalFormGroup.get(
      "permissionStatusCtrl"
    );
    const abandonwareStatusCtrl = this.legalFormGroup.get(
      "abandonwareStatusCtrl"
    );
    const imageRightsStatusCtrl = this.legalFormGroup.get(
      "imageRightsStatusCtrl"
    );

    if (permissionStatusCtrl && abandonwareStatusCtrl && imageRightsStatusCtrl) {
      combineLatest([
        permissionStatusCtrl.valueChanges.pipe(
          startWith(permissionStatusCtrl.value)
        ),
        abandonwareStatusCtrl.valueChanges.pipe(
          startWith(abandonwareStatusCtrl.value)
        ),
      ]).subscribe(() => this._syncLegalControlState());

      this._syncLegalControlState();
    }

    const instagramHandleCtrl = this.creditsFormGroup.get("instagramHandleCtrl");
    if (instagramHandleCtrl) {
      instagramHandleCtrl.valueChanges.subscribe((value) => {
        const normalized = this._normalizeInstagramHandle(value);
        const normalizedValue = normalized ?? "";
        if (value !== normalizedValue) {
          instagramHandleCtrl.setValue(normalizedValue, { emitEvent: false });
        }
      });
    }

    const viewerMapIdCtrl = this.creditsFormGroup.get("viewerMapIdCtrl");
    if (viewerMapIdCtrl) {
      viewerMapIdCtrl.valueChanges.subscribe((value) => {
        const normalized = this._extractViewerMapId(value);
        const normalizedValue = normalized ?? "";
        if (value !== normalizedValue) {
          viewerMapIdCtrl.setValue(normalizedValue, { emitEvent: false });
        }
      });
    }

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
  legalValidationMessage = signal<string | null>(null);
  uploadAuthMessage = signal<string | null>(null);
  setupWarningMessage = signal<string | null>(null);
  setupMediaErrorMessage = signal<string | null>(null);
  setupDownloadKmlUrl = signal<string | null>(null);
  setupMediaValidationProgress = signal<{
    stage: string;
    processed: number;
    total: number;
  } | null>(null);

  get importStats(): KMLImportStats {
    return this.kmlParserService.getImportStats();
  }

  canUploadImport(): boolean {
    return !!(this._authService.isSignedIn && this._authService.user.uid);
  }

  private _ensureAuthenticatedForUpload(): boolean {
    if (this.canUploadImport()) {
      this.uploadAuthMessage.set(null);
      return true;
    }
    this.uploadAuthMessage.set("Please sign in to import KML/KMZ files.");
    return false;
  }

  isHighVolumeImport(): boolean {
    return this.importStats.spotCount > 100;
  }

  hasDetectedImages(): boolean {
    return this.importStats.imageCount > 0;
  }

  private _syncLegalControlState() {
    if (!this.legalFormGroup) {
      return;
    }

    const permissionStatusCtrl = this.legalFormGroup.get(
      "permissionStatusCtrl"
    );
    const abandonwareStatusCtrl = this.legalFormGroup.get(
      "abandonwareStatusCtrl"
    );
    const imageRightsStatusCtrl = this.legalFormGroup.get(
      "imageRightsStatusCtrl"
    );

    if (!permissionStatusCtrl || !abandonwareStatusCtrl || !imageRightsStatusCtrl) {
      return;
    }

    const permissionStatus = permissionStatusCtrl.value as "yes" | "no" | null;
    const abandonwareStatus = abandonwareStatusCtrl.value as
      | "yes"
      | "no"
      | null;

    const allowAbandonware = permissionStatus === "no" && !this.isHighVolumeImport();
    if (!allowAbandonware) {
      if (abandonwareStatusCtrl.value !== null) {
        abandonwareStatusCtrl.setValue(null, { emitEvent: false });
      }
      if (abandonwareStatusCtrl.enabled) {
        abandonwareStatusCtrl.disable({ emitEvent: false });
      }
    } else if (abandonwareStatusCtrl.disabled) {
      abandonwareStatusCtrl.enable({ emitEvent: false });
    }

    const isAbandonwarePath = allowAbandonware && abandonwareStatus === "yes";
    const disableImageRights = isAbandonwarePath || !this.hasDetectedImages();
    if (disableImageRights && imageRightsStatusCtrl.value !== "no") {
      imageRightsStatusCtrl.setValue("no", { emitEvent: false });
    }

    if (disableImageRights) {
      if (imageRightsStatusCtrl.enabled) {
        imageRightsStatusCtrl.disable({ emitEvent: false });
      }
    } else if (imageRightsStatusCtrl.disabled) {
      imageRightsStatusCtrl.enable({ emitEvent: false });
    }
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

  setSelectedVerificationType(type: SpotTypes | null | undefined) {
    if (!type) {
      return;
    }
    const item = this.selectedVerificationItem();
    if (!item) {
      return;
    }
    item.localSpot.type.set(type);
  }

  setSelectedVerificationAccess(access: SpotAccess | null | undefined) {
    if (!access) {
      return;
    }
    const item = this.selectedVerificationItem();
    if (!item) {
      return;
    }
    item.localSpot.access.set(access);
  }

  openSelectedSpotAmenitiesDialog() {
    const item = this.selectedVerificationItem();
    if (!item) {
      return;
    }
    const dialogRef = this._dialog.open(SpotAmenitiesDialogComponent, {
      data: {
        amenities: { ...(item.localSpot.amenities() ?? {}) },
      },
    });
    dialogRef.afterClosed().subscribe((result?: AmenitiesMap) => {
      if (result) {
        item.localSpot.amenities.set(result);
      }
    });
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

  private _normalizeInstagramHandle(
    value: string | null | undefined
  ): string | undefined {
    const raw = (value ?? "").trim();
    if (!raw) {
      return undefined;
    }

    const normalizedRaw = raw.replace(/^@+/, "");

    try {
      if (/^https?:\/\//i.test(normalizedRaw)) {
        const parsed = new URL(normalizedRaw);
        if (parsed.hostname.toLowerCase().includes("instagram.com")) {
          const firstPathSegment = parsed.pathname
            .split("/")
            .map((part) => part.trim())
            .filter((part) => part.length > 0)[0];
          if (firstPathSegment) {
            return firstPathSegment.replace(/^@+/, "");
          }
        }
      }
    } catch {
      // fall through to text parsing
    }

    const fromDomainMatch = normalizedRaw.match(
      /instagram\.com\/@?([A-Za-z0-9._]+)/i
    );
    if (fromDomainMatch?.[1]) {
      return fromDomainMatch[1];
    }

    return normalizedRaw.split("/")[0];
  }

  private _instagramUrlFromHandle(
    value: string | null | undefined
  ): string | undefined {
    const handle = this._normalizeInstagramHandle(value);
    if (!handle) {
      return undefined;
    }
    return `https://instagram.com/${encodeURIComponent(handle)}`;
  }

  private _extractViewerMapId(value: string | null | undefined): string | undefined {
    const raw = (value ?? "").trim();
    if (!raw) {
      return undefined;
    }

    try {
      if (/^https?:\/\//i.test(raw)) {
        const parsed = new URL(raw);
        const mid = parsed.searchParams.get("mid");
        if (mid) {
          return mid.trim();
        }
      }
    } catch {
      // fall through to regex parsing
    }

    const midMatch = raw.match(/[?&]mid=([A-Za-z0-9_-]+)/i);
    if (midMatch?.[1]) {
      return midMatch[1];
    }

    const candidate = raw.replace(/^@+/, "").trim();
    if (/^[A-Za-z0-9_-]{8,}$/.test(candidate)) {
      return candidate;
    }

    return undefined;
  }

  private _viewerUrlFromMapId(
    mapId: string | null | undefined
  ): string | undefined {
    const normalizedMapId = this._extractViewerMapId(mapId);
    if (!normalizedMapId) {
      return undefined;
    }
    return `https://www.google.com/maps/d/u/0/viewer?mid=${encodeURIComponent(
      normalizedMapId
    )}`;
  }

  private _toViewerUrlFromKmlUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const isGoogleHost = parsed.hostname.includes("google.com");
      const pathLower = parsed.pathname.toLowerCase();
      const isMyMapsPath = pathLower.includes("/maps/d/");
      if (!isGoogleHost || !isMyMapsPath) {
        return url;
      }

      const mid = parsed.searchParams.get("mid");
      if (!mid) {
        return url;
      }

      return `https://www.google.com/maps/d/u/0/viewer?mid=${encodeURIComponent(
        mid
      )}`;
    } catch {
      return url;
    }
  }

  private _toDirectKmlUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const isGoogleHost = parsed.hostname.includes("google.com");
      const pathLower = parsed.pathname.toLowerCase();
      const mid = parsed.searchParams.get("mid");
      if (!isGoogleHost || !pathLower.includes("/maps/d/") || !mid) {
        return url;
      }
      return `https://www.google.com/maps/d/u/0/kml?mid=${encodeURIComponent(
        mid
      )}`;
    } catch {
      return url;
    }
  }

  private _extractFirstUrlFromText(
    value: string | undefined
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const html = new DOMParser().parseFromString(value, "text/html");
      const href = html.querySelector("a[href]")?.getAttribute("href");
      const sanitizedHref = this._sanitizeUrl(href);
      if (sanitizedHref) {
        return sanitizedHref;
      }
    } catch {
      // Fall back to plain text URL extraction.
    }

    const urlMatch = value.match(/https?:\/\/[^\s"'<>]+/i);
    return this._sanitizeUrl(urlMatch?.[0]);
  }

  private _detectViewerUrl(): string | undefined {
    const fromDescription = this._extractFirstUrlFromText(
      this.kmlParserService.setupInfo?.description
    );
    if (fromDescription) {
      return this._toViewerUrlFromKmlUrl(fromDescription);
    }

    const firstNetworkLink = this.kmlParserService.setupInfo?.networkLinks?.[0];
    if (!firstNetworkLink) {
      return undefined;
    }

    const normalized = this._sanitizeUrl(firstNetworkLink);
    if (!normalized) {
      return undefined;
    }

    return this._toViewerUrlFromKmlUrl(normalized);
  }

  private _spotKey(spot: KMLSpot): string {
    return `${spot.importIndex ?? "noidx"}:${spot.spot.location.lat}:${
      spot.spot.location.lng
    }`;
  }

  private _normalizeMediaUrls(
    mediaUrls: string[] | null | undefined
  ): string[] {
    return Array.from(
      new Set((mediaUrls ?? []).map((url) => url.trim()).filter((url) => !!url))
    );
  }

  private _setSelectedMediaUrlsForSpot(
    spot: KMLSpot,
    selectedMediaUrls: string[]
  ) {
    const key = this._spotKey(spot);
    this.verificationItems.update((items) =>
      items.map((item) => {
        if (this._spotKey(item.spot) !== key) {
          return item;
        }
        const normalizedSelected = this
          ._normalizeMediaUrls(selectedMediaUrls)
          .filter((url) => item.originalMediaUrls.includes(url));
        const localSpot = this.kmlSpotToLocalSpot(item.spot, normalizedSelected)!;
        localSpot.type.set(item.localSpot.type());
        localSpot.access.set(item.localSpot.access());
        localSpot.amenities.set({ ...(item.localSpot.amenities() ?? {}) });
        return {
          ...item,
          selectedMediaUrls: normalizedSelected,
          localSpot,
        };
      })
    );
  }

  setSelectedSpotMediaIncluded(url: string, include: boolean) {
    const selectedItem = this.selectedVerificationItem();
    if (!selectedItem) {
      return;
    }
    if (!selectedItem.originalMediaUrls.includes(url)) {
      return;
    }
    const nextUrls = include
      ? Array.from(new Set([...selectedItem.selectedMediaUrls, url]))
      : selectedItem.selectedMediaUrls.filter(
          (selectedUrl) => selectedUrl !== url
        );
    this._setSelectedMediaUrlsForSpot(selectedItem.spot, nextUrls);
  }

  removeAllMediaFromSelectedSpotImport() {
    const selectedItem = this.selectedVerificationItem();
    if (!selectedItem) {
      return;
    }
    this._setSelectedMediaUrlsForSpot(selectedItem.spot, []);
  }

  restoreAllMediaForSelectedSpotImport() {
    const selectedItem = this.selectedVerificationItem();
    if (!selectedItem) {
      return;
    }
    this._setSelectedMediaUrlsForSpot(
      selectedItem.spot,
      selectedItem.originalMediaUrls
    );
  }

  ngAfterViewInit(): void {}

  onUploadMediaSelect(file: File) {
    if (!this._ensureAuthenticatedForUpload()) {
      return;
    }
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

  kmlSpotToLocalSpot(
    kmlSpot: KMLSpot | null | undefined,
    mediaUrlsOverride?: string[]
  ): LocalSpot | null {
    if (!kmlSpot) return null;
    let type = this.getSpotType(kmlSpot);
    const folderInfo = this.kmlParserService.setupInfo?.folders.find(
      (f) => f.name === kmlSpot.folder
    );
    const selectedMediaUrls = this._normalizeMediaUrls(
      mediaUrlsOverride ?? kmlSpot.spot.mediaUrls
    );

    let localSpot = new LocalSpot(
      {
        name: { [kmlSpot.language]: kmlSpot.spot.name },
        description: kmlSpot.spot.description
          ? { [kmlSpot.language]: kmlSpot.spot.description }
          : undefined,
        media: selectedMediaUrls.map((url) => ({
          type: MediaType.Image,
          src: url,
          isInStorage: false,
          origin: "other",
        })),
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
    if (!this._ensureAuthenticatedForUpload()) {
      return;
    }
    if (!this.kmlUploadFile) {
      // the file doesn't exist
      console.error("The KML file was not set properly or is invalid!");
      return;
    }
    if (this.isParsingSetup) {
      return;
    }

    this.isParsingSetup = true;
    this.setupWarningMessage.set(null);
    this.setupMediaErrorMessage.set(null);
    this.setupDownloadKmlUrl.set(null);
    this.setupMediaValidationProgress.set(null);

    try {
      const fileExtension = this.kmlUploadFile.name
        .split(".")
        .pop()
        ?.toLowerCase();

      if (fileExtension === "kmz") {
        const zip = new JSZip();
        const zipContents = await zip.loadAsync(this.kmlUploadFile);
        // Some KMZ exports include a wrapper KML as first file and real placemarks in another KML.
        // Prefer the KML with the highest placemark count.
        const kmlFilenames = Object.keys(zipContents.files).filter(
          (filename) =>
            filename.toLowerCase().endsWith(".kml") &&
            !zipContents.files[filename].dir
        );

        if (kmlFilenames.length > 0) {
          let bestKmlData: string | null = null;
          let bestImportableSpotCount = -1;
          let bestPlacemarkCount = -1;

          for (const filename of kmlFilenames) {
            const candidateData = await zipContents.files[filename].async(
              "string"
            );
            const importableSpotCount =
              this._estimateImportableSpotsInKml(candidateData);
            const placemarkCount = this._countPlacemarksInKml(candidateData);
            const isBetterCandidate =
              importableSpotCount > bestImportableSpotCount ||
              (importableSpotCount === bestImportableSpotCount &&
                placemarkCount > bestPlacemarkCount);
            if (isBetterCandidate) {
              bestImportableSpotCount = importableSpotCount;
              bestPlacemarkCount = placemarkCount;
              bestKmlData = candidateData;
            }
          }

          if (bestKmlData) {
            let kmlDataToParse = bestKmlData;
            if (bestImportableSpotCount <= 0) {
              const wrapperNetworkLinks =
                this._extractNetworkLinksFromKmlData(bestKmlData);
              const resolvedLinkedKml = await this._resolveNetworkLinkedKml(
                bestKmlData
              );
              if (resolvedLinkedKml) {
                kmlDataToParse = resolvedLinkedKml;
              } else if (wrapperNetworkLinks.length > 0) {
                console.warn(
                  "KMZ contains only NetworkLink references and linked KML could not be fetched in-browser."
                );
                const firstWrapperLink = this._sanitizeUrl(wrapperNetworkLinks[0]);
                if (firstWrapperLink) {
                  this.setupDownloadKmlUrl.set(
                    this._toDirectKmlUrl(firstWrapperLink)
                  );
                }
                this.setupWarningMessage.set(
                  "This KMZ is only a wrapper file. Open the direct KML link below, download it, and upload that .kml file."
                );
              }
            }
            await this.parseKmlString(kmlDataToParse);
          }
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
      this.setupMediaValidationProgress.set(null);
      this.isParsingSetup = false;
    }
  }

  private _countPlacemarksInKml(kmlData: string): number {
    try {
      const xmlDoc = new DOMParser().parseFromString(kmlData, "text/xml");
      if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        return 0;
      }
      const placemarks = this._getElementsByTagNameAnyNsCaseInsensitive(
        xmlDoc,
        "Placemark"
      );
      return placemarks.length;
    } catch {
      return 0;
    }
  }

  private _estimateImportableSpotsInKml(kmlData: string): number {
    try {
      const xmlDoc = new DOMParser().parseFromString(kmlData, "text/xml");
      if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        return 0;
      }

      const placemarks = this._getElementsByTagNameAnyNsCaseInsensitive(
        xmlDoc,
        "Placemark"
      );
      let importableCount = 0;

      placemarks.forEach((placemark) => {
        const coordinatesNodes = this._getElementsByTagNameAnyNsCaseInsensitive(
          placemark,
          "coordinates"
        );
        const gxCoordNodes = this._getElementsByTagNameAnyNsCaseInsensitive(
          placemark,
          "coord"
        );
        const latitudeNode = this._getElementsByTagNameAnyNsCaseInsensitive(
          placemark,
          "latitude"
        )[0];
        const longitudeNode = this._getElementsByTagNameAnyNsCaseInsensitive(
          placemark,
          "longitude"
        )[0];

        const hasCoordinateText = coordinatesNodes.some((node) =>
          this._hasNumericCoordinateText(node.textContent)
        );
        const hasGxCoordinateText = gxCoordNodes.some((node) =>
          this._hasNumericCoordinateText(node.textContent)
        );
        const hasLatLng =
          this._hasNumericCoordinateText(latitudeNode?.textContent) &&
          this._hasNumericCoordinateText(longitudeNode?.textContent);

        if (hasCoordinateText || hasGxCoordinateText || hasLatLng) {
          importableCount += 1;
        }
      });

      return importableCount;
    } catch {
      return 0;
    }
  }

  private _getElementsByTagNameAnyNsCaseInsensitive(
    root: Document | Element,
    tagName: string
  ): Element[] {
    const byNamespace = Array.from(root.getElementsByTagNameNS("*", tagName));
    if (byNamespace.length > 0) {
      return byNamespace;
    }

    const byTag = Array.from(root.getElementsByTagName(tagName));
    if (byTag.length > 0) {
      return byTag;
    }

    const tagLower = tagName.toLowerCase();
    return Array.from(root.getElementsByTagName("*")).filter(
      (element) => (element.localName ?? element.tagName).toLowerCase() === tagLower
    );
  }

  private _hasNumericCoordinateText(value: string | null | undefined): boolean {
    const text = (value ?? "").trim();
    if (!text) {
      return false;
    }
    return /-?\d+(?:\.\d+)?/.test(text);
  }

  private _extractNetworkLinksFromKmlData(kmlData: string): string[] {
    try {
      const xmlDoc = new DOMParser().parseFromString(kmlData, "text/xml");
      if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        return [];
      }

      const networkLinks = this._getElementsByTagNameAnyNsCaseInsensitive(
        xmlDoc,
        "NetworkLink"
      );
      const links = networkLinks
        .map((networkLink) =>
          this._getElementsByTagNameAnyNsCaseInsensitive(networkLink, "href")[0]
            ?.textContent?.trim()
        )
        .filter((href): href is string => !!href && href.length > 0);
      return Array.from(new Set(links));
    } catch {
      return [];
    }
  }

  private _toKmlUrlCandidates(url: string): string[] {
    const sanitized = this._sanitizeUrl(url);
    if (!sanitized) {
      return [];
    }

    const candidates = new Set<string>([sanitized]);
    try {
      const parsed = new URL(sanitized);
      const mid = parsed.searchParams.get("mid");
      const isGoogleHost = parsed.hostname.includes("google.com");
      const pathLower = parsed.pathname.toLowerCase();
      const hasKmlPath = pathLower.includes("/kml");
      const hasViewerPath = pathLower.includes("/viewer");

      if (isGoogleHost && mid) {
        if (hasViewerPath || !hasKmlPath) {
          candidates.add(
            `https://www.google.com/maps/d/u/0/kml?mid=${encodeURIComponent(
              mid
            )}`
          );
          candidates.add(
            `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}`
          );
        }

        const forceKmlUrl = new URL(
          hasKmlPath
            ? parsed.toString()
            : `https://www.google.com/maps/d/u/0/kml?mid=${encodeURIComponent(
                mid
              )}`
        );
        forceKmlUrl.searchParams.set("forcekml", "1");
        candidates.add(forceKmlUrl.toString());
      } else if (isGoogleHost && hasKmlPath) {
        const withForceKml = new URL(parsed.toString());
        withForceKml.searchParams.set("forcekml", "1");
        candidates.add(withForceKml.toString());
      }
    } catch {
      // Ignore malformed URL conversion errors.
    }

    return Array.from(candidates);
  }

  private async _fetchTextFromUrl(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
      });
      if (!response.ok) {
        return null;
      }
      const body = await response.text();
      return body.trim().length > 0 ? body : null;
    } catch (error) {
      console.warn("Linked KML fetch blocked in browser:", error);
      return null;
    }
  }

  private async _resolveNetworkLinkedKml(
    kmlData: string,
    depth: number = 0
  ): Promise<string | undefined> {
    if (depth > 3) {
      return undefined;
    }

    const networkLinks = this._extractNetworkLinksFromKmlData(kmlData);
    for (const networkLink of networkLinks) {
      const kmlUrlCandidates = this._toKmlUrlCandidates(networkLink);
      for (const candidateUrl of kmlUrlCandidates) {
        const fetchedKml = await this._fetchTextFromUrl(candidateUrl);
        if (!fetchedKml) {
          continue;
        }

        const importableSpotCount =
          this._estimateImportableSpotsInKml(fetchedKml);
        if (importableSpotCount > 0) {
          return fetchedKml;
        }

        const resolvedNested = await this._resolveNetworkLinkedKml(
          fetchedKml,
          depth + 1
        );
        if (resolvedNested) {
          return resolvedNested;
        }
      }
    }

    return undefined;
  }

  async parseKmlString(data: string): Promise<void> {
    try {
      await this.kmlParserService.parseKMLFromString(data);
      const mediaCleanup = await this._removeBrokenSetupMediaUrls();
      if (mediaCleanup.restoredAfterValidation) {
        this.setupMediaErrorMessage.set(
          "Could not confidently verify image links, so all detected spot images were kept."
        );
      } else if (mediaCleanup.unknownUrlCount > 0) {
        this.setupMediaErrorMessage.set(
          `Verified ${mediaCleanup.checkedUrlCount} image links. Kept ${mediaCleanup.unknownUrlCount} unverified links and removed ${mediaCleanup.removedUrlCount} broken links.`
        );
      } else if (mediaCleanup.removedUrlCount > 0) {
        const sampleList =
          mediaCleanup.sampleRemovedUrls.length > 0
            ? ` Examples: ${mediaCleanup.sampleRemovedUrls.join(", ")}`
            : "";
        this.setupMediaErrorMessage.set(
          `Removed ${mediaCleanup.removedUrlCount} broken image URLs from ${mediaCleanup.affectedSpotCount} spots.${sampleList}`
        );
      } else {
        this.setupMediaErrorMessage.set(null);
      }

      if (mediaCleanup.debugSummary) {
        console.info("[KML import] setup media diagnostics", mediaCleanup.debugSummary);
      }

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

      const sourceNameControl = this.creditsFormGroup?.get("sourceNameCtrl");
      if (
        sourceNameControl &&
        !sourceNameControl.value &&
        this.kmlParserService.setupInfo?.name
      ) {
        sourceNameControl.setValue(this.kmlParserService.setupInfo.name);
      }

      const importIdControl = this.creditsFormGroup?.get("importIdCtrl");
      if (importIdControl && !importIdControl.value) {
        importIdControl.setValue(
          this._makeReadableImportId(
            (sourceNameControl?.value as string) ||
              this.kmlParserService.setupInfo?.name ||
              "",
            ""
          )
        );
      }

      const viewerMapIdControl = this.creditsFormGroup?.get("viewerMapIdCtrl");
      if (viewerMapIdControl && !viewerMapIdControl.value) {
        const detectedViewerUrl = this._detectViewerUrl();
        const detectedMapId = this._extractViewerMapId(detectedViewerUrl);
        if (detectedMapId) {
          viewerMapIdControl.setValue(detectedMapId);
        }
      }

      this._syncLegalControlState();

      // parsing was successful
      this.stepperHorizontal.selected.completed = true;
      this.stepperHorizontal.next();
    } catch (error: unknown) {
      // parsing was not successful
      console.error(error);
    }
  }

  private _hasDirectImportPermission(): boolean {
    return (
      this.legalFormGroup?.get("permissionStatusCtrl")?.value === "yes"
    );
  }

  private _isAbandonwareImport(): boolean {
    return (
      this.legalFormGroup?.get("permissionStatusCtrl")?.value === "no" &&
      this.legalFormGroup?.get("abandonwareStatusCtrl")?.value === "yes" &&
      !this.isHighVolumeImport()
    );
  }

  private _shouldStripDescriptionsForImport(): boolean {
    return !this._hasDirectImportPermission();
  }

  private _shouldStripMediaForImport(): boolean {
    if (!this.legalFormGroup) {
      return false;
    }
    const hasImageRights =
      this.legalFormGroup.get("imageRightsStatusCtrl")?.value === "yes";
    return this._shouldStripDescriptionsForImport() || !hasImageRights;
  }

  private _validateLegalForCurrentImport(): string | null {
    if (!this.legalFormGroup) {
      return "Legal confirmation form is not ready.";
    }

    const permissionStatus = this.legalFormGroup.get("permissionStatusCtrl")
      ?.value as "yes" | "no" | null;
    const abandonwareStatus = this.legalFormGroup.get("abandonwareStatusCtrl")
      ?.value as "yes" | "no" | null;

    if (!permissionStatus) {
      return "Please answer whether you have permission to import this data.";
    }

    if (permissionStatus === "yes") {
      return null;
    }

    if (this.isHighVolumeImport()) {
      return "Imports with more than 100 spots require explicit permission from the author.";
    }

    if (permissionStatus === "no" && abandonwareStatus !== "yes") {
      return "Without explicit permission, you can proceed only for an abandonware/public map.";
    }

    return null;
  }

  isSetupNextDisabled(): boolean {
    if (
      !this.setupFormGroup ||
      !this.creditsFormGroup ||
      !this.legalFormGroup
    ) {
      return true;
    }
    return this.setupFormGroup.invalid || this.creditsFormGroup.invalid;
  }

  continueToVerification() {
    if (
      !this.setupFormGroup ||
      !this.creditsFormGroup ||
      !this.legalFormGroup
    ) {
      return;
    }
    if (this.setupFormGroup.invalid || this.creditsFormGroup.invalid) {
      this.setupFormGroup.markAllAsTouched();
      this.creditsFormGroup.markAllAsTouched();
      this.legalFormGroup.markAllAsTouched();
      return;
    }

    const legalValidationError = this._validateLegalForCurrentImport();
    if (legalValidationError) {
      this.legalValidationMessage.set(legalValidationError);
      this.legalFormGroup.markAllAsTouched();
      return;
    }
    this.legalValidationMessage.set(null);

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
          const initialMediaUrls = this._normalizeMediaUrls(spot.spot.mediaUrls);
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
            localSpot: this.kmlSpotToLocalSpot(spot, initialMediaUrls)!,
            originalMediaUrls: initialMediaUrls,
            selectedMediaUrls: [...initialMediaUrls],
          };
        });
        this.verificationItems.set(items);
        const spotsWithMedia = items.filter(
          (item) => (item.spot.spot.mediaUrls?.length ?? 0) > 0
        ).length;
        const totalMediaRefs = items.reduce(
          (sum, item) => sum + (item.spot.spot.mediaUrls?.length ?? 0),
          0
        );
        const localSpotMediaEntries = items.reduce(
          (sum, item) => sum + item.localSpot.media().length,
          0
        );
        const totalSelectedMediaRefs = items.reduce(
          (sum, item) => sum + item.selectedMediaUrls.length,
          0
        );
        console.info("[KML import] verification media diagnostics", {
          verificationItems: items.length,
          spotsWithMedia,
          totalMediaRefs,
          localSpotMediaEntries,
          totalSelectedMediaRefs,
        });

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
      if (!this.creditsFormGroup?.valid || !this.setupFormGroup?.valid) {
        this._spotImportFailed();
        return;
      }
      const legalValidationError = this._validateLegalForCurrentImport();
      if (legalValidationError) {
        this.legalValidationMessage.set(legalValidationError);
        this._spotImportFailed();
        return;
      }
      this.legalValidationMessage.set(null);

      const includedItems = this.verificationItems().filter(
        (item) => item.include
      );
      const excludedItems = this.verificationItems().filter(
        (item) => !item.include
      );
      const kmlSpots = includedItems.map((item) => item.spot);
      const skippedSpots = excludedItems.map((item) => item.spot);
      const stripDescriptions = this._shouldStripDescriptionsForImport();
      const stripMedia = this._shouldStripMediaForImport();

      const chunkSize = 25;
      const chunks = this._chunkItems(includedItems, chunkSize);
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
              spots: chunk.map((item) => {
                const kmlSpot = item.spot;
                return {
                  name: kmlSpot.spot.name.trim(),
                  language:
                    ((this.setupFormGroup?.get("setupLangCtrl")
                      ?.value as LocaleCode) ||
                      this.locale) ??
                    "en",
                  description: stripDescriptions
                    ? undefined
                    : kmlSpot.spot.description,
                  media_urls: stripMedia
                    ? undefined
                    : item.selectedMediaUrls.length > 0
                    ? item.selectedMediaUrls
                    : undefined,
                  location: kmlSpot.spot.location,
                  bounds: kmlSpot.spot.bounds,
                  type: item.localSpot.type(),
                  access: item.localSpot.access(),
                  amenities: item.localSpot.amenities(),
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
    const viewerMapId = this._extractViewerMapId(
      this.creditsFormGroup?.get("viewerMapIdCtrl")?.value
    );
    const viewerUrl = this._viewerUrlFromMapId(viewerMapId);
    const websiteUrl = viewerUrl;
    const instagramUrl = this._instagramUrlFromHandle(
      this.creditsFormGroup?.get("instagramHandleCtrl")?.value
    );
    const license = this.creditsFormGroup?.get("licenseCtrl")?.value;
    const sourceUrl = this._sanitizeUrl(
      this.creditsFormGroup?.get("autoUpdateUrlCtrl")?.value
    );
    const autoUpdateUrl = this._sanitizeUrl(
      this.creditsFormGroup?.get("autoUpdateUrlCtrl")?.value
    );
    const ownershipPermission = this._hasDirectImportPermission();
    const hasImageRights =
      this.legalFormGroup?.get("imageRightsStatusCtrl")?.value === "yes";
    const strippingMode =
      this._shouldStripDescriptionsForImport() ||
      this._shouldStripMediaForImport();
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
        confirmed_rights: ownershipPermission,
        confirmed_external_image_rights: hasImageRights,
        stripping_consent_confirmed: undefined,
        non_competitor_confirmed: undefined,
        public_abandoned_clause_used: this._isAbandonwareImport(),
      },
      source_url: sourceUrl,
      viewer_url: viewerUrl,
      auto_update_url: autoUpdateUrl,
      stripping_mode: strippingMode,
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

  private _chunkItems<T>(items: T[], chunkSize: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      result.push(items.slice(i, i + chunkSize));
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

  openViewerUrl() {
    const viewerUrl = this._viewerUrlFromMapId(
      this.creditsFormGroup?.get("viewerMapIdCtrl")?.value
    );
    if (!viewerUrl) {
      return;
    }
    if (typeof window !== "undefined") {
      window.open(viewerUrl, "_blank", "noopener,noreferrer");
    }
  }

  openSetupDownloadKmlUrl() {
    const downloadUrl = this.setupDownloadKmlUrl();
    if (!downloadUrl) {
      return;
    }
    if (typeof window !== "undefined") {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }
  }

  private async _removeBrokenSetupMediaUrls(): Promise<{
    checkedUrlCount: number;
    removedUrlCount: number;
    affectedSpotCount: number;
    sampleRemovedUrls: string[];
    unknownUrlCount: number;
    restoredAfterValidation: boolean;
    debugSummary: {
      spots: number;
      spotsWithMediaBefore: number;
      spotsWithMediaAfter: number;
      totalMediaRefsBefore: number;
      totalMediaRefsAfter: number;
      checkedUrlCount: number;
      validUrlCount: number;
      invalidUrlCount: number;
      unknownUrlCount: number;
      restoredAfterValidation: boolean;
    } | null;
  }> {
    const spots = this.kmlParserService.getParsedSpots();
    if (spots.length === 0) {
      return {
        checkedUrlCount: 0,
        removedUrlCount: 0,
        affectedSpotCount: 0,
        sampleRemovedUrls: [],
        unknownUrlCount: 0,
        restoredAfterValidation: false,
        debugSummary: null,
      };
    }

    spots.forEach((spot) => {
      spot.spot.description = this._stripImageContentFromDescription(
        spot.spot.description
      );
    });

    const statsBefore = this._collectMediaStats(spots);

    const uniqueUrls = Array.from(
      new Set(
        spots.flatMap((spot) => spot.spot.mediaUrls ?? []).filter((url) => !!url)
      )
    );
    if (uniqueUrls.length === 0) {
      return {
        checkedUrlCount: 0,
        removedUrlCount: 0,
        affectedSpotCount: 0,
        sampleRemovedUrls: [],
        unknownUrlCount: 0,
        restoredAfterValidation: false,
        debugSummary: {
          spots: statsBefore.spotCount,
          spotsWithMediaBefore: statsBefore.spotsWithMedia,
          spotsWithMediaAfter: statsBefore.spotsWithMedia,
          totalMediaRefsBefore: statsBefore.totalMediaRefs,
          totalMediaRefsAfter: statsBefore.totalMediaRefs,
          checkedUrlCount: 0,
          validUrlCount: 0,
          invalidUrlCount: 0,
          unknownUrlCount: 0,
          restoredAfterValidation: false,
        },
      };
    }

    this.setupMediaValidationProgress.set({
      stage: "Checking image links",
      processed: 0,
      total: uniqueUrls.length,
    });

    const validationMap = await this._validateImageUrls(uniqueUrls, 12);
    const validUrlCount = uniqueUrls.filter(
      (url) => validationMap.get(url) === "valid"
    ).length;
    const invalidUrlCount = uniqueUrls.filter(
      (url) => validationMap.get(url) === "invalid"
    ).length;
    const unknownUrlCount = uniqueUrls.filter(
      (url) => validationMap.get(url) === "unknown"
    ).length;
    let removedUrlCount = 0;
    let affectedSpotCount = 0;
    const removedSamples = new Set<string>();
    const originalMediaBySpot = new Map<KMLSpot, string[]>();

    spots.forEach((spot) => {
      const mediaUrls = spot.spot.mediaUrls ?? [];
      if (mediaUrls.length === 0) {
        return;
      }
      originalMediaBySpot.set(spot, [...mediaUrls]);
      const filteredUrls = mediaUrls
        .filter((url) => validationMap.get(url) !== "invalid")
        .sort((a, b) => {
          const aStatus = validationMap.get(a) ?? "unknown";
          const bStatus = validationMap.get(b) ?? "unknown";
          const rank = (status: SetupMediaValidationStatus) =>
            status === "valid" ? 0 : status === "unknown" ? 1 : 2;
          return rank(aStatus) - rank(bStatus);
        });
      if (filteredUrls.length !== mediaUrls.length) {
        affectedSpotCount += 1;
        const removedForSpot = mediaUrls.filter(
          (url) => validationMap.get(url) === "invalid"
        );
        removedForSpot.forEach((url) => {
          removedUrlCount += 1;
          if (removedSamples.size < 3) {
            removedSamples.add(url);
          }
        });
      }
      spot.spot.mediaUrls = filteredUrls.length > 0 ? filteredUrls : undefined;
    });

    const statsAfter = this._collectMediaStats(spots);
    const restoredAfterValidation =
      statsBefore.totalMediaRefs > 0 &&
      statsAfter.totalMediaRefs === 0 &&
      invalidUrlCount === 0;

    if (restoredAfterValidation) {
      originalMediaBySpot.forEach((urls, spot) => {
        spot.spot.mediaUrls = urls.length > 0 ? [...urls] : undefined;
      });
    }

    const finalStats = restoredAfterValidation
      ? this._collectMediaStats(spots)
      : statsAfter;

    return {
      checkedUrlCount: uniqueUrls.length,
      removedUrlCount: restoredAfterValidation ? 0 : removedUrlCount,
      affectedSpotCount: restoredAfterValidation ? 0 : affectedSpotCount,
      sampleRemovedUrls: restoredAfterValidation
        ? []
        : Array.from(removedSamples),
      unknownUrlCount,
      restoredAfterValidation,
      debugSummary: {
        spots: finalStats.spotCount,
        spotsWithMediaBefore: statsBefore.spotsWithMedia,
        spotsWithMediaAfter: finalStats.spotsWithMedia,
        totalMediaRefsBefore: statsBefore.totalMediaRefs,
        totalMediaRefsAfter: finalStats.totalMediaRefs,
        checkedUrlCount: uniqueUrls.length,
        validUrlCount,
        invalidUrlCount,
        unknownUrlCount,
        restoredAfterValidation,
      },
    };
  }

  private async _validateImageUrls(
    urls: string[],
    concurrency: number
  ): Promise<Map<string, SetupMediaValidationStatus>> {
    const result = new Map<string, SetupMediaValidationStatus>();
    if (urls.length === 0) {
      return result;
    }

    let cursor = 0;
    const workerCount = Math.max(1, Math.min(concurrency, urls.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = cursor;
        cursor += 1;
        if (currentIndex >= urls.length) {
          break;
        }
        const url = urls[currentIndex];
        const status = await this._checkImageUrlExists(url);
        result.set(url, status);
        this.setupMediaValidationProgress.set({
          stage: "Checking image links",
          processed: result.size,
          total: urls.length,
        });
      }
    });

    await Promise.all(workers);
    return result;
  }

  private _checkImageUrlExists(
    url: string,
    timeoutMs: number = 3000
  ): Promise<SetupMediaValidationStatus> {
    if (!url || !/^https?:\/\//i.test(url)) {
      return Promise.resolve("invalid");
    }
    return new Promise<SetupMediaValidationStatus>((resolve) => {
      if (typeof Image === "undefined") {
        resolve("unknown");
        return;
      }

      const image = new Image();
      image.referrerPolicy = "no-referrer";

      let completed = false;
      const finalize = (status: SetupMediaValidationStatus) => {
        if (completed) {
          return;
        }
        completed = true;
        clearTimeout(timeoutId);
        image.onload = null;
        image.onerror = null;
        resolve(status);
      };

      const timeoutId = setTimeout(() => finalize("unknown"), timeoutMs);
      image.onload = () => finalize("valid");
      image.onerror = () => finalize("invalid");
      image.src = url;
    });
  }

  private _collectMediaStats(spots: KMLSpot[]): {
    spotCount: number;
    spotsWithMedia: number;
    totalMediaRefs: number;
  } {
    let spotsWithMedia = 0;
    let totalMediaRefs = 0;
    spots.forEach((spot) => {
      const mediaCount = spot.spot.mediaUrls?.length ?? 0;
      if (mediaCount > 0) {
        spotsWithMedia += 1;
        totalMediaRefs += mediaCount;
      }
    });
    return {
      spotCount: spots.length,
      spotsWithMedia,
      totalMediaRefs,
    };
  }

  private _stripImageContentFromDescription(
    description: string | undefined
  ): string | undefined {
    const value = (description ?? "").trim();
    if (!value) {
      return undefined;
    }

    let cleaned = value;
    try {
      const html = new DOMParser().parseFromString(value, "text/html");
      html.querySelectorAll("img").forEach((img) => img.remove());
      html.querySelectorAll("a[href]").forEach((anchor) => {
        const href = (anchor.getAttribute("href") ?? "").trim();
        if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(href)) {
          anchor.remove();
        }
      });
      cleaned = html.body.innerHTML;
    } catch {
      cleaned = value;
    }

    cleaned = cleaned
      .replace(
        /https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?/gi,
        ""
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return cleaned.length > 0 ? cleaned : undefined;
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
