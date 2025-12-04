import { DOCUMENT, isPlatformServer } from "@angular/common";
import { inject, Injectable, LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { Place, Person, ImageObject } from "schema-dts";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { User } from "../../db/models/User";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { environment } from "../../environments/environment";

@Injectable({
  providedIn: "root",
})
export class StructuredDataService {
  locale: string = inject(LOCALE_ID);
  platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);

  isServer: boolean;

  structuredDataIdPrefix = "structured-data-";

  constructor(private meta: Meta, private titleService: Title) {
    this.isServer = isPlatformServer(this.platformId);
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
      placeData.image = images.length === 1 ? images[0] : images;
      // Add photos as well for richer schema
      if (images.length > 0) {
        placeData.photo = images;
      }
    }

    // Add address if available
    const address = spot.address();
    if (address) {
      placeData.address = {
        "@type": "PostalAddress",
        streetAddress: address.formatted,
        addressLocality: address.locality,
        addressRegion: address.sublocality,
        addressCountry: address.country?.code,
      };
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

  /**
   * Generates ImageObject structured data for spot media
   */
  generateSpotImageObjects(spot: Spot | LocalSpot): ImageObject[] {
    const images: ImageObject[] = [];
    const media = spot.media();

    for (const m of media) {
      if (m.type === "image") {
        const imageObject: ImageObject = {
          "@type": "ImageObject",
          contentUrl: m.getPreviewImageSrc(),
          description: `Photo of ${spot.name()} parkour spot`,
        };

        // Add thumbnail if available (for StorageImage)
        if ("getSrc" in m && typeof m.getSrc === "function") {
          imageObject.thumbnail = {
            "@type": "ImageObject",
            contentUrl: m.getSrc(200),
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
          placeItem.image = spot.imageSrc;
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
}
