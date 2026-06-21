import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { Timestamp } from "firebase/firestore";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotEdit } from "../../../db/models/SpotEdit";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotEditDetailsComponent } from "./spot-edit-details.component";

describe("SpotEditDetailsComponent", () => {
  let spotEditsService: {
    getSpotEditVoteByUserId$: ReturnType<typeof vi.fn>;
    setSpotEditVote: ReturnType<typeof vi.fn>;
    reviewVerifiedSpotEdit: ReturnType<typeof vi.fn>;
  };
  let organizationsService: {
    getReviewerOrganizations: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    spotEditsService = {
      getSpotEditVoteByUserId$: vi.fn(() => of(null)),
      setSpotEditVote: vi.fn(),
      reviewVerifiedSpotEdit: vi.fn().mockResolvedValue(undefined),
    };
    organizationsService = {
      getReviewerOrganizations: vi.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [SpotEditDetailsComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        {
          provide: AuthenticationService,
          useValue: {
            isSignedIn: true,
            user: {
              uid: "reviewer-user",
              data: {
                uid: "reviewer-user",
                display_name: "Reviewer",
              },
            },
          },
        },
        { provide: SpotEditsService, useValue: spotEditsService },
        { provide: OrganizationsService, useValue: organizationsService },
      ],
    }).compileComponents();

  });

  it("shows organization review actions to reviewers", async () => {
    organizationsService.getReviewerOrganizations.mockResolvedValue([
      { id: "wpf", name: "World's Parkour Family" },
    ]);
    const fixture = createFixture();
    fixture.componentRef.setInput("spotId", "spot-1");
    fixture.componentRef.setInput("spotEdit", makeOrganizationReviewEdit());

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const buttonText = getButtonText(fixture);
    expect(buttonText).toContain("Approve");
    expect(buttonText).toContain("Reject");
    expect(buttonText).not.toContain("Yes");
    expect(buttonText).not.toContain("No");

    clickButton(fixture, "Approve");
    await fixture.whenStable();

    expect(spotEditsService.reviewVerifiedSpotEdit).toHaveBeenCalledWith(
      "spot-1",
      "edit-1",
      "approve"
    );
  });

  it("hides merge vote buttons for organization review edits when the user cannot review", async () => {
    const fixture = createFixture();
    fixture.componentRef.setInput("spotId", "spot-1");
    fixture.componentRef.setInput("spotEdit", makeOrganizationReviewEdit());

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const buttonText = getButtonText(fixture);
    expect(buttonText).not.toContain("Approve");
    expect(buttonText).not.toContain("Reject");
    expect(buttonText).not.toContain("Yes");
    expect(buttonText).not.toContain("No");
    expect(fixture.nativeElement.textContent).toContain(
      "Waiting for an organization reviewer."
    );
  });
});

function createFixture(): ComponentFixture<SpotEditDetailsComponent> {
  return TestBed.createComponent(SpotEditDetailsComponent);
}

function makeOrganizationReviewEdit(): SpotEdit {
  const edit: SpotEditSchema = {
    type: "UPDATE",
    timestamp: Timestamp.fromMillis(1_718_800_000_000),
    timestamp_raw_ms: 1_718_800_000_000,
    approved: false,
    visibility: "private",
    review_status: "pending",
    review_organization_ids: ["wpf"],
    review_kind: "stewarded",
    user: {
      uid: "submitter-user",
      display_name: "Submitter",
    },
    data: {
      type: SpotTypes.PkPark,
    },
    prevData: {
      type: SpotTypes.School,
    },
    vote_summary: {
      yes_count: 0,
      no_count: 1,
      total_count: 1,
      ratio_yes_to_no: 0,
      submitter_vote: null,
      eligible_for_auto_approval: false,
    },
  };
  return new SpotEdit("edit-1", edit);
}

function getButtonText(
  fixture: ComponentFixture<SpotEditDetailsComponent>
): string {
  return Array.from(
    fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLElement>
  )
    .map((button) => button.textContent?.trim() ?? "")
    .join(" ");
}

function clickButton(
  fixture: ComponentFixture<SpotEditDetailsComponent>,
  label: string
): void {
  const button = Array.from(
    fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLElement>
  ).find((element) => element.textContent?.includes(label));

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  button.click();
  fixture.detectChanges();
}
