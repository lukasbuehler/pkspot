import { Component, computed, effect, input, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import {
  AmenityNames,
  AmenityNegativeNames,
} from "../../../db/models/Amenities";
import {
  AmenityIcons,
  AmenityNegativeIcons,
  AmenitiesMap,
  AmenitiesOrder,
} from "../../../db/schemas/Amenities";
import {
  parseSpotAccess,
  parseSpotType,
  SpotAccessIcons,
  SpotAccessNames,
  SpotTypesIcons,
  SpotTypesNames,
} from "../../../db/schemas/SpotTypeAndAccess";
import { getMediaPreviewImageUrl, MediaSchema } from "../../../db/schemas/Media";
import { SpotEdit } from "../../../db/models/SpotEdit";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";

interface DisplayChip {
  icon: string;
  label: string;
  tone?: "default" | "positive" | "negative";
}

interface DisplayMedia {
  previewSrc: string;
  type: "image" | "video";
}

@Component({
  selector: "app-spot-edit-summary",
  imports: [MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: "./spot-edit-summary.component.html",
  styleUrl: "./spot-edit-summary.component.scss",
})
export class SpotEditSummaryComponent {
  edit = input<SpotEditSchema | SpotEdit | null>(null);
  compact = input<boolean>(false);

  private _carouselStart = signal(0);
  private _pageSize = computed(() => (this.compact() ? 4 : 5));

  private _schema = computed<SpotEditSchema | null>(() => {
    const value = this.edit() as any;
    if (!value) {
      return null;
    }
    if (typeof value.getSchema === "function") {
      return value.getSchema() as SpotEditSchema;
    }
    return value as SpotEditSchema;
  });

  typeAndAccessChips = computed<DisplayChip[]>(() => {
    const schema = this._schema();
    if (!schema?.data) return [];

    const chips: DisplayChip[] = [];
    if (typeof schema.data.type === "string") {
      const type = parseSpotType(schema.data.type);
      chips.push({
        icon: SpotTypesIcons[type],
        label: SpotTypesNames[type],
      });
    }
    if (typeof schema.data.access === "string") {
      const access = parseSpotAccess(schema.data.access);
      chips.push({
        icon: SpotAccessIcons[access],
        label: SpotAccessNames[access],
      });
    }
    return chips;
  });

  amenityChips = computed<DisplayChip[]>(() => {
    const amenities = this._schema()?.data?.amenities as
      | AmenitiesMap
      | undefined;
    if (!amenities) {
      return [];
    }

    const chips: DisplayChip[] = [];
    for (const key of AmenitiesOrder) {
      const value = amenities[key];
      const positiveIcon = AmenityIcons[key] ?? "check";
      const negativeIcon = AmenityNegativeIcons[key] ?? "block";
      const positiveLabel = AmenityNames[key] ?? key;
      const negativeLabel = AmenityNegativeNames[key] ?? key;

      if (value === true) {
        chips.push({
          icon: positiveIcon,
          label: positiveLabel,
          tone: "positive",
        });
      } else if (value === false) {
        chips.push({
          icon: negativeIcon,
          label: negativeLabel,
          tone: "negative",
        });
      }
    }

    return chips;
  });

  fieldChips = computed<DisplayChip[]>(() => {
    const data = this._schema()?.data;
    if (!data) return [];

    const chips: DisplayChip[] = [];
    if (data.name) chips.push({ icon: "badge", label: "Name" });
    if (data.description) chips.push({ icon: "notes", label: "Description" });
    if (data.location) chips.push({ icon: "place", label: "Location" });
    if (data.bounds) chips.push({ icon: "polyline", label: "Bounds" });
    if (data.external_references) {
      chips.push({ icon: "link", label: "External refs" });
    }
    if (data.slug) chips.push({ icon: "link", label: "Slug" });
    if (typeof data.hide_streetview === "boolean") {
      chips.push({
        icon: "streetview",
        label: data.hide_streetview ? "Street View hidden" : "Street View shown",
      });
    }
    return chips;
  });

  addedMedia = computed<DisplayMedia[]>(() => {
    const schema = this._schema();
    if (!schema?.data || !Object.prototype.hasOwnProperty.call(schema.data, "media")) {
      return [];
    }

    const currentMedia = Array.isArray(schema.data.media) ? schema.data.media : [];
    const prevHasMedia =
      !!schema.prevData &&
      Object.prototype.hasOwnProperty.call(schema.prevData, "media");
    const prevMedia = Array.isArray(schema.prevData?.media)
      ? schema.prevData!.media!
      : [];

    const mediaToShow: MediaSchema[] = prevHasMedia
      ? currentMedia.filter(
          (item) => !prevMedia.some((prevItem) => prevItem.src === item.src)
        )
      : currentMedia;

    return mediaToShow
      .map((item) => {
        try {
          return {
            previewSrc: getMediaPreviewImageUrl(item),
            type: item.type,
          } as DisplayMedia;
        } catch {
          return null;
        }
      })
      .filter((item): item is DisplayMedia => item !== null);
  });

  visibleMedia = computed(() => {
    const start = this._carouselStart();
    return this.addedMedia().slice(start, start + this._pageSize());
  });

  canSlideBack = computed(() => this._carouselStart() > 0);
  canSlideForward = computed(
    () => this._carouselStart() + this._pageSize() < this.addedMedia().length
  );

  hasAnyContent = computed(
    () =>
      this.typeAndAccessChips().length > 0 ||
      this.amenityChips().length > 0 ||
      this.fieldChips().length > 0 ||
      this.addedMedia().length > 0
  );

  constructor() {
    effect(() => {
      const total = this.addedMedia().length;
      const maxStart = Math.max(0, total - this._pageSize());
      if (this._carouselStart() > maxStart) {
        this._carouselStart.set(maxStart);
      }
    });
  }

  slideBack() {
    this._carouselStart.update((value) => Math.max(0, value - this._pageSize()));
  }

  slideForward() {
    const maxStart = Math.max(0, this.addedMedia().length - this._pageSize());
    this._carouselStart.update((value) =>
      Math.min(maxStart, value + this._pageSize())
    );
  }
}
