import type { OwnReportSummary } from "../../db/schemas/ReportLifecycleSchema";

export const reportStatusLabels: Record<OwnReportSummary["status"], string> = {
  open: $localize`Open`,
  resolved: $localize`Resolved`,
  dismissed: $localize`Dismissed`,
  withdrawn: $localize`Withdrawn`,
};
const reasonLabels: Record<string, string> = {
  duplicate: $localize`Duplicate`,
  "torn down": $localize`Torn down`,
  "does not exist": $localize`Does not exist`,
  private: $localize`Private Spot`,
  other: $localize`Other`,
  "illegal or unsafe content": $localize`Illegal or unsafe content`,
  "copyright infringement": $localize`Copyright infringement`,
  "person did not consent": $localize`Person did not consent`,
  "tos violation": $localize`Terms of service violation`,
  "not relevant": $localize`Not relevant`,
  "bad quality": $localize`Bad quality`,
};
export function reportReasonsLabel(reasons: readonly string[]): string {
  return reasons.map((reason) => reasonLabels[reason] ?? $localize`Other`).join(", ");
}
