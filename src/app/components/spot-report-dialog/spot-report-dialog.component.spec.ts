import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { By } from "@angular/platform-browser";
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
  const dialogRef = { close: vi.fn(), disableClose: false };
  const spotReports = {
    submitSpotReport: vi.fn(),
    withdrawOwnSpotReport: vi.fn(),
  };
  const data = {spotId: "reported-id", spotName: "Reported Spot"};

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [SpotReportDialogComponent],
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: data},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: SpotReportsService, useValue: spotReports},
        {provide: AnalyticsService, useValue: {trackEvent: vi.fn()}},
      ],
    });
    TestBed.overrideComponent(SpotReportDialogComponent, {
      set: {
        imports: [
          FormsModule,
          MatButtonModule,
          MatCheckboxModule,
          MatDialogActions,
          MatDialogContent,
          MatDialogTitle,
          MatFormFieldModule,
          MatInputModule,
          EntityReferenceAutocompleteStub,
        ],
      },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(SpotReportDialogComponent);
    await fixture.whenStable();
  });

  it("uses the Spot autocomplete and excludes the reported Spot", () => {
    const component = fixture.componentInstance;
    component.toggleReason("duplicate", true);
    fixture.detectChanges();
    const autocomplete = fixture.debugElement.query(
      By.directive(EntityReferenceAutocompleteStub),
    ).componentInstance as EntityReferenceAutocompleteStub;

    expect(autocomplete.kind()).toBe("spot");
    expect(autocomplete.excludedIds()).toEqual(["reported-id"]);
  });

  it("submits multiple reasons with the canonical duplicate reference", async () => {
    const component = fixture.componentInstance;
    component.toggleReason("duplicate", true);
    component.toggleReason("private", true);
    fixture.detectChanges();
    const autocomplete = fixture.debugElement.query(
      By.directive(EntityReferenceAutocompleteStub),
    ).componentInstance as EntityReferenceAutocompleteStub;
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
    spotReports.submitSpotReport.mockResolvedValue({reportId: "report-id", created: true});

    expect(component.canSubmit()).toBe(true);
    await component.submitReport();

    expect(spotReports.submitSpotReport).toHaveBeenCalledWith({
      spotId: "reported-id",
      reasons: ["duplicate", "private"],
      comment: "",
      duplicateOf: {id: "duplicate-id", name: "Duplicate Spot"},
    });
    expect(dialogRef.close).toHaveBeenCalledWith({reportId: "report-id", created: true});
  });

  it("requires details for Other", () => {
    const component = fixture.componentInstance;
    component.toggleReason("other", true);
    expect(component.canSubmit()).toBe(false);
    component.comment.set("The obstacle was replaced.");
    expect(component.canSubmit()).toBe(true);
  });
});
