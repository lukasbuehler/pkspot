import { describe, expect, it } from "vitest";
import { shouldNotifySpotEditOutcome } from "../functions/src/spotEditNotificationPolicy";

describe("Spot edit notification policy", () => {
  const pending = { approved: false, review_status: "pending" as const };

  it("silences immediately auto-approved edits", () => {
    expect(
      shouldNotifySpotEditOutcome(pending, {
        approved: true,
        processing_status: "APPROVED_IMMEDIATE",
      }),
    ).toBe(false);
  });

  it("notifies completed voting and organization review outcomes", () => {
    expect(
      shouldNotifySpotEditOutcome(pending, {
        approved: true,
        processing_status: "APPROVED_VOTING",
      }),
    ).toBe(true);
    expect(
      shouldNotifySpotEditOutcome(pending, {
        approved: true,
        decision_source: "organization_review",
      }),
    ).toBe(true);
    expect(
      shouldNotifySpotEditOutcome(pending, {
        approved: false,
        review_status: "rejected",
        processing_status: "REJECTED_ORG_REVIEW",
      }),
    ).toBe(true);
  });

  it("does not repeat an unchanged outcome", () => {
    expect(
      shouldNotifySpotEditOutcome(
        { approved: true, processing_status: "APPROVED_VOTING" },
        { approved: true, processing_status: "APPROVED_VOTING" },
      ),
    ).toBe(false);
  });
});
