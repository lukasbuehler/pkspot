import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatRadioModule } from "@angular/material/radio";
import { By } from "@angular/platform-browser";
import { SpotReportSchema } from "../../../db/schemas/SpotReportSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { SpotReportsService } from "../../services/firebase/firestore/spot-reports.service";
import { EntityReferenceOption } from "../entity-reference-autocomplete/entity-reference-autocomplete.component";
import { SpotReportDialogComponent } from "./spot-report-dialog.component";

@Component({
  selector: "app-entity-reference-autocomplete",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EntityReferenceAutocompleteStub {
  readonly kind = input.required<string>();
  readonly value = input("");
  readonly excludedIds = input<string[]>([]);
  readonly disabled = input(false);
  readonly selectionChange = output<EntityReferenceOption | null>();
}

describe("SpotReportDialogComponent", () => {
  let fixture: ComponentFixture<SpotReportDialogComponent>;
  const dialogRef = { close: vi.fn() };
  const spotReports = { addSpotReport: vi.fn() };
  const report = {
    spot: { id: "reported-id", name: "Reported Spot" },
    reason: "duplicate",
    user: { uid: "reporter-id" },
  } as SpotReportSchema;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete report.duplicateOf;
    TestBed.configureTestingModule({
      imports: [SpotReportDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: report },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: SpotReportsService, useValue: spotReports },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(SpotReportDialogComponent, {
      set: {
        imports: [
          FormsModule,
          MatButtonModule,
          MatDialogActions,
          MatDialogContent,
          MatDialogTitle,
          MatRadioModule,
          EntityReferenceAutocompleteStub,
        ],
      },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(SpotReportDialogComponent);
    await fixture.whenStable();
  });

  it("uses the Spot autocomplete and excludes the reported Spot", () => {
    const autocomplete = fixture.debugElement.query(
      By.directive(EntityReferenceAutocompleteStub),
    ).componentInstance as EntityReferenceAutocompleteStub;

    expect(autocomplete.kind()).toBe("spot");
    expect(autocomplete.excludedIds()).toEqual(["reported-id"]);
  });

  it("stores the canonical selected Spot reference and requires it", async () => {
    const component = fixture.componentInstance;
    const autocomplete = fixture.debugElement.query(
      By.directive(EntityReferenceAutocompleteStub),
    ).componentInstance as EntityReferenceAutocompleteStub;
    expect(component.canSubmit()).toBe(false);

    autocomplete.selectionChange.emit({
      id: "duplicate-slug",
      label: "Duplicate Spot",
      subtitle: "Basel",
      spotPreview: {
        id: "duplicate-id" as never,
        slug: "duplicate-slug",
        name: "Duplicate Spot",
        locality: "Basel",
        imageSrc: "",
        isIconic: false,
      },
    });
    spotReports.addSpotReport.mockResolvedValue("report-id");

    expect(report.duplicateOf).toEqual({
      id: "duplicate-id",
      name: "Duplicate Spot",
    });
    expect(component.canSubmit()).toBe(true);
    await component.submitReport();

    expect(spotReports.addSpotReport).toHaveBeenCalledWith(report);
    expect(dialogRef.close).toHaveBeenCalledWith({
      report,
      reportId: "report-id",
    });
  });

  it("clears an obsolete duplicate reference when another reason is chosen", () => {
    const component = fixture.componentInstance;
    report.duplicateOf = { id: "duplicate-id", name: "Duplicate Spot" };

    component.onReasonChange("private");

    expect(report.duplicateOf).toBeUndefined();
    expect(component.duplicateSpotId()).toBe("");
  });
});
