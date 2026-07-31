export type SpotEditOutcome = "approved" | "rejected";
export type SpotEditDecisionSource =
  | "automatic_immediate"
  | "community_vote"
  | "organization_review";

export interface SpotEditNotificationState {
  approved?: boolean;
  review_status?: "pending" | "approved" | "rejected";
  processing_status?: string;
  decision_source?: SpotEditDecisionSource;
}

export function spotEditOutcome(
  edit: SpotEditNotificationState | null,
): SpotEditOutcome | null {
  if (!edit) return null;
  if (edit.review_status === "rejected") return "rejected";
  if (edit.approved === true || edit.review_status === "approved") {
    return "approved";
  }
  return null;
}

export function spotEditDecisionSource(
  edit: SpotEditNotificationState,
): SpotEditDecisionSource | null {
  if (edit.decision_source) return edit.decision_source;
  if (
    edit.processing_status === "APPROVED_ORG_REVIEW" ||
    edit.processing_status === "REJECTED_ORG_REVIEW"
  ) {
    return "organization_review";
  }
  if (edit.processing_status === "APPROVED_VOTING") return "community_vote";
  if (edit.processing_status === "APPROVED_IMMEDIATE") {
    return "automatic_immediate";
  }
  return null;
}

export function shouldNotifySpotEditOutcome(
  before: SpotEditNotificationState | null,
  after: SpotEditNotificationState,
): boolean {
  const outcome = spotEditOutcome(after);
  const source = spotEditDecisionSource(after);
  return Boolean(
    outcome &&
      outcome !== spotEditOutcome(before) &&
      (source === "organization_review" || source === "community_vote"),
  );
}
