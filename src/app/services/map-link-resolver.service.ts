import { Injectable, inject } from "@angular/core";
import { AnalyticsService } from "./analytics.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

export type MapLinkProvider = "google" | "apple";

export interface MapLinkResolution {
  provider: MapLinkProvider;
  format: "direct" | "short";
  placeId?: string;
  query?: string;
  location?: google.maps.LatLngLiteral;
}

interface ShortLinkResponse {
  finalUrl: string;
}

const GOOGLE_HOST_PATTERN = /^(?:(?:www|maps)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/u;
const GOOGLE_SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

const isGoogleMapsPath = (url: URL): boolean =>
  url.pathname === "/maps" || url.pathname.startsWith("/maps/");

const isGoogleShortLink = (url: URL): boolean => {
  const host = url.hostname.toLowerCase();
  return (
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && isGoogleMapsPath(url))
  );
};

@Injectable({ providedIn: "root" })
export class MapLinkResolverService {
  private readonly functions = inject(FunctionsAdapterService);
  private readonly analytics = inject(AnalyticsService);

  isSupportedUrl(value: string): boolean {
    const url = this.toUrl(value);
    return !!url && this.providerFor(url) !== null;
  }

  async resolve(value: string): Promise<MapLinkResolution> {
    const initialUrl = this.toUrl(value);
    const provider = initialUrl ? this.providerFor(initialUrl) : null;
    if (!initialUrl || !provider) {
      throw new Error("Unsupported map URL");
    }

    const isShort = isGoogleShortLink(initialUrl);
    try {
      const resolvedUrl = isShort
        ? this.toUrl(
            (
              await this.functions.callAppChecked<
                { url: string },
                ShortLinkResponse
              >("resolveMapShortLink", { url: initialUrl.toString() })
            ).finalUrl,
          )
        : initialUrl;
      if (!resolvedUrl || this.providerFor(resolvedUrl) !== provider) {
        throw new Error("Map URL resolved to an unsupported provider");
      }

      const resolution = this.parseResolvedUrl(resolvedUrl, provider, isShort);
      this.analytics.trackEvent("map_link_paste_resolved", {
        provider,
        format: resolution.format,
        result_kind: resolution.placeId
          ? "place_id"
          : resolution.location
            ? "coordinates"
            : "query",
      });
      return resolution;
    } catch (error) {
      this.analytics.reportError(error, {
        context: "map_link_paste",
        feature: "map_search",
        action: "resolve",
        handled: true,
        userFacing: true,
        properties: { provider, format: isShort ? "short" : "direct" },
      });
      throw error;
    }
  }

  private parseResolvedUrl(
    url: URL,
    provider: MapLinkProvider,
    short: boolean,
  ): MapLinkResolution {
    const placeId = this.nonEmpty(
      url.searchParams.get("query_place_id") ??
        url.searchParams.get("place_id"),
    );
    const queryValue = this.nonEmpty(
      url.searchParams.get("name") ??
        url.searchParams.get("query") ??
        url.searchParams.get("q") ??
        url.searchParams.get("address"),
    );
    const location =
      this.parseCoordinates(url.searchParams.get("ll")) ??
      this.parseCoordinates(url.searchParams.get("coordinate")) ??
      this.parseCoordinates(queryValue) ??
      this.parseCoordinatesFromGoogleData(url.pathname) ??
      this.parseCoordinatesFromGooglePath(url.pathname);
    const pathLabel =
      provider === "google"
        ? this.nonEmpty(
            decodeURIComponent(
              url.pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/u)?.[1] ??
                "",
            ).replace(/\+/gu, " "),
          )
        : undefined;
    const query =
      queryValue && !this.parseCoordinates(queryValue)
        ? queryValue
        : pathLabel;

    if (!placeId && !location && !query) {
      throw new Error("Map URL did not contain a place, query, or coordinates");
    }

    return {
      provider,
      format: short ? "short" : "direct",
      ...(placeId ? { placeId } : {}),
      ...(query ? { query } : {}),
      ...(location ? { location } : {}),
    };
  }

  private providerFor(url: URL): MapLinkProvider | null {
    const host = url.hostname.toLowerCase();
    if (host === "maps.apple.com") return "apple";
    if (
      (GOOGLE_SHORT_HOSTS.has(host) && isGoogleShortLink(url)) ||
      (GOOGLE_HOST_PATTERN.test(host) && isGoogleMapsPath(url))
    ) {
      return "google";
    }
    return null;
  }

  private parseCoordinates(value: string | null | undefined):
    | google.maps.LatLngLiteral
    | undefined {
    if (!value) return undefined;
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/u);
    return match ? this.validCoordinates(Number(match[1]), Number(match[2])) : undefined;
  }

  private parseCoordinatesFromGooglePath(
    path: string,
  ): google.maps.LatLngLiteral | undefined {
    const match = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/u);
    return match ? this.validCoordinates(Number(match[1]), Number(match[2])) : undefined;
  }

  private parseCoordinatesFromGoogleData(
    path: string,
  ): google.maps.LatLngLiteral | undefined {
    const match = path.match(
      /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/u,
    );
    return match
      ? this.validCoordinates(Number(match[1]), Number(match[2]))
      : undefined;
  }

  private validCoordinates(
    lat: number,
    lng: number,
  ): google.maps.LatLngLiteral | undefined {
    return Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
      ? { lat, lng }
      : undefined;
  }

  private nonEmpty(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private toUrl(value: string): URL | null {
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }
}
