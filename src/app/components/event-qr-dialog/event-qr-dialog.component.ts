import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent } from "../../../db/models/Event";
import { AnalyticsService } from "../../services/analytics.service";

export interface EventQrDialogData {
  event: PkEvent;
  url: string;
}

@Component({
  selector: "app-event-qr-dialog",
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: "./event-qr-dialog.component.html",
  styleUrl: "./event-qr-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventQrDialogComponent {
  private readonly _analytics = inject(AnalyticsService);

  readonly data = inject<EventQrDialogData>(MAT_DIALOG_DATA);
  readonly qrDataUrl = signal("");
  readonly error = signal("");
  readonly copied = signal(false);

  constructor() {
    void this._generateQrCode();
    this._analytics.trackEvent("event_qr_dialog_opened", {
      event_id: this.data.event.id,
      event_slug: this.data.event.slug ?? null,
    });
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.data.url);
      this.copied.set(true);
      this._analytics.trackEvent("event_qr_link_copied", {
        event_id: this.data.event.id,
      });
    } catch (error) {
      console.error("Could not copy event QR link", error);
      this.error.set(
        $localize`:@@event_qr.copy_failed:Couldn't copy the link.`,
      );
    }
  }

  download(): void {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${safeFileName(this.data.event.slug ?? this.data.event.name)}-pkspot-qr.png`;
    anchor.click();
    this._analytics.trackEvent("event_qr_downloaded", {
      event_id: this.data.event.id,
    });
  }

  private async _generateQrCode(): Promise<void> {
    try {
      const { toDataURL } = await import("qrcode");
      this.qrDataUrl.set(
        await toDataURL(this.data.url, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 640,
        }),
      );
    } catch (error) {
      console.error("Could not generate event QR code", error);
      this.error.set(
        $localize`:@@event_qr.generate_failed:Couldn't generate the QR code.`,
      );
    }
  }
}

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "event"
  );
}
