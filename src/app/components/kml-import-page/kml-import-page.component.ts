import { STEPPER_GLOBAL_OPTIONS } from "@angular/cdk/stepper";
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Inject,
  LOCALE_ID,
  OnInit,
  ViewChild,
} from "@angular/core";
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
  MatStepperNext,
  MatStepperPrevious,
} from "@angular/material/stepper";
import {
  KmlParserService,
  KMLSetupInfo,
  KMLSpot,
} from "../../services/kml-parser.service";
import { filter, first, firstValueFrom } from "rxjs";
import {
  MyRegex,
  RegexInputComponent,
} from "../regex-input/regex-input.component";
import { LocalSpot } from "../../../db/models/Spot";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { GeoPoint } from "firebase/firestore";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import { MatDivider } from "@angular/material/divider";
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
} from "@angular/material/expansion";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { MatTooltip } from "@angular/material/tooltip";
import { MatOption } from "@angular/material/core";
import {
  MatAutocompleteTrigger,
  MatAutocomplete,
} from "@angular/material/autocomplete";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatSuffix,
  MatHint,
  MatError,
} from "@angular/material/form-field";
import { NgIf, AsyncPipe } from "@angular/common";
import { MatButton } from "@angular/material/button";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MatIcon } from "@angular/material/icon";
import { locale } from "core-js";
import { LocaleCode } from "../../../db/models/Interfaces";
import { SpotSchema } from "../../../db/schemas/SpotSchema";
import { MarkerSchema } from "../marker/marker.component";

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
    NgIf,
    MatFormField,
    MatLabel,
    MatInput,
    MatAutocompleteTrigger,
    MatAutocomplete,
    MatOption,
    MatSuffix,
    MatTooltip,
    MatSlideToggle,
    RegexInputComponent,
    MatHint,
    MatError,
    MatCheckbox,
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatDivider,
    SpotMapComponent,
    MatStepperNext,
    MatStepperPrevious,
    AsyncPipe,
  ],
})
export class KmlImportPageComponent implements OnInit, AfterViewInit {
  @ViewChild("stepperHorizontal") stepperHorizontal: MatStepper | undefined;
  @ViewChild("spotMap") spotMap: SpotMapComponent | undefined;

  uploadFormGroup?: UntypedFormGroup;
  setupFormGroup?: UntypedFormGroup;

  kmlUploadFile: File | null = null;

  private _selectedVerificationSpot: KMLSpot | null = null;
  get selectedVerificationSpot(): KMLSpot | null {
    return this._selectedVerificationSpot;
  }
  set selectedVerificationSpot(value: KMLSpot | null) {
    this._selectedVerificationSpot = value;

    if (!this.spotMap || !this._selectedVerificationSpot) return;

    this.spotMap.focusPoint(this._selectedVerificationSpot.spot.location);
  }

  languages: LocaleCode[] = ["en", "de", "de-CH"]; // TODO make readable

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    public kmlParserService: KmlParserService,
    private _formBuilder: UntypedFormBuilder,
    private _spotsService: SpotsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.uploadFormGroup = this._formBuilder.group({
      uploadCtrl: ["", Validators.required],
    });
    this.setupFormGroup = this._formBuilder.group({
      setupLangCtrl: ["", Validators.required],
      setupRegexCtrl: ["", []],
    });
  }

  regexEnabled: boolean = false;
  regexValue: RegExp | null = null;

  setRegexEnabled(enabled: boolean) {
    if (!this.kmlParserService.setupInfo) {
      console.error("setupInfo is invalid");
      return;
    }

    this.regexEnabled = enabled;
    if (!enabled) {
      this.kmlParserService.setupInfo.regex = null;
    } else {
      this.kmlParserService.setupInfo.regex = this.regexValue;
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

    return spots.map((spot) => {
      return {
        color: "tertiary",
        location: spot.spot.location,
      };
    });
  }

  continueToSetup() {
    if (!this.kmlUploadFile) {
      // the file doesn't exist
      console.error("The KML file was not set properly or is invalid!");
      return;
    }
    this.kmlUploadFile.text().then((data) => {
      this.kmlParserService.parseKMLFromString(data).then(
        () => {
          if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
            console.error("stepperHorizontal is not defined");
            return;
          }
          // parsing was successful
          this.stepperHorizontal.selected.completed = true;
          this.stepperHorizontal.next();
          //this.cdr.detectChanges();
        },
        (error) => {
          // parsing was not successful
          console.error(error);
        }
      );
    });
  }

  continueToVerification() {
    this.kmlParserService.confirmSetup().then(() => {
      if (!this.stepperHorizontal || !this.stepperHorizontal.selected) {
        console.error("stepperHorizontal is not defined");
        return;
      }

      this.stepperHorizontal.selected.completed = true; // TODO move
      this.stepperHorizontal.next();

      firstValueFrom(
        this.kmlParserService.spotsToImport$.pipe(
          filter((spots) => spots && spots.length > 0), // Ignore null, undefined, or empty arrays
          first() // Take only the first non-null and non-empty array
        )
      ).then((spots) => {
        if (spots.length > 0 && !this.selectedVerificationSpot) {
          this.selectedVerificationSpot = spots[0];
          console.log("Selected spot: ", this.selectedVerificationSpot);
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
      const spotsData: SpotSchema[] = kmlSpots.map((kmlSpot: KMLSpot) => {
        const spot = new LocalSpot(
          {
            name: { [this.locale]: kmlSpot.spot.name.trim() },
            location: new GeoPoint(
              kmlSpot.spot.location.lat,
              kmlSpot.spot.location.lng
            ),
            address: null,
          },
          this.locale
        );
        return spot.data();
      });

      this._spotsService.createMultipleSpots(spotsData).then(
        () => {
          // saving successful
          this._spotImportSuccessful();
        },
        (error) => {
          // saving failed
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
