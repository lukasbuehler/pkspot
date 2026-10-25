import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
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
import { UsersService } from "../../services/firebase/firestore/users.service";
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
  let usersService: {
    getUserRefernceById: ReturnType<typeof vi.fn>;
  };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    spotEditsService = {
      getSpotEditVoteByUserId$: vi.fn(() => of(null)),
      setSpotEditVote: vi.fn().mockResolvedValue(undefined),
      reviewVerifiedSpotEdit: vi.fn().mockResolvedValue(undefined),
    };
    organizationsService = {
      getReviewerOrganizations: vi.fn().mockResolvedValue([]),
    };
    usersService = {
      getUserRefernceById: vi.fn().mockResolvedValue(null),
    };
    snackBar = { open: vi.fn() };

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
        { provide: UsersService, useValue: usersService },
        { provide: MatSnackBar, useValue: snackBar },
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

  it("hydrates email-like submitter names from the current profile", async () => {
    usersService.getUserRefernceById.mockResolvedValueOnce({
      uid: "submitter-user",
      display_name: "Submitter Name",
    });
    const fixture = createFixture();
    fixture.componentRef.setInput("spotId", "spot-1");
    fixture.componentRef.setInput(
      "spotEdit",
      makeOrganizationReviewEdit("person@example.test")
    );

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain(
      "person@example.test"
    );

    await fixture.whenStable();
    fixture.detectChanges();

    expect(usersService.getUserRefernceById).toHaveBeenCalledWith(
      "submitter-user"
    );
    expect(fixture.nativeElement.textContent).toContain("Submitter Name");
    expect(fixture.nativeElement.textContent).not.toContain(
      "person@example.test"
    );
  });

  it("confirms a community vote immediately while the aggregate refreshes", async () => {
    const fixture = createFixture();
    fixture.componentRef.setInput("spotId", "spot-1");
    fixture.componentRef.setInput("spotEdit", makeCommunityVoteEdit());

    fixture.detectChanges();
    await fixture.whenStable();

    clickButton(fixture, "Yes");
    await fixture.whenStable();
    fixture.detectChanges();

    const yesButton = Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>
    ).find((button) => button.textContent?.includes("Yes"));
    expect(yesButton?.classList.contains("vote-selected")).toBe(true);
    expect(spotEditsService.setSpotEditVote).toHaveBeenCalledWith(
      "spot-1",
      "community-vote",
      1,
      expect.objectContaining({ uid: "reviewer-user" })
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      "Vote recorded",
      undefined,
      { duration: 2200 }
    );
  });
});

function createFixture(): ComponentFixture<SpotEditDetailsComponent> {
  return TestBed.createComponent(SpotEditDetailsComponent);
}

function makeOrganizationReviewEdit(displayName = "Submitter"): SpotEdit {
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
      display_name: displayName,
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

function makeCommunityVoteEdit(): SpotEdit {
  const edit: SpotEditSchema = {
    type: "UPDATE",
    timestamp: Timestamp.fromMillis(1_718_800_000_000),
    timestamp_raw_ms: 1_718_800_000_000,
    approved: false,
    visibility: "public",
    processing_status: "VOTING_OPEN",
    user: {
      uid: "submitter-user",
      display_name: "Submitter",
    },
    data: {
      type: SpotTypes.PkPark,
    },
    vote_summary: {
      yes_count: 0,
      no_count: 0,
      total_count: 0,
      ratio_yes_to_no: null,
      submitter_vote: null,
      eligible_for_auto_approval: false,
    },
  };
  return new SpotEdit("community-vote", edit);
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
