import { UserSocialsSchema } from "../../db/schemas/UserSchema";

export type NormalizedProfileSocials = Pick<
  UserSocialsSchema,
  | "instagram_handle"
  | "youtube_handle"
  | "tiktok_handle"
  | "discord_url"
>;

export function normalizeProfileSocials(
  socials?: UserSocialsSchema | null
): NormalizedProfileSocials {
  return {
    instagram_handle:
      normalizeInstagramHandle(socials?.instagram_handle) ?? undefined,
    youtube_handle:
      normalizeYoutubeHandle(socials?.youtube_handle) ?? undefined,
    tiktok_handle:
      normalizeTikTokHandle(socials?.tiktok_handle) ?? undefined,
    discord_url: normalizeDiscordUrl(socials?.discord_url) ?? undefined,
  };
}

export function buildInstagramProfileUrl(value?: string | null): string | null {
  const handle = normalizeInstagramHandle(value);
  return handle ? `https://instagram.com/${handle}` : null;
}

export function buildYouTubeProfileUrl(value?: string | null): string | null {
  const handle = normalizeYoutubeHandle(value);
  if (!handle) {
    return null;
  }

  return /^https?:\/\//i.test(handle)
    ? normalizeExternalUrl(handle)
    : `https://www.youtube.com/${handle}`;
}

export function buildTikTokProfileUrl(value?: string | null): string | null {
  const handle = normalizeTikTokHandle(value);
  return handle ? `https://www.tiktok.com/@${handle}` : null;
}

export function normalizeInstagramHandle(
  value?: string | null
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const urlHandle = firstPathSegmentFromUrl(trimmed);
  const handle = (urlHandle ?? trimmed)
    .replace(/^@+/, "")
    .split("/")[0]
    .trim();
  return handle || null;
}

export function normalizeYoutubeHandle(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const pathParts = parsed.pathname
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);

      if (pathParts.length === 0) {
        return null;
      }

      if (pathParts[0].startsWith("@")) {
        return pathParts[0];
      }

      if (["channel", "c", "user"].includes(pathParts[0]) && pathParts[1]) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }

      return pathParts.join("/");
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("@")) {
    return trimmed;
  }

  return trimmed.includes("/") ? trimmed : `@${trimmed}`;
}

export function normalizeTikTokHandle(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (!isHost(parsed, "tiktok.com")) {
        return null;
      }
      candidate = firstPathSegment(parsed.pathname) ?? "";
    } catch {
      return null;
    }
  }

  const handle = candidate.replace(/^@+/, "").split("/")[0].trim();
  return handle || null;
}

export function normalizeDiscordUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^[A-Za-z0-9_-]+$/.test(trimmed)
    ? `https://discord.gg/${trimmed}`
    : /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (
      parsed.hostname.toLowerCase() !== "discord.gg" &&
      !isHost(parsed, "discord.com")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function firstPathSegmentFromUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) {
    return null;
  }

  try {
    return firstPathSegment(new URL(value).pathname);
  } catch {
    return null;
  }
}

function firstPathSegment(pathname: string): string | null {
  return (
    pathname
      .split("/")
      .map((segment) => segment.trim())
      .find(Boolean) ?? null
  );
}

function isHost(url: URL, domain: string): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === domain || hostname.endsWith(`.${domain}`);
}
