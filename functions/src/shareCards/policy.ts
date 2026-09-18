import { ShareCardKind } from "./render";

/** Scheduling policy only. A trusted caller must derive public eligibility,
 * including profile-discovery eligibility, from canonical server-owned data. */
export function shouldPrepareShareCard(input: {
  kind: ShareCardKind;
  publiclyDiscoverable: boolean;
  trigger: "content_changed" | "share_dialog";
  rating?: number;
  featured?: boolean;
}): boolean {
  if (!input.publiclyDiscoverable) return false;
  if (input.trigger === "share_dialog") return true;
  if (input.kind === "event" || input.kind === "page") return true;
  if (input.kind === "spot") return input.featured === true ||
    (Number.isFinite(input.rating) && input.rating! >= 2 && input.rating! <= 5);
  // Bulk community generation is deferred; profiles start with explicit sharing.
  return false;
}
