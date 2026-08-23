import type { InAppNotificationType } from "../../db/schemas/NotificationSchema";

interface NotificationNavigationData {
  type?: InAppNotificationType | string;
  path?: unknown;
  payload?: Record<string, unknown>;
}

/** Resolves both current notification links and known links from older app releases. */
export function resolveNotificationPath(
  data: NotificationNavigationData,
): string {
  const payload = data.payload ?? (data as Record<string, unknown>);
  const path = safeAppPath(data.path);

  if (data.type === "community_spot_digest") {
    const topSpotPath = safeAppPath(payload["top_spot_path"]);
    if (topSpotPath) return topSpotPath;

    const firstSpotId = firstStringFromJsonArray(payload["spot_ids"]);
    if (firstSpotId) {
      return `/map/spots/${encodeURIComponent(firstSpotId)}`;
    }

    // Older digest notifications linked to the feature-gated training page.
    if (path === "/train") return "/map";
  }

  return path ?? "/notifications";
}

function safeAppPath(value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : null;
}

function firstStringFromJsonArray(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    const first = Array.isArray(parsed) ? parsed[0] : null;
    return typeof first === "string" && first ? first : null;
  } catch {
    return null;
  }
}
