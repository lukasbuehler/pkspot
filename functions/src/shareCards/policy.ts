import { ShareCardKind } from "./render";

/** Share clicks alone schedule generation. Ratings never gate sharing. */
export function shouldPrepareShareCard(input: {
  kind: ShareCardKind;
  publiclyDiscoverable: boolean;
  trigger: "content_changed" | "share_dialog";
}): boolean {
  return input.publiclyDiscoverable && input.trigger === "share_dialog";
}
