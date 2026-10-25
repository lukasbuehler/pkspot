export type ShareCardKind = "spot" | "event" | "community" | "profile";
export interface ShareCardTarget { kind: ShareCardKind; id: string }

/** Only entity detail pages. Sessions, logs, editing and account routes are excluded. */
export function shareCardTargetFromPath(path: string): ShareCardTarget | null {
  const clean = path.split(/[?#]/)[0].replace(/^\/(en|de|fr|it|es|nl)(?=\/|$)/, "");
  const match = /^(?:\/map\/(spots|communities)|\/(events|u))\/([\w:.-]+)\/?$/.exec(clean);
  if (!match || ["new", "create", "suggest", "session"].includes(match[3])) return null;
  return { kind: match[1] === "spots" ? "spot" : match[1] === "communities" ? "community" : match[2] === "events" ? "event" : "profile", id: match[3] };
}
export function shareCardImageUrl(projectId: string, target: ShareCardTarget, alias = false): string {
  return `https://europe-west1-${projectId}.cloudfunctions.net/shareCardImage?kind=${target.kind}&id=${encodeURIComponent(target.id)}${alias ? "&alias=1" : ""}`;
}
