import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { ImportSchema } from "../../../db/schemas/ImportSchema";
import { ImportsService } from "../../services/firebase/firestore/imports.service";

type ImportDocument = ImportSchema & { id: string };

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
  private _importLookupRequestId = 0;
  private _importDoc = signal<ImportDocument | null>(null);

  sourceRaw = computed(() => this.spot()?.source()?.trim() ?? "");

  private _importId = computed(() => {
    const source = this.sourceRaw();
    if (!source || this._isLikelyUrl(source)) {
      return null;
    }
    return source;
  });

  sourceDisplayText = computed(() => {
    const importDoc = this._importDoc();
    if (importDoc?.credits?.source_name) {
      return importDoc.credits.source_name;
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
    const text = this._importDoc()?.credits?.attribution_text?.trim();
    return text && text.length > 0 ? text : null;
  });

  importViewerUrl = computed(() =>
    this._safeExternalUrl(this._importDoc()?.viewer_url)
  );

  sourceUrl = computed(() => {
    const importDoc = this._importDoc();
    const importWebsite =
      this._safeExternalUrl(importDoc?.credits?.website_url) ??
      this._safeExternalUrl(importDoc?.source_url);
    return importWebsite ?? this._safeExternalUrl(this.sourceRaw());
  });

  showSourceUrlButton = computed(() => {
    const sourceUrl = this.sourceUrl();
    const viewerUrl = this.importViewerUrl();
    return !!sourceUrl && sourceUrl !== viewerUrl;
  });

  instagramUrl = computed(() =>
    this._safeExternalUrl(this._importDoc()?.credits?.instagram_url)
  );

  constructor() {
    effect(() => {
      const requestId = ++this._importLookupRequestId;
      const importId = this._importId();

      this._importDoc.set(null);

      if (!importId) {
        return;
      }

      void this._importsService
        .getImportById(importId)
        .then((importDoc) => {
          if (requestId !== this._importLookupRequestId) {
            return;
          }
          this._importDoc.set(importDoc);
        })
        .catch((error) => {
          if (requestId !== this._importLookupRequestId) {
            return;
          }
          console.warn("Could not load import provenance", importId, error);
          this._importDoc.set(null);
        });
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
}
