import { isPlatformServer } from "@angular/common";
import { inject, Injectable, LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { Spot, LocalSpot } from "../../db/models/Spot";
import {
  SpotChallenge,
  LocalSpotChallenge,
} from "../../db/models/SpotChallenge";
import { LocaleCode } from "../../db/models/Interfaces";

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
  locale: LocaleCode = inject(LOCALE_ID);
  platformId = inject(PLATFORM_ID);

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
    image_src = image_src.trim();

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

    // Image
    this.meta.updateTag({
      property: "og:image",
      content: image_src,
    });
    this.meta.updateTag({
      name: "twitter:image",
      content: image_src,
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

    // Canonical URL
    if (canonicalUrl) {
      this.setCanonicalUrl(canonicalUrl);
    }
  }

  /**
   * Sets the canonical URL for the current page
   */
  public setCanonicalUrl(url: string): void {
    // Skip DOM manipulation on server-side rendering
    if (this.isServer) {
      return;
    }

    // Remove existing canonical tag if present
    const existingCanonical = document.querySelector('link[rel="canonical"]');
    if (existingCanonical) {
      existingCanonical.remove();
    }

    // Add new canonical tag
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = url;
    document.head.appendChild(link);
  }

  /**
   * Sets meta tags for a spot with canonical URL
   */
  public setSpotMetaTags(spot: Spot | LocalSpot, canonicalPath?: string): void {
    const title = spot.name();
    const image =
      spot.previewImageSrc() ?? "https://pkspot.app/assets/banner_1200x630.png";

    let description = "";

    // Add locality information
    if (spot.localityString()) {
      description =
        $localize`:The text before the localized location of the spot. E.g. Parkour spot in Wiedikon, Zurich, CH@@spot.locality.pretext:Parkour spot in ` +
        spot.localityString();
    }

    // Add rating if available
    if (description && spot.rating) {
      description += " - ";
    }
    if (spot.rating) {
      description += $localize`Rating: ${Math.round(spot.rating * 10) / 10} ⭐`;
    }

    // Add description if available
    if (description && spot.description()) {
      description += " - ";
    }
    if (spot.description()) {
      description += spot.description();
    }

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
      challenge.spot.previewImageSrc() ??
      "https://pkspot.app/assets/banner_1200x630.png";

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
      event.image || "https://pkspot.app/assets/banner_1200x630.png";
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
      user.profilePicture || "https://pkspot.app/assets/banner_1200x630.png";
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
    const image = post.image || "https://pkspot.app/assets/banner_1200x630.png";
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
    const image = pageImage || "https://pkspot.app/assets/banner_1200x630.png";
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
    const image = "/assets/banner_1200x630.png";

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
    const image = "/assets/banner_1200x630.png";

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
}
