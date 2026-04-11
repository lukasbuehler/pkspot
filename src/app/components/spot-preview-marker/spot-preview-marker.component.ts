import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  inject,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { MarkerComponent } from "../marker/marker.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { ResponsiveService } from "../../services/responsive.service";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { MediaType } from "../../../db/models/Interfaces";
import { getImportantAmenities } from "../../../db/models/Amenities";
import {
  SpotAccess,
  SpotAccessIcons,
  SpotTypes,
  SpotTypesIcons,
  parseSpotAccess,
  parseSpotType,
} from "../../../db/schemas/SpotTypeAndAccess";

@Component({
  selector: "app-spot-preview-marker",
  imports: [MapAdvancedMarker, MarkerComponent, SpotPreviewCardComponent],
  template: `
    @if(position()) {
    <div
      #markerShell
      class="spot-preview-marker"
      [class.preview-enabled]="hoverPreviewActive()"
      [class.preview-visible]="previewVisible()"
      [class.has-media]="hasMedia()"
      [class.no-media]="!hasMedia()"
      tabindex="0"
      role="button"
      [attr.aria-label]="spotName()"
      (mouseenter)="showPreview()"
      (mouseleave)="hidePreview()"
      (focus)="showPreview()"
      (blur)="hidePreview()"
      (keydown.enter)="triggerMarkerFromKeyboard($event)"
      (keydown.space)="triggerMarkerFromKeyboard($event)"
    >
      @if(hoverPreviewActive()) {
      <div class="spot-preview-marker__preview">
        <app-spot-preview-card
          class="spot-preview-marker__card"
          [spotData]="spot()"
          [mapZoom]="mapZoom()"
          [hasBorder]="false"
          [isCompact]="true"
          [imgSize]="200"
          [loadingPriority]="previewVisible()"
        ></app-spot-preview-card>
        <svg
          class="spot-preview-marker__tail"
          width="18"
          height="12"
          viewBox="0 0 18 12"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M6.88614 10.6061C7.4508 11.2455 7.73313 11.5653 8.04116 11.7336C8.63871 12.06 9.36129 12.06 9.95884 11.7336C10.2669 11.5653 10.5492 11.2455 11.1139 10.6061L16.1201 4.93655C17.1337 3.78859 17.6406 3.21461 17.7605 2.75071C17.9955 1.84214 17.5671 0.8924 16.7305 0.467134C16.3034 0.25 15.5377 0.25 14.0062 0.25H3.99378C2.46234 0.25 1.69663 0.25 1.26948 0.467134C0.432911 0.8924 0.00453424 1.84214 0.239482 2.75071C0.359444 3.21461 0.86627 3.78859 1.87992 4.93655L6.88614 10.6061Z"
          />
        </svg>
      </div>
      }

      <app-marker
        class="spot-preview-marker__pin"
        [icons]="markerIcons()"
        [number]="markerNumber()"
        [isRating]="true"
        [color]="markerColor()"
        [size]="0.82"
        [title]="spotName()"
      ></app-marker>
    </div>

    <map-advanced-marker
      [position]="position()!"
      [content]="markerShell"
      [zIndex]="computedZIndex()"
      [options]="markerOptions()"
      (mapClick)="onMarkerClick()"
    />
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .spot-preview-marker {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      cursor: pointer;
      outline: none;
      pointer-events: auto;
      animation: markerEntrance 0.22s ease-out;
    }

    .spot-preview-marker__pin {
      transition:
        opacity 0.18s ease,
        transform 0.28s cubic-bezier(0.2, 0.9, 0.2, 1);
      transform-origin: bottom center;
    }

    .spot-preview-marker__preview {
      position: absolute;
      left: 50%;
      bottom: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transform: translateX(-50%) translateY(16px) scale(0.88);
      transform-origin: bottom center;
      transition:
        opacity 0.18s ease,
        transform 0.28s cubic-bezier(0.2, 0.9, 0.2, 1);
      will-change: opacity, transform;
    }

    .spot-preview-marker.preview-enabled.has-media {
      --spot-preview-marker-width: clamp(250px, 28vw, 320px);
    }

    .spot-preview-marker.preview-enabled.no-media {
      --spot-preview-marker-width: clamp(210px, 22vw, 270px);
    }

    .spot-preview-marker__card {
      display: block;
      width: var(--spot-preview-marker-width, 280px);
      filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.34));
    }

    .spot-preview-marker__tail {
      margin-top: -7px;
      fill: var(
        --mat-card-elevated-container-color,
        var(--mat-sys-surface-container-low)
      );
      filter: drop-shadow(0 12px 14px rgba(0, 0, 0, 0.18));
    }

    .spot-preview-marker.preview-enabled.preview-visible {
      z-index: 1;
    }

    .spot-preview-marker.preview-enabled.preview-visible
      .spot-preview-marker__preview {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }

    .spot-preview-marker.preview-enabled.preview-visible
      .spot-preview-marker__pin {
      opacity: 0;
      transform: translateY(10px) scale(0.8);
    }

    .spot-preview-marker:focus-visible {
      outline: none;
    }

    @keyframes markerEntrance {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.92);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (hover: none), (pointer: coarse) {
      .spot-preview-marker__preview {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPreviewMarkerComponent {
  private readonly responsive = inject(ResponsiveService);

  spot = input.required<Spot | LocalSpot | SpotPreviewData>();
  mapZoom = input<number | null>(null);
  hoverPreviewEnabled = input<boolean>(true);
  color = input<"primary" | "secondary" | "tertiary" | "gray">("primary");
  zIndexBase = input<number>(4200);
  markerClick = output<Spot | LocalSpot | SpotPreviewData>();

  previewVisible = signal(false);

  hoverPreviewActive = computed(
    () => this.hoverPreviewEnabled() && this.responsive.isDesktop()
  );

  position = computed<google.maps.LatLngLiteral | null>(() => {
    const spot = this.spot();

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.location();
    }

    if (spot.location) {
      return {
        lat: spot.location.latitude,
        lng: spot.location.longitude,
      };
    }

    return null;
  });

  spotName = computed(() => {
    const spot = this.spot();
    return spot instanceof Spot || spot instanceof LocalSpot
      ? spot.name()
      : spot.name;
  });

  markerNumber = computed(() => {
    const spot = this.spot();

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.rating ? Math.round(spot.rating * 10) / 10 : null;
    }

    return spot.rating ? Math.round(spot.rating * 10) / 10 : null;
  });

  markerColor = computed(() => {
    return this.color();
  });

  hasMedia = computed(() => {
    const spot = this.spot();

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.media().some((media) => media.type === MediaType.Image);
    }

    return !!spot.imageSrc;
  });

  markerIcons = computed<string[]>(() => {
    const spot = this.spot();

    if ("isIconic" in spot && spot.isIconic) {
      return ["stars"];
    }

    const amenityIcons = this.getAmenityIcons();
    if (amenityIcons.length > 0) {
      return amenityIcons;
    }

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      const spotType = spot.type();
      if (spotType && spotType !== SpotTypes.Other) {
        return [SpotTypesIcons[spotType]];
      }

      const spotAccess = spot.access();
      if (spotAccess && spotAccess !== SpotAccess.Other) {
        return [SpotAccessIcons[spotAccess]];
      }
    } else {
      const spotType = parseSpotType(spot.type ?? null);
      if (spotType && spotType !== SpotTypes.Other) {
        return [SpotTypesIcons[spotType]];
      }
    }

    if (!(spot instanceof Spot || spot instanceof LocalSpot)) {
      const spotAccess = parseSpotAccess(spot.access ?? null);
      if (spotAccess && spotAccess !== SpotAccess.Other) {
        return [SpotAccessIcons[spotAccess]];
      }
    }

    return ["star"];
  });

  computedZIndex = computed(() => {
    const rating = this.markerNumber() ?? 0;
    const hoverBoost = this.previewVisible() ? 1_000_000 : 0;
    return this.zIndexBase() + Math.round(rating * 40) + hoverBoost;
  });

  markerOptions = computed<google.maps.marker.AdvancedMarkerElementOptions>(
    () => ({
      gmpClickable: true,
      collisionBehavior:
        google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
      zIndex: this.computedZIndex(),
    })
  );

  showPreview() {
    if (!this.hoverPreviewActive()) {
      return;
    }

    this.previewVisible.set(true);
  }

  hidePreview() {
    this.previewVisible.set(false);
  }

  triggerMarkerFromKeyboard(event: Event) {
    event.preventDefault();
    this.hidePreview();
    this.markerClick.emit(this.spot());
  }

  onMarkerClick() {
    this.hidePreview();
    this.markerClick.emit(this.spot());
  }

  private getAmenityIcons(): string[] {
    const spot = this.spot();

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot
        .importantAmenitiesArray()
        .filter((amenity) => !!amenity.icon)
        .map((amenity) => amenity.icon!);
    }

    if (!spot.amenities) {
      return [];
    }

    return getImportantAmenities(spot.amenities, spot.type)
      .filter((amenity) => !!amenity.icon)
      .map((amenity) => amenity.icon!);
  }
}
