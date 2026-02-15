import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from "@angular/core";
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

interface ChangeRow {
  key: string;
  icon: string;
  label: string;
  value: string;
  previousValue?: string;
  tone?: "default" | "negative";
  layout?: "full" | "half";
}

@Component({
  selector: "app-spot-edit-summary",
  imports: [MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: "./spot-edit-summary.component.html",
  styleUrl: "./spot-edit-summary.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotEditSummaryComponent {
  edit = input<SpotEditSchema | SpotEdit | null>(null);
  compact = input<boolean>(false);

  private _carouselStart = signal(0);
  private _pageSize = computed(() => (this.compact() ? 4 : 5));

  private _schema = computed<SpotEditSchema | null>(() => {
    const value = this.edit();
    if (!value) {
      return null;
    }
    if (value instanceof SpotEdit) {
      return value.getSchema();
    }
    return value;
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
    if (data.name) chips.push({ icon: "badge", label: $localize`:@@spot-edit-summary.field.name:Name` });
    if (data.description) {
      chips.push({
        icon: "notes",
        label: $localize`:@@spot-edit-summary.field.description:Description`,
      });
    }
    if (data.location) chips.push({ icon: "place", label: $localize`:@@spot-edit-summary.field.location:Location` });
    if (data.bounds) chips.push({ icon: "polyline", label: $localize`:@@spot-edit-summary.field.bounds:Bounds` });
    if (data.external_references) {
      chips.push({ icon: "link", label: $localize`:@@spot-edit-summary.field.external-refs:External refs` });
    }
    if (data.slug) chips.push({ icon: "link", label: $localize`:@@spot-edit-summary.field.slug:Slug` });
    if (typeof data.hide_streetview === "boolean") {
      chips.push({
        icon: "streetview",
        label: data.hide_streetview
          ? $localize`:@@spot-edit-summary.field.streetview-hidden:Street View hidden`
          : $localize`:@@spot-edit-summary.field.streetview-visible:Street View shown`,
      });
    }
    return chips;
  });

  detailedRows = computed<ChangeRow[]>(() => {
    const schema = this._schema();
    const data = schema?.data;
    if (!data) {
      return [];
    }

    const prevData = schema?.prevData;
    const rows: ChangeRow[] = [];
    const addRow = (row: ChangeRow) => {
      if (this._shouldIncludeRow(row)) {
        rows.push(row);
      }
    };

    // Preferred reading order: name, location, media, type, access, description.
    if (this._hasOwn(data, "name")) {
      addRow({
        key: "name",
        icon: "badge",
        label: $localize`:@@spot-edit-summary.row.name:Name`,
        value: this._formatLocaleMap(data.name),
        previousValue: this._hasOwn(prevData, "name")
          ? this._formatLocaleMap(prevData?.name)
          : undefined,
      });
    }

    if (this._hasOwn(data, "location")) {
      addRow({
        key: "location",
        icon: "place",
        label: $localize`:@@spot-edit-summary.row.location:Location`,
        value: this._formatLocation(data.location),
        previousValue: this._hasOwn(prevData, "location")
          ? this._formatLocation(prevData?.location)
          : undefined,
      });
    }

    if (this._hasOwn(data, "media")) {
      addRow({
        key: "media",
        icon: "link",
        label: $localize`:@@spot-edit-summary.row.media:Media`,
        value: this._formatMediaCount(data.media),
        previousValue: this._hasOwn(prevData, "media")
          ? this._formatMediaCount(prevData?.media)
          : undefined,
      });
    }

    if (this._hasOwn(data, "type") && typeof data.type === "string") {
      const currentType = parseSpotType(data.type);
      const previousType =
        this._hasOwn(prevData, "type") && typeof prevData?.type === "string"
          ? parseSpotType(prevData.type)
          : null;
      addRow({
        key: "type",
        icon: SpotTypesIcons[currentType],
        label: $localize`:@@spot-edit-summary.row.type:Type`,
        value: SpotTypesNames[currentType],
        previousValue: previousType ? SpotTypesNames[previousType] : undefined,
      });
    }

    if (this._hasOwn(data, "access") && typeof data.access === "string") {
      const currentAccess = parseSpotAccess(data.access);
      const previousAccess =
        this._hasOwn(prevData, "access") && typeof prevData?.access === "string"
          ? parseSpotAccess(prevData.access)
          : null;
      addRow({
        key: "access",
        icon: SpotAccessIcons[currentAccess],
        label: $localize`:@@spot-edit-summary.row.access:Access`,
        value: SpotAccessNames[currentAccess],
        previousValue: previousAccess
          ? SpotAccessNames[previousAccess]
          : undefined,
      });
    }

    if (this._hasOwn(data, "description")) {
      addRow({
        key: "description",
        icon: "notes",
        label: $localize`:@@spot-edit-summary.row.description:Description`,
        value: this._formatLocaleMap(data.description, 80),
        previousValue: this._hasOwn(prevData, "description")
          ? this._formatLocaleMap(prevData?.description, 80)
          : undefined,
      });
    }

    // Remaining fields after the core summary.
    if (this._hasOwn(data, "hide_streetview")) {
      addRow({
        key: "streetview",
        icon: "streetview",
        label: $localize`:@@spot-edit-summary.row.streetview:Street View`,
        value: this._formatStreetView(data.hide_streetview),
        previousValue: this._hasOwn(prevData, "hide_streetview")
          ? this._formatStreetView(prevData?.hide_streetview)
          : undefined,
      });
    }

    if (this._hasOwn(data, "slug")) {
      addRow({
        key: "slug",
        icon: "link",
        label: $localize`:@@spot-edit-summary.row.slug:Slug`,
        value: this._formatText(data.slug),
        previousValue: this._hasOwn(prevData, "slug")
          ? this._formatText(prevData?.slug)
          : undefined,
      });
    }

    if (this._hasOwn(data, "bounds")) {
      addRow({
        key: "bounds",
        icon: "polyline",
        label: $localize`:@@spot-edit-summary.row.bounds:Bounds`,
        value: this._formatBounds(data.bounds),
        previousValue: this._hasOwn(prevData, "bounds")
          ? this._formatBounds(prevData?.bounds)
          : undefined,
      });
    }

    if (this._hasOwn(data, "external_references")) {
      addRow({
        key: "external_refs",
        icon: "link",
        label: $localize`:@@spot-edit-summary.row.external-refs:External references`,
        value: this._formatExternalReferences(data.external_references),
        previousValue: this._hasOwn(prevData, "external_references")
          ? this._formatExternalReferences(prevData?.external_references)
          : undefined,
      });
    }

    const amenities = data.amenities as AmenitiesMap | undefined;
    const previousAmenities = prevData?.amenities as AmenitiesMap | undefined;

    if (amenities) {
      for (const key of AmenitiesOrder) {
        const currentValue = amenities[key];
        if (typeof currentValue !== "boolean") {
          continue;
        }

        const previousValue = previousAmenities?.[key];
        if (
          typeof previousValue === "boolean" &&
          previousValue === currentValue
        ) {
          continue;
        }

        addRow({
          key: `amenity-${key}`,
          icon: currentValue
            ? (AmenityIcons[key] ?? "check")
            : (AmenityNegativeIcons[key] ?? "block"),
          label: AmenityNames[key] ?? key,
          value: currentValue
            ? $localize`:@@spot-edit-summary.row.amenity-yes:Yes`
            : $localize`:@@spot-edit-summary.row.amenity-no:No`,
          previousValue:
            typeof previousValue === "boolean"
              ? previousValue
                ? $localize`:@@spot-edit-summary.row.amenity-yes:Yes`
                : $localize`:@@spot-edit-summary.row.amenity-no:No`
              : undefined,
          tone: currentValue ? "default" : "negative",
          layout: "half",
        });
      }
    }

    return rows;
  });

  addedMedia = computed<DisplayMedia[]>(() => {
    const schema = this._schema();
    if (
      !schema?.data ||
      !Object.prototype.hasOwnProperty.call(schema.data, "media")
    ) {
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

  hasAnyContent = computed(() => {
    if (this.compact()) {
      return (
        this.typeAndAccessChips().length > 0 ||
        this.amenityChips().length > 0 ||
        this.fieldChips().length > 0 ||
        this.addedMedia().length > 0
      );
    }

    return this.detailedRows().length > 0 || this.addedMedia().length > 0;
  });

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

  private _hasOwn(
    obj: SpotEditSchema["data"] | undefined,
    key: keyof SpotEditSchema["data"]
  ): boolean {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  private _formatLocaleMap(value: unknown, truncateAt = 40): string {
    if (!value || typeof value !== "object") {
      return this._emptyValue();
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .map(([locale, localeValue]) => {
        const text = this._extractLocaleText(localeValue);
        if (!text) {
          return null;
        }
        return `${locale}: ${this._truncate(text, truncateAt)}`;
      })
      .filter((entry): entry is string => !!entry);

    return entries.length > 0 ? entries.join(" | ") : this._emptyValue();
  }

  private _extractLocaleText(value: unknown): string | null {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (value && typeof value === "object" && "text" in value) {
      const localeValue = value as { text?: unknown };
      if (typeof localeValue.text === "string") {
        const trimmed = localeValue.text.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
    }

    return null;
  }

  private _formatText(value: unknown): string {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : this._emptyValue();
    }
    return this._emptyValue();
  }

  private _formatLocation(location: unknown): string {
    const coordinates = this._extractCoordinates(location);
    if (!coordinates) {
      return this._emptyValue();
    }

    return `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`;
  }

  private _extractCoordinates(
    location: unknown
  ): { lat: number; lng: number } | null {
    if (!location || typeof location !== "object") {
      return null;
    }

    const asRecord = location as Record<string, unknown>;

    const directLat = this._toFiniteNumber(asRecord["lat"]);
    const directLng = this._toFiniteNumber(asRecord["lng"]);
    if (directLat !== null && directLng !== null) {
      return { lat: directLat, lng: directLng };
    }

    const geoLat = this._toFiniteNumber(asRecord["latitude"]);
    const geoLng = this._toFiniteNumber(asRecord["longitude"]);
    if (geoLat !== null && geoLng !== null) {
      return { lat: geoLat, lng: geoLng };
    }

    if (
      typeof asRecord["lat"] === "function" &&
      typeof asRecord["lng"] === "function"
    ) {
      const lat = this._toFiniteNumber((asRecord["lat"] as () => unknown)());
      const lng = this._toFiniteNumber((asRecord["lng"] as () => unknown)());
      if (lat !== null && lng !== null) {
        return { lat, lng };
      }
    }

    return null;
  }

  private _toFiniteNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private _formatBounds(bounds: unknown): string {
    if (!Array.isArray(bounds)) {
      return this._emptyValue();
    }
    if (bounds.length === 0) {
      return this._noneValue();
    }
    return bounds.length === 1
      ? $localize`:@@spot-edit-summary.row.bounds.single-point:1 point`
      : $localize`:@@spot-edit-summary.row.bounds.points:${bounds.length}:pointCount: points`;
  }

  private _formatExternalReferences(value: unknown): string {
    if (!value || typeof value !== "object") {
      return this._emptyValue();
    }

    const refs = value as {
      google_maps_place_id?: unknown;
      website_url?: unknown;
    };

    const labels: string[] = [];
    if (typeof refs.google_maps_place_id === "string" && refs.google_maps_place_id) {
      labels.push($localize`:@@spot-edit-summary.row.external-refs.google:Google Maps ID`);
    }
    if (typeof refs.website_url === "string" && refs.website_url) {
      labels.push($localize`:@@spot-edit-summary.row.external-refs.website:Website`);
    }

    return labels.length > 0
      ? labels.join(", ")
      : this._noneValue();
  }

  private _formatStreetView(value: unknown): string {
    if (typeof value !== "boolean") {
      return this._emptyValue();
    }

    return value
      ? $localize`:@@spot-edit-summary.row.streetview.hidden:Hidden`
      : $localize`:@@spot-edit-summary.row.streetview.visible:Visible`;
  }

  private _formatMediaCount(value: unknown): string {
    if (!Array.isArray(value)) {
      return this._emptyValue();
    }

    if (value.length === 0) {
      return this._noMediaValue();
    }

    return value.length === 1
      ? $localize`:@@spot-edit-summary.row.media.single:1 item`
      : $localize`:@@spot-edit-summary.row.media.multiple:${value.length}:itemCount: items`;
  }

  private _truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 1).trimEnd()}...`;
  }

  private _emptyValue(): string {
    return $localize`:@@spot-edit-summary.row.empty:Not set`;
  }

  private _noneValue(): string {
    return $localize`:@@spot-edit-summary.row.none:None`;
  }

  private _noMediaValue(): string {
    return $localize`:@@spot-edit-summary.row.media.none:No media`;
  }

  private _isPlaceholderValue(value: string | undefined): boolean {
    if (!value) {
      return true;
    }

    return (
      value === this._emptyValue() ||
      value === this._noneValue() ||
      value === this._noMediaValue()
    );
  }

  private _shouldIncludeRow(row: ChangeRow): boolean {
    if (!row.value) {
      return false;
    }
    if (this._isPlaceholderValue(row.value)) {
      return false;
    }
    if (
      row.previousValue !== undefined &&
      (row.previousValue === row.value ||
        this._isPlaceholderValue(row.previousValue))
    ) {
      row.previousValue = undefined;
    }
    return true;
  }
}
