import { DOCUMENT, isPlatformServer } from "@angular/common";
import { inject, Injectable, LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { Spot, LocalSpot } from "../../db/models/Spot";
import {
  SpotChallenge,
  LocalSpotChallenge,
} from "../../db/models/SpotChallenge";
import { LocaleCode } from "../../db/models/Interfaces";
import { environment } from "../../environments/environment";

export interface MetaTagData {
  title: string;
  description: string;
  image: string;
  canonical?: string;
}

@Injectable({
  providedIn: "root",
})
export class MetaTagService {
  private static readonly DEFAULT_IMAGE_PATH = "/assets/banner_1200x630.png";

  locale: LocaleCode = inject(LOCALE_ID);
  platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);

  isServer: boolean;

  constructor(private meta: Meta, private titleService: Title) {
    this.isServer = isPlatformServer(this.platformId);
  }

  public setMetaTags(
    title: string,
    image_src: string,
    description: string,
    canonicalUrl?: string
  ) {
    const normalizedImage =
      this.normalizeAbsoluteUrl(image_src) || this.defaultImageUrl;

    // Title
    this.titleService.setTitle(title);
    this.meta.updateTag({
      property: "og:title",
      content: title,
    });
    this.meta.updateTag({
      name: "twitter:title",
      content: title,
    });
    this.meta.updateTag({
      property: "og:type",
      content: "website",
    });
    this.meta.updateTag({
      name: "twitter:card",
      content: "summary_large_image",
    });

    // Image
    this.meta.updateTag({
      property: "og:image",
      content: normalizedImage,
    });
    this.meta.updateTag({
      property: "og:image:secure_url",
      content: normalizedImage,
    });
    this.meta.updateTag({
      name: "twitter:image",
      content: normalizedImage,
    });

    // Description
    this.meta.updateTag({
      name: "description",
      content: description,
    });
    this.meta.updateTag({
      property: "og:description",
      content: description,
    });
    this.meta.updateTag({
      name: "twitter:description",
      content: description,
    });
    this.meta.updateTag({
      name: "robots",
      content:
        "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    });

    // Canonical URL
    if (canonicalUrl) {
      this.meta.updateTag({
        property: "og:url",
        content: canonicalUrl,
      });
      this.setCanonicalUrl(canonicalUrl);
    }
  }

  /**
   * Sets the canonical URL for the current page
   */
  public setCanonicalUrl(url: string): void {
    if (!this.document?.head) {
      return;
    }

    // Remove existing canonical tag if present
    const existingCanonical = this.document.querySelector(
      'link[rel="canonical"]'
    );
    if (existingCanonical) {
      existingCanonical.remove();
    }

    // Add new canonical tag
    const link = this.document.createElement("link");
    link.rel = "canonical";
    link.href = url;
    this.document.head.appendChild(link);
  }

  /**
   * Sets meta tags for a spot with canonical URL
   */
  public setSpotMetaTags(spot: Spot | LocalSpot, canonicalPath?: string): void {
    const title = this.buildSpotTitle(spot);
    const image = this.getSpotSeoImage(spot);
    const localityString = spot.localityString().trim();
    const firstSentence = localityString
      ? `Parkour spot in ${localityString}.`
      : "Parkour spot on PK Spot.";

    const detailSegments: string[] = [];
    if (spot.rating) {
      detailSegments.push(`Rated ${Math.round(spot.rating * 10) / 10} out of 5`);
    }
    if (spot.description()) {
      detailSegments.push(spot.description());
    }

    const secondSentence =
      detailSegments.length > 0
        ? `${detailSegments.join(". ")}.`
        : "Discover photos, details, and training info.";
    const description = `${firstSentence} ${secondSentence}`;

    // Build canonical URL using slug if available
    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Sets meta tags for a challenge with canonical URL
   */
  public setChallengeMetaTags(
    challenge: SpotChallenge | LocalSpotChallenge,
    canonicalPath?: string
  ): void {
    const spotName = challenge.spot.name();
    const challengeName = challenge.name();
    const title = $localize`${challengeName} - ${spotName}`;

    const image =
      this.getSpotSeoImage(challenge.spot) ?? this.defaultImageUrl;

    let description = $localize`Challenge at ${spotName}`;

    if (challenge.spot.localityString()) {
      description += $localize` in ${challenge.spot.localityString()}`;
    }

    // Get description from descriptionLocaleMap
    const descriptionMap = challenge.descriptionLocaleMap();
    const descriptionKeys = Object.keys(descriptionMap);
    if (descriptionKeys.length > 0) {
      // Get the best locale for description
      const bestLocale = descriptionKeys.includes(this.locale)
        ? this.locale
        : descriptionKeys[0];
      const challengeDescription = descriptionMap[bestLocale]?.text;

      if (challengeDescription) {
        description += ` - ${challengeDescription}`;
      }
    }

    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Sets meta tags for an event with canonical URL
   */
  public setEventMetaTags(event: any, canonicalPath?: string): void {
    // TODO: Replace 'any' with proper Event type when you have it
    const title = event.name || "Event";
    const image =
      event.image || this.defaultImageUrl;
    const description =
      event.description || "Join us for this exciting parkour event!";

    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Sets meta tags for a user profile with canonical URL
   */
  public setUserMetaTags(user: any, canonicalPath?: string): void {
    // TODO: Replace 'any' with proper User type when you have it
    const title = `${user.displayName || user.name || "User"} - PK Spot`;
    const image =
      user.profilePicture?.getPreviewImageSrc() ||
      this.defaultImageUrl;
    const displayName = user.displayName || "this user";
    const possessive = displayName.endsWith("s")
      ? `${displayName}'`
      : `${displayName}'s`;
    const description =
      user.bio || `Check out ${possessive} profile on PK Spot.`;

    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Sets meta tags for a post with canonical URL
   */
  public setPostMetaTags(post: any, canonicalPath?: string): void {
    // TODO: Replace 'any' with proper Post type when you have it
    const title = post.title || "Post - PK Spot";
    const image = post.image || this.defaultImageUrl;
    const description =
      post.description || post.content || "Check out this post on PK Spot.";

    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Sets meta tags for static pages with canonical URL
   */
  public setStaticPageMetaTags(
    pageTitle: string,
    pageDescription: string,
    pageImage?: string,
    canonicalPath?: string
  ): void {
    const title = `${pageTitle} - PK Spot`;
    const image = pageImage || this.defaultImageUrl;
    const description = pageDescription;

    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Sets default map meta tags with canonical URL
   */
  public setDefaultMapMetaTags(canonicalPath?: string): void {
    const title = $localize`:@@pk.spotmap.title:PK Spot Map`;
    const description =
      "Discover, Train, Share. Discover spots and fellow athletes, plan training sessions with your friends and share achievements and memories with them and the world.";
    const image = this.defaultImageUrl;

    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Sets default home page meta tags with canonical URL
   */
  public setHomeMetaTags(canonicalPath?: string): void {
    const title = "PK Spot - Discover, Train, Share";
    const description =
      "The ultimate platform for parkour and freerunning enthusiasts. Discover spots, plan training sessions, and share your achievements with the community.";
    const image = this.defaultImageUrl;

    const canonical = canonicalPath
      ? this.buildCanonicalUrl(canonicalPath)
      : undefined;
    this.setMetaTags(title, image, description, canonical);
  }

  /**
   * Generic method to set meta tags from data object
   */
  public setMetaTagsFromData(data: MetaTagData): void {
    this.setMetaTags(data.title, data.image, data.description, data.canonical);
  }

  /**
   * Builds a full canonical URL from a path
   */
  private buildCanonicalUrl(path: string): string {
    // Use the default locale (en) for canonical URLs to avoid duplicate content signals
    return `https://pkspot.app/en${path}`;
  }

  private get defaultImageUrl(): string {
    return this.normalizeAbsoluteUrl(MetaTagService.DEFAULT_IMAGE_PATH);
  }

  private getSpotSeoImage(spot: Spot | LocalSpot): string {
    const firstImageMedia = spot
      .media()
      .find((media) => media.type === "image" && !media.isReported);

    const highResImage = firstImageMedia
      ? this.getHighResImageFromMedia(firstImageMedia)
      : undefined;
    if (highResImage) {
      return highResImage;
    }

    const previewImage = this.normalizeAbsoluteUrl(spot.previewImageSrc());
    return previewImage || this.defaultImageUrl;
  }

  private getHighResImageFromMedia(media: unknown): string | undefined {
    if (typeof media !== "object" || media === null) {
      return undefined;
    }
    const candidate = media as { getSrc?: (size: number) => string };
    if (typeof candidate.getSrc !== "function") {
      return undefined;
    }

    try {
      const imageUrl = candidate.getSrc(800);
      return this.normalizeAbsoluteUrl(imageUrl) || undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeAbsoluteUrl(url: string): string {
    const trimmed = url?.trim();
    if (!trimmed) {
      return "";
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }
    if (trimmed.startsWith("/")) {
      return `${environment.baseUrl}${trimmed}`;
    }
    return `${environment.baseUrl}/${trimmed.replace(/^\/+/, "")}`;
  }

  private buildSpotTitle(spot: Spot | LocalSpot): string {
    const spotName = spot.name();
    const locality = this.getSpotTitleLocality(spot);

    if (locality) {
      return `${spotName} - ${locality} | PK Spot`;
    }

    return `${spotName} | PK Spot`;
  }

  private getSpotTitleLocality(spot: Spot | LocalSpot): string | undefined {
    const address = spot.address();
    if (address?.locality) {
      return address.locality;
    }
    if (address?.sublocality) {
      return address.sublocality;
    }

    const localityString = spot.localityString().trim();
    if (!localityString) {
      return undefined;
    }

    const parts = localityString
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length > 1 && /^[a-z]{2}$/i.test(parts[parts.length - 1])) {
      parts.pop();
    }

    return parts.length > 0 ? parts[parts.length - 1] : undefined;
  }
}
