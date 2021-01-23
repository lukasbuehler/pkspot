import { STEPPER_GLOBAL_OPTIONS } from "@angular/cdk/stepper";
import { AfterViewInit, Component, OnInit, ViewChild } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { MatHorizontalStepper } from "@angular/material/stepper";
import { KmlParserService, KMLSetupInfo } from "../kml-parser.service";

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
})
export class KmlImportPageComponent implements OnInit, AfterViewInit {
  @ViewChild("stepperHorizontal") stepperHorizontal;

  uploadFormGroup: FormGroup;
  setupFormGroup: FormGroup;

  kmlUploadFile: File = null;
  kmlSetupInfo: KMLSetupInfo;

  languages: string[] = [
    "English (en)",
    "Deutsch (de)",
    "Schwiizerdütsch (de-CH)",
  ];

  constructor(
    private _formBuilder: FormBuilder,
    private _kmlParserService: KmlParserService
  ) {}

  ngOnInit(): void {
    this.uploadFormGroup = this._formBuilder.group({
      uploadCtrl: ["", Validators.required],
    });
    this.setupFormGroup = this._formBuilder.group({
      setupLangCtrl: ["", Validators.required],
      setupRegexCtrl: ["", [Validators.required]],
    });
  }

  ngAfterViewInit(): void {
    //Called after ngAfterContentInit when the component's view has been initialized. Applies to components only.
    //Add 'implements AfterViewInit' to the class.
    // set a step for debug stuff:
    //this.stepperHorizontal.selectedIndex = 2; // go to the step directly
  }

  onUploadMediaSelect(file) {
    this.kmlUploadFile = file;
  }

  continueToSetup() {
    if (!this.kmlUploadFile) {
      // the file doesn't exist
      console.error("The KML file was not set properly or is invalid!");
      return;
    }
    this.kmlUploadFile.text().then(
      (data) => {
        this._kmlParserService.parseKMLString$(data).subscribe(
          () => {
            // parsing was successful
            this.stepperHorizontal.next();

            this._kmlParserService.getKMLPreviewInfo().subscribe(
              (kmlSetupInfo: KMLSetupInfo) => {
                this.kmlSetupInfo = kmlSetupInfo;
              },
              (error) => {
                console.error(error);
              }
            );
          },
          (error) => {
            // parsing was not successful
            console.error(error);
          }
        );
      },
      (reason) => {}
    );
  }

  startImport() {}

  abortImportAndGoToSetup() {}
}
