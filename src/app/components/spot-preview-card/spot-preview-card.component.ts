import {
  Component,
  Input,
  Output,
  EventEmitter,
  Inject,
  LOCALE_ID,
  OnChanges,
  ElementRef,
  inject,
  input,
  computed,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import { MapsApiService } from "../../services/maps-api.service";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { StorageService } from "../../services/firebase/storage.service";
import { MatCardModule } from "@angular/material/card";
import { MatRippleModule } from "@angular/material/core";
import { MatIconModule } from "@angular/material/icon";
import { NgOptimizedImage } from "@angular/common";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { MatButtonModule } from "@angular/material/button";
import { getImportantAmenities } from "../../../db/models/Amenities";

@Component({
  selector: "app-spot-preview-card",
  templateUrl: "./spot-preview-card.component.html",
  styleUrls: ["./spot-preview-card.component.scss"],
  imports: [
    MatCardModule,
    MatRippleModule,
    MatIconModule,
    NgOptimizedImage,
    SpotRatingComponent,
    MatButtonModule,
    MatIconModule,
  ],
})
export class SpotPreviewCardComponent implements OnChanges {
  public elementRef = inject(ElementRef);

  hasBorder = input<boolean>(true);
  imgSize = input<200 | 400 | 800>(200);

  spotData = input<Spot | LocalSpot | SpotPreviewData | null>(null);
  spotAmenitiesArray = computed<
    {
      name?: string;
      icon?: string;
      priority?: "high" | "medium" | "low";
      isNegative?: boolean;
    }[]
  >(() => {
    const spot = this.spotData();
    if (!spot) {
      return [];
    }
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      // Use important amenities array (high-priority only)
      return spot.importantAmenitiesArray();
    }
    // For SpotPreviewData, use the centralized helper function
    const spotType =
      "type" in spot && typeof spot.type === "string" ? spot.type : undefined;
    return spot.amenities
      ? getImportantAmenities(spot.amenities, spotType)
      : [];
  });
  showInfoButton = input<boolean>(true);
  @Input() infoOnly: boolean = false;
  @Input() clickable: boolean = false;
  @Input() isCompact: boolean = false;

  @Output() spotClick: EventEmitter<Spot | LocalSpot> = new EventEmitter<
    Spot | LocalSpot
  >();
  @Output() dismiss: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() edit: EventEmitter<any> = new EventEmitter<any>();

  fallbackImgSrc = "/assets/no_media.png";

  spotName?: string;
  spotLocality?: string;
  media = computed<string[]>(() => {
    const spot = this.spotData();

    if (!spot) {
      return [];
    }

    let mediaArr: string[] = [];
    let location: google.maps.LatLngLiteral | null = null;

    if (!(spot instanceof Spot || spot instanceof LocalSpot)) {
      // Spot is a SpotPreviewData object
      if (spot.location) {
        location = {
          lat: spot.location.latitude,
          lng: spot.location.longitude,
        };
      }
      if (spot.imageSrc) {
        mediaArr = [spot.imageSrc];
      }
    } else {
      location = spot.location();
      mediaArr = spot
        .media()
        .filter((m) => m.type === MediaType.Image)
        .map((m) => m.getPreviewImageSrc());
    }

    console.log("media length", mediaArr.length);
    if (mediaArr.length === 0) {
      // Return Street View Static API image if available

      if (location) {
        console.log("No media found for spot, using Street View");
        let spotId: string | undefined;

        if (spot instanceof Spot) {
          spotId = spot.id;
        } else if (spot instanceof LocalSpot) {
          spotId = undefined; // Local spots don't have an ID
        } else {
          // SpotPreviewData
          spotId = spot.id;
        }

        const svUrl = this.mapsApiService.getStaticStreetViewImageForLocation(
          location,
          400,
          400,
          spotId
        );

        console.log("instead of media, Street View URL: ", svUrl);
        if (svUrl) {
          mediaArr.push(svUrl);
        }
      }
    }
    return mediaArr;
  });

  bookmarked = false;
  visited = false;

  imageLoadError = signal(false);

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    private _router: Router,
    public storageService: StorageService,
    public mapsApiService: MapsApiService
  ) {}

  ngOnChanges() {
    const spot = this.spotData();
    if (spot) {
      // Reset error state when spot changes
      this.imageLoadError.set(false);

      if (spot instanceof Spot || spot instanceof LocalSpot) {
        this.spotName = spot.name();
        this.spotLocality = spot.localityString();
      } else {
        this.spotName = spot.name;
        this.spotLocality = spot.locality;
      }
    }
  }

  capitalize(s: string) {
    return s && s[0].toUpperCase() + s.slice(1);
  }

  // onClick() {
  //   if (this.clickable && this.spot && this.spot instanceof Spot) {
  //     // open the spot in the spot map
  //     this.spotClick.emit(this.spot);
  //   }
  // }

  onImageError() {
    console.log("Image load error");
    this.imageLoadError.set(true);
    const spot = this.spotData();
    if (spot && spot instanceof Spot) {
      this.mapsApiService.reportStreetViewError(spot.id);
    } else if (spot && !(spot instanceof LocalSpot)) {
      // Spot Preview Data
      this.mapsApiService.reportStreetViewError(spot.id);
    }
  }

  shareSpot() {
    // TODO
  }
}
