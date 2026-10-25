import type { MediaSafetyScanSchema } from "../../db/schemas/MediaReportSchema";
import type { MediaUploadReviewSchema } from "../../db/schemas/MediaUploadReviewSchema";
import { classifySafeSearch } from "../../db/utils/media-safety";

export const mediaReviewStatusLabels: Record<MediaUploadReviewSchema["status"], string> = {
  scanning: $localize`Scanning`,
  approved: $localize`Approved`,
  dismissed: $localize`False positive`,
  needs_review: $localize`Needs review`,
  blocked: $localize`Blocked`,
  scan_failed: $localize`Scan failed`,
  audit_flagged: $localize`Existing media flagged`,
};

export const mediaSafetyLabels = {
  none: $localize`No safety flag`,
  suggestive: $localize`Potentially suggestive content`,
  adult_content: $localize`Potentially adult content`,
  graphic_violence: $localize`Potentially violent content`,
  explicit_non_child: $localize`Potentially explicit or violent content`,
  possible_child_safety: $localize`Possible child safety concern`,
  known_csam_match: $localize`Restricted child safety match`,
};

const descriptions = {
  none: $localize`The automated scan did not flag this media.`,
  suggestive: $localize`The scanner detected a potentially suggestive pose or presentation. This does not establish explicit nudity or illegal content.`,
  adult_content: $localize`The scanner detected potentially sexual or adult imagery. A human review is required.`,
  graphic_violence: $localize`The scanner detected potentially violent imagery. A human review is required.`,
  explicit_non_child: $localize`An older scan used a combined category for suggestive, adult, or violent imagery. Review the individual likelihoods.`,
  possible_child_safety: $localize`Escalate this concern to the incident workflow for restricted assessment.`,
  known_csam_match: $localize`Do not preview or release this media. Continue through the restricted incident workflow.`,
};

export function mediaSafetyPresentation(scan: MediaSafetyScanSchema | undefined) {
  let severity = scan?.severity;
  // Older scans called all three flags explicit_non_child. Refine their display
  // from the original likelihoods without rewriting the stored evidence.
  if (severity === "explicit_non_child" && scan?.labels) {
    const classified = classifySafeSearch(scan.labels);
    if (classified !== "none") severity = classified;
  }
  return {
    label: severity ? mediaSafetyLabels[severity] : undefined,
    description: severity ? descriptions[severity] : undefined,
  };
}

export const safeSearchLabelNames: Record<string, string> = {
  adult: $localize`Adult content`, racy: $localize`Suggestive content`,
  violence: $localize`Violence`, medical: $localize`Medical imagery`,
  spoof: $localize`Spoof or manipulated imagery`,
};
export const safeSearchLikelihoodLabels: Record<string, string> = {
  UNKNOWN: $localize`Unknown`, VERY_UNLIKELY: $localize`Very unlikely`,
  UNLIKELY: $localize`Unlikely`, POSSIBLE: $localize`Possible`,
  LIKELY: $localize`Likely`, VERY_LIKELY: $localize`Very likely`,
};
