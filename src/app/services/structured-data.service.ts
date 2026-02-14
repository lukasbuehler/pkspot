import { DOCUMENT, isPlatformServer } from "@angular/common";
import { inject, Injectable, LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { Place, Person, ImageObject } from "schema-dts";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { User } from "../../db/models/User";
import { StorageImage } from "../../db/models/Media";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { environment } from "../../environments/environment";

@Injectable({
  providedIn: "root",
})
export class StructuredDataService {
  static readonly BRAND_NAME = "PK Spot";
  static readonly BRAND_URL = "https://pkspot.app";
  static readonly LOGO_URL = "https://pkspot.app/assets/icons/icon-512.webp";
  static readonly INSTAGRAM_LINKTREE_URL = "https://linktr.ee/pkspot";
  static readonly INSTAGRAM_PROFILE_URL = "https://instagram.com/pkspot.app";
  static readonly APPLE_APP_STORE_URL =
    "https://apps.apple.com/app/pk-spot-parkour-freerunning/id6757597683";
  static readonly GOOGLE_PLAY_STORE_URL =
    "https://play.google.com/store/apps/details?id=com.pkspot.app";

  locale: string = inject(LOCALE_ID);
  platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);

  isServer: boolean;

  structuredDataIdPrefix = "structured-data-";

  constructor(private meta: Meta, private titleService: Title) {
    this.isServer = isPlatformServer(this.platformId);
  }

  get sameAsLinks(): string[] {
    return [
      StructuredDataService.INSTAGRAM_LINKTREE_URL,
      StructuredDataService.INSTAGRAM_PROFILE_URL,
      StructuredDataService.APPLE_APP_STORE_URL,
      StructuredDataService.GOOGLE_PLAY_STORE_URL,
    ];
  }

  generateOrganizationData(): Record<string, unknown> {
    return {
      "@type": "Organization",
      "@id": `${StructuredDataService.BRAND_URL}/#organization`,
      name: StructuredDataService.BRAND_NAME,
      url: StructuredDataService.BRAND_URL,
      logo: StructuredDataService.LOGO_URL,
      sameAs: this.sameAsLinks,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Zurich",
        addressCountry: "CH",
      },
    };
  }

  generateSoftwareApplicationData(): Record<string, unknown> {
    return {
      "@type": "SoftwareApplication",
      "@id": `${StructuredDataService.BRAND_URL}/#software-application`,
      name: StructuredDataService.BRAND_NAME,
      url: StructuredDataService.BRAND_URL,
      logo: StructuredDataService.LOGO_URL,
      sameAs: this.sameAsLinks,
      operatingSystem: "iOS, Android",
      applicationCategory: "SportsApplication",
      downloadUrl: [
        StructuredDataService.APPLE_APP_STORE_URL,
        StructuredDataService.GOOGLE_PLAY_STORE_URL,
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "CHF",
      },
      publisher: {
        "@id": `${StructuredDataService.BRAND_URL}/#organization`,
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: "Zurich",
        addressCountry: "CH",
      },
    };
  }

  /**
   * Adds structured data JSON-LD script to the document head.
   * Works on both server and client side for SSR support.
   */
  addStructuredData(id: string, data: any) {
    // Remove existing script with same id first
    this.removeStructuredData(id);

    const script = this.document.createElement("script");
    script.type = "application/ld+json";
    script.id = this.structuredDataIdPrefix + id;
    script.text = JSON.stringify({ "@context": "https://schema.org", ...data });
    this.document.head.appendChild(script);
  }

  removeStructuredData(id: string) {
    const script = this.document.getElementById(
      this.structuredDataIdPrefix + id
    );
    if (script) {
      script.remove();
    }
  }

  /**
   * Generates Place structured data for a spot
   */
  generateSpotPlaceData(spot: Spot | LocalSpot, url?: string): Place {
    const placeData: Place = {
      "@type": "Place",
      name: spot.name(),
      description: spot.description() || undefined,
      geo: {
        "@type": "GeoCoordinates",
        latitude: spot.location().lat,
        longitude: spot.location().lng,
      },
      keywords: "parkour,freerunning,spot,training",
      // additionalType: "https://schema.org/LocalBusiness", // only when it has an entry/fee value for the spot access
    };

    // Add URL if spot has an id (is persisted)
    if (spot instanceof Spot) {
      placeData.url =
        url || `${environment.baseUrl}/map/${spot.slug ?? spot.id}`;
      placeData.identifier = spot.id;
    }

    // Add images
    const images = this.generateSpotImageObjects(spot);
    if (images.length > 0) {
      const imageUrls = images
        .map((image) =>
          typeof image.contentUrl === "string" ? image.contentUrl : undefined
        )
        .filter((imageUrl): imageUrl is string => !!imageUrl);
      if (imageUrls.length > 0) {
        placeData.image = imageUrls.length === 1 ? imageUrls[0] : imageUrls;
      }
      // Add photos as well for richer schema
      placeData.photo = images;
    } else {
      const previewImageUrl = this.normalizeAbsoluteUrl(spot.previewImageSrc());
      if (previewImageUrl) {
        placeData.image = previewImageUrl;
      }
    }

    // Add address if available
    const address = spot.address();
    if (address) {
      const addressLocality =
        address.locality || address.sublocality || this.getSpotLocality(spot);
      placeData.address = {
        "@type": "PostalAddress",
        streetAddress: this.withLocalityInStreetAddress(
          address.formatted,
          addressLocality
        ),
        addressLocality: addressLocality,
        addressRegion:
          address.sublocality && address.sublocality !== addressLocality
            ? address.sublocality
            : undefined,
        addressCountry: address.country?.code,
      };
    } else {
      const fallbackLocality = this.getSpotLocality(spot);
      if (fallbackLocality) {
        placeData.address = {
          "@type": "PostalAddress",
          addressLocality: fallbackLocality,
        };
      }
    }

    // Add aggregate rating if available
    if (spot.rating && spot.numReviews && spot.numReviews > 0) {
      placeData.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: spot.rating,
        bestRating: 5,
        worstRating: 1,
        ratingCount: spot.numReviews,
      };
    }

    return placeData;
  }

  private getSpotLocality(spot: Spot | LocalSpot): string | undefined {
    const locality = spot.localityString()?.trim();
    if (!locality) {
      return undefined;
    }

    const parts = locality
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      return undefined;
    }

    if (parts.length > 1 && /^[a-z]{2}$/i.test(parts[parts.length - 1])) {
      parts.pop();
    }

    return parts[parts.length - 1];
  }

  private withLocalityInStreetAddress(
    streetAddress?: string,
    locality?: string
  ): string | undefined {
    const cleanStreetAddress = streetAddress?.trim();
    const cleanLocality = locality?.trim();

    if (!cleanLocality) {
      return cleanStreetAddress;
    }

    if (!cleanStreetAddress) {
      return cleanLocality;
    }

    if (
      cleanStreetAddress.toLowerCase().includes(cleanLocality.toLowerCase())
    ) {
      return cleanStreetAddress;
    }

    return `${cleanStreetAddress}, ${cleanLocality}`;
  }

  /**
   * Generates ImageObject structured data for spot media
   */
  generateSpotImageObjects(spot: Spot | LocalSpot): ImageObject[] {
    const images: ImageObject[] = [];
    const media = spot.media();

    for (const m of media) {
      if (m.type === "image") {
        const highResImage = this.getMediaSrcAtSize(m, 800);
        const previewImage = this.normalizeAbsoluteUrl(m.getPreviewImageSrc());
        const contentUrl = highResImage || previewImage;
        if (!contentUrl) {
          continue;
        }

        const thumbnailUrl =
          this.getMediaSrcAtSize(m, 400) || this.getMediaSrcAtSize(m, 200);

        const imageObject: ImageObject = {
          "@type": "ImageObject",
          contentUrl: contentUrl,
          url: contentUrl,
          thumbnailUrl: thumbnailUrl,
          description: `Photo of ${spot.name()} parkour spot`,
        };

        // Add thumbnail if available (for StorageImage)
        if (thumbnailUrl) {
          imageObject.thumbnail = {
            "@type": "ImageObject",
            contentUrl: thumbnailUrl,
          };
        }

        // Add author if user id is available
        if (m.userId) {
          imageObject.author = {
            "@type": "Person",
            identifier: m.userId,
          };
        }

        images.push(imageObject);
      }
    }

    return images;
  }

  /**
   * Generates Person structured data for a user profile
   */
  generateUserPersonData(user: User, profileUrl?: string): Person {
    const personData: Person = {
      "@type": "Person",
      name: user.displayName,
      identifier: user.uid,
    };

    if (profileUrl) {
      personData.url = profileUrl;
    } else {
      personData.url = `${environment.baseUrl}/u/${user.uid}`;
    }

    if (user.biography) {
      personData.description = user.biography;
    }

    // Add profile picture
    if (user.profilePicture) {
      personData.image = {
        "@type": "ImageObject",
        contentUrl: user.profilePicture.getSrc(400),
        thumbnail: {
          "@type": "ImageObject",
          contentUrl: user.profilePicture.getSrc(200),
        },
      };
    }

    // Add follower count if available (use any to bypass strict schema-dts typing)
    if (user.followerCount > 0) {
      (personData as any).interactionStatistic = {
        "@type": "InteractionCounter",
        interactionType: {
          "@type": "FollowAction",
        },
        userInteractionCount: user.followerCount,
      };
    }

    return personData;
  }

  /**
   * Generates ItemList structured data for a list of spots (e.g., highlighted spots).
   * Returns a plain object to avoid strict schema-dts type issues with ItemList.
   */
  generateSpotItemList(
    spots: (Spot | LocalSpot | SpotPreviewData)[],
    listName: string = "Parkour Spots"
  ): any {
    const listItems = spots.map((spot, index) => {
      if (spot instanceof Spot || spot instanceof LocalSpot) {
        return {
          "@type": "ListItem",
          position: index + 1,
          item: this.generateSpotPlaceData(spot),
        };
      } else {
        // SpotPreviewData - create minimal Place data
        const placeItem: any = {
          "@type": "Place",
          name: spot.name,
          url: `${environment.baseUrl}/map/${spot.slug ?? spot.id}`,
        };

        if (spot.location) {
          placeItem.geo = {
            "@type": "GeoCoordinates",
            latitude: spot.location.latitude,
            longitude: spot.location.longitude,
          };
        }

        if (spot.imageSrc) {
          placeItem.image = this.normalizeAbsoluteUrl(spot.imageSrc);
        }

        if (spot.rating) {
          placeItem.aggregateRating = {
            "@type": "AggregateRating",
            ratingValue: spot.rating,
            bestRating: 5,
            worstRating: 1,
          };
        }

        return {
          "@type": "ListItem",
          position: index + 1,
          item: placeItem,
        };
      }
    });

    return {
      "@type": "ItemList",
      name: listName,
      numberOfItems: spots.length,
      itemListElement: listItems,
    };
  }

  private getMediaSrcAtSize(media: unknown, size: number): string | undefined {
    if (typeof media !== "object" || media === null) {
      return undefined;
    }
    const candidate = media as { getSrc?: (size: number) => string };
    if (typeof candidate.getSrc !== "function") {
      return undefined;
    }

    try {
      return this.normalizeAbsoluteUrl(candidate.getSrc(size));
    } catch {
      return undefined;
    }
  }

  private normalizeAbsoluteUrl(url?: string): string | undefined {
    const trimmed = url?.trim();
    if (!trimmed) {
      return undefined;
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
}
