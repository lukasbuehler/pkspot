import { Injectable, Injector, inject, signal } from "@angular/core";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Dialog } from "@angular/cdk/dialog";
import { MatDialog } from "@angular/material/dialog";
import { ShareCardDialogComponent, ShareCardDialogData, ShareCardDialogState } from "../components/share-card-dialog/share-card-dialog.component";
import { SharePreparationComponent } from "../components/share-preparation/share-preparation.component";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { FeatureTelemetryService } from "./feature-telemetry.service";
import { environment } from "../../environments/environment.default";
import { ShareCardTarget } from "../../scripts/ShareCardHelpers";

interface LinkPreviewBridge {
  share(options: { url: string; title: string; imageBase64?: string }): Promise<{ cancelled?: boolean; previewApplied?: boolean }>;
}
const LinkPreview = registerPlugin<LinkPreviewBridge>("LinkPreview");
interface PreparedCard { imageUrl: string; reused: boolean }

/** Keep preview preparation optional: timeout, offline and provider failures never
 * prevent sharing the underlying link. The native image is metadata, not a file item. */
@Injectable({ providedIn: "root" })
export class ShareCardService {
  private readonly injector = inject(Injector);
  private get functions(): FunctionsAdapterService { return this.injector.get(FunctionsAdapterService); }
  private readonly telemetry = inject(FeatureTelemetryService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly active = signal(false);
  readonly preparing = this.active.asReadonly();

  async share(target: ShareCardTarget, url: string, title: string): Promise<void> {
    if (this.active()) return;
    this.active.set(true);
    try {
      if (!environment.features.shareCards) await this.openShareSheet(url, title);
      else if (Capacitor.isNativePlatform()) await this.shareNative(target, url, title);
      else await this.shareWeb(target, url, title);
    } finally {
      // The web dialog stays open after this resolves and releases `active` itself.
      if (!this.dialogOpen) this.active.set(false);
    }
  }

  private dialogOpen = false;

  /** Native: blurred overlay while preparing, then straight into the share sheet. */
  private async shareNative(target: ShareCardTarget, url: string, title: string): Promise<void> {
    const overlay = this.injector.get(Dialog).open(SharePreparationComponent, {
      width: "100vw", height: "100dvh", maxWidth: "100vw",
      disableClose: true, autoFocus: "dialog",
      ariaLabel: $localize`:@@share_card.preparing:Preparing your link…`,
    });
    let imageBase64: string | undefined;
    try {
      const prepared = await this.prepare(target);
      if (prepared) {
        try { imageBase64 = await this.loadImage(prepared.imageUrl); }
        catch (error) { this.telemetry.failure("share-card", "download-preview", error); }
      }
    } finally { overlay.close(); }
    await this.openShareSheet(url, title, imageBase64);
  }

  /** Web: a dialog that shows the card (or just the title on failure) with Share and Copy link. */
  private async shareWeb(target: ShareCardTarget, url: string, title: string): Promise<void> {
    const state = signal<ShareCardDialogState>({ status: "preparing" });
    this.dialogOpen = true;
    const ref = this.injector.get(MatDialog).open<ShareCardDialogComponent, ShareCardDialogData>(ShareCardDialogComponent, {
      width: "min(480px, calc(100vw - 32px))",
      data: {
        title, state: state.asReadonly(),
        share: async () => { if (await this.openShareSheet(url, title)) ref.close(); },
        copy: () => this.copyLink(url),
      },
    });
    let closed = false;
    ref.afterClosed().subscribe(() => { closed = true; this.dialogOpen = false; this.active.set(false); });
    const prepared = await this.prepare(target);
    // Closing the dialog while preparing cancels without sharing.
    if (!closed) state.set(prepared ? { status: "ready", imageUrl: prepared.imageUrl } : { status: "fallback" });
  }

  /** Returns undefined (after reporting) when the card could not be prepared. */
  private async prepare(target: ShareCardTarget): Promise<PreparedCard | undefined> {
    try {
      const prepared = await this.withTimeout(this.functions.callAppChecked<ShareCardTarget, PreparedCard>("prepareShareCard", target), 8000);
      this.telemetry.outcome("share-card", prepared.reused ? "reuse" : "generate", true);
      return prepared;
    } catch (error) {
      this.telemetry.failure("share-card", "prepare-preview", error);
      return undefined;
    }
  }

  private async copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.snackbar.open($localize`:@@share_card.copied:Link copied.`, undefined, { duration: 3000 });
      this.telemetry.outcome("share-card", "open-share-sheet-or-copy", true);
    } catch (error) {
      this.telemetry.failure("share-card", "share-link", error);
      this.snackbar.open($localize`:@@share_card.failed:Couldn't share the link. Please try again.`, undefined, { duration: 5000 });
    }
  }

  /** Opens the platform share UI; returns false when cancelled or failed. */
  private async openShareSheet(url: string, title: string, imageBase64?: string): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        if (environment.features.shareCards && Capacitor.isPluginAvailable("LinkPreview")) {
          try {
            const result = await LinkPreview.share({ url, title, imageBase64 });
            if (imageBase64 && result.previewApplied === false) this.telemetry.failure("share-card", "native-preview", new Error("Preview unavailable"));
            if (result.cancelled) return false;
          } catch (error) {
            this.telemetry.failure("share-card", "native-preview-bridge", error);
            const { Share } = await import("@capacitor/share");
            await Share.share({ url, title });
          }
        } else {
          const { Share } = await import("@capacitor/share");
          await Share.share({ url, title });
        }
      } else if (navigator.share) await navigator.share({ url, title });
      else {
        await navigator.clipboard.writeText(url);
        this.snackbar.open($localize`:@@share_card.copied:Link copied.`, undefined, { duration: 3000 });
      }
      this.telemetry.outcome("share-card", "open-share-sheet-or-copy", true);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      this.telemetry.failure("share-card", "share-link", error);
      this.snackbar.open($localize`:@@share_card.failed:Couldn't share the link. Please try again.`, undefined, { duration: 5000 });
      return false;
    }
  }

  private async loadImage(url: string): Promise<string> {
    const expected = `https://europe-west1-${environment.keys.firebaseConfig.projectId}.cloudfunctions.net/shareCardImage`;
    if (!url.startsWith(`${expected}?`)) throw new Error("Invalid preview endpoint");
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error("Preview download failed");
    const blob = await response.blob();
    if (blob.size > 3 * 1024 * 1024 || blob.type !== "image/png") throw new Error("Invalid preview image");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Preview decode failed"));
      reader.readAsDataURL(blob);
    });
  }

  private async withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject({ code: "deadline-exceeded" }), ms);
    })]); } finally { clearTimeout(timer); }
  }
}
