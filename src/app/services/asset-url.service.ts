import { Injectable, inject } from "@angular/core";
import {
  EventSchema,
  InlineEventSpotSchema,
} from "../../db/schemas/EventSchema";
import { PlatformService } from "./platform.service";

@Injectable({
  providedIn: "root",
})
export class AssetUrlService {
  private readonly _platform = inject(PlatformService);
  private readonly _mobileSharedAssetPrefix = "/en/assets/";

  resolveEventAssetUrls(event: EventSchema): EventSchema {
    return {
      ...event,
      banner_src: this.resolveBundledAssetUrl(event.banner_src),
      logo_src: this.resolveBundledAssetUrl(event.logo_src),
      media: event.media?.map((media) => ({
        ...media,
        src: this.resolveBundledAssetUrl(media.src) ?? media.src,
      })),
      organizer: event.organizer
        ? {
            ...event.organizer,
            organization: {
              ...event.organizer.organization,
              logo_url: this.resolveBundledAssetUrl(
                event.organizer.organization.logo_url,
              ),
            },
          }
        : undefined,
      inline_spots: event.inline_spots?.map((spot) =>
        this._resolveInlineSpotAssetUrls(spot),
      ),
      sponsor: event.sponsor
        ? {
            ...event.sponsor,
            logo_src: this.resolveBundledAssetUrl(event.sponsor.logo_src),
          }
        : undefined,
    };
  }

  resolveBundledAssetUrl(url: string | undefined): string | undefined {
    if (!url || !this._platform.isNative()) {
      return url;
    }

    const assetPath = this._readBundledAssetPath(url);
    if (!assetPath) {
      return url;
    }

    return `${this._mobileSharedAssetPrefix}${assetPath}`;
  }

  private _resolveInlineSpotAssetUrls(
    spot: InlineEventSpotSchema,
  ): InlineEventSpotSchema {
    return {
      ...spot,
      images: spot.images?.map((src) => this.resolveBundledAssetUrl(src) ?? src),
    };
  }

  private _readBundledAssetPath(url: string): string | null {
    const normalized = url.trim();
    const firstPartyAssetMatch = normalized.match(
      /^https:\/\/(?:www\.)?pkspot\.app\/assets\/(.+)$/iu,
    );
    if (firstPartyAssetMatch?.[1]) {
      return firstPartyAssetMatch[1];
    }

    if (/^(?:https?:|data:|blob:|capacitor:|file:)/iu.test(normalized)) {
      return null;
    }

    const match = normalized.match(/^\/?assets\/(.+)$/iu);
    return match?.[1] ?? null;
  }
}
