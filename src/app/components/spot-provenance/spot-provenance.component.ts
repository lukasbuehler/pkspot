import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
  resource,
} from "@angular/core";
import {isPlatformBrowser} from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { PublicImportProvenance } from "../../../db/schemas/ImportSchema";
import { ImportsService } from "../../services/firebase/firestore/imports.service";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-spot-provenance",
  imports: [MatButtonModule],
  templateUrl: "./spot-provenance.component.html",
  styleUrl: "./spot-provenance.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotProvenanceComponent {
  spot = input<Spot | LocalSpot | null>(null);

  private _importsService = inject(ImportsService);
  private _analytics = inject(AnalyticsService);
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  sourceRaw = computed(() => this.spot()?.source()?.trim() ?? "");

  private _importId = computed(() => {
    const source = this.sourceRaw();
    if (!source || this._isLikelyUrl(source)) {
      return null;
    }
    return source;
  });

  private _fallbackProvenance = resource({
    params: () => {
      const spot = this.spot();
      const importId = this._importId();
      return this._isBrowser &&
        importId &&
        spot?.publicImportProvenance === undefined
        ? {importId}
        : undefined;
    },
    loader: ({params}) =>
      this._importsService.getPublicProvenanceById(params.importId),
  });

  private _importProvenance = computed<PublicImportProvenance | null>(() => {
    const projection = this.spot()?.publicImportProvenance;
    return projection !== undefined
      ? projection
      : (this._fallbackProvenance.value() ?? null);
  });

  sourceDisplayText = computed(() => {
    const provenance = this._importProvenance();
    if (provenance?.source_name) {
      return provenance.source_name;
    }

    const source = this.sourceRaw();

    // actually, let's not show any source for PK Spot spots
    if (!source || source === "pkspot") return "";

    const sourceMap: Record<string, string> = {
      "horizn-app": "Horizn Community",
      pkspot: "PK Spot Community",
    };

    return sourceMap[source] || source;
  });

  importedAttributionText = computed(() => {
    const text = this._importProvenance()?.attribution_text?.trim();
    return text && text.length > 0 ? text : null;
  });

  importViewerUrl = computed(() =>
    this._safeExternalUrl(this._importProvenance()?.viewer_url)
  );

  sourceUrl = computed(() => {
    const provenance = this._importProvenance();
    const importWebsite =
      this._safeExternalUrl(provenance?.website_url) ??
      this._safeExternalUrl(provenance?.source_url);
    return importWebsite ?? this._safeExternalUrl(this.sourceRaw());
  });

  showSourceUrlButton = computed(() => {
    const sourceUrl = this.sourceUrl();
    const viewerUrl = this.importViewerUrl();
    return !!sourceUrl && sourceUrl !== viewerUrl;
  });

  instagramUrl = computed(() =>
    this._safeExternalUrl(this._importProvenance()?.instagram_url)
  );

  trackSourceLinkClick(
    linkType: "import_viewer" | "source" | "instagram" | "license",
    url: string | null | undefined
  ): void {
    const spot = this.spot();
    this._analytics.trackEvent("spot_source_link_clicked", {
      spot_id: spot instanceof Spot ? spot.id : null,
      link_type: linkType,
      source_name: this.sourceDisplayText() || null,
      destination_domain: this._destinationDomain(url),
    });
  }

  private _safeExternalUrl(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  private _isLikelyUrl(value: string): boolean {
    return this._safeExternalUrl(value) !== null;
  }

  private _destinationDomain(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    try {
      return new URL(url).hostname || null;
    } catch {
      return null;
    }
  }
}
