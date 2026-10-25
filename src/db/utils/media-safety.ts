import type { MediaSafetySeverity } from "../schemas/MediaModerationSchema";

/** Classify likelihoods, not legality or the age of anyone depicted. */
export function classifySafeSearch(labels: Record<string, string>): MediaSafetySeverity {
  const flagged = (name: string) => ["LIKELY", "VERY_LIKELY"].includes(labels[name]);
  if (flagged("adult")) return "adult_content";
  if (flagged("violence")) return "graphic_violence";
  if (flagged("racy")) return "suggestive";
  return "none";
}
