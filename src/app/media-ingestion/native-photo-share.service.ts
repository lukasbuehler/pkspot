import {Injectable, inject} from "@angular/core";
import {Capacitor, registerPlugin, type PluginListenerHandle} from "@capacitor/core";
import {App} from "@capacitor/app";
import {MatDialog} from "@angular/material/dialog";
import {MatSnackBar} from "@angular/material/snack-bar";
import {Router} from "@angular/router";
import {combineLatest, firstValueFrom} from "rxjs";
import {toObservable} from "@angular/core/rxjs-interop";
import {AuthenticationService} from "../services/firebase/authentication.service";
import {AgeAssuranceService} from "../services/age-assurance.service";
import {SpotId} from "../../db/schemas/SpotSchema";
import {prepareSpotPhoto} from "./spot-photo-preparation";

interface SharedPhotoBatch {
  id: string;
  files: {uri: string; mimeType: string; name: string}[];
}
const PhotoShare = registerPlugin<{
  pending(): Promise<{batches: SharedPhotoBatch[]}>;
  acknowledge(input: {id: string}): Promise<void>;
  addListener(event: "photosReceived" | "photosFailed", callback: () => void): Promise<PluginListenerHandle>;
}>("PhotoShare");

/** Experimental native entry point into the existing moderated upload flow. */
@Injectable({providedIn: "root"})
export class NativePhotoShareService {
  private readonly ageAssurance = inject(AgeAssuranceService);
  private readonly auth = inject(AuthenticationService);
  private readonly authReady = toObservable(this.auth.initialAuthStateResolved);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private initialized = false;
  private processing = false;
  private rerun = false;
  private readonly deferred = new Set<string>();

  async initialize(): Promise<void> {
    if (this.initialized || Capacitor.getPlatform() !== "android") return;
    this.initialized = true;
    await PhotoShare.addListener("photosReceived", () => void this.review());
    await PhotoShare.addListener("photosFailed", () => this.showFailure());
    await App.addListener("appStateChange", ({isActive}) => {
      if (isActive) {
        if (!this.processing) this.deferred.clear();
        void this.review();
      }
    });
    combineLatest([this.authReady, this.auth.authState$]).subscribe(([ready]) => {
      if (ready) void this.review();
    });
  }

  private showFailure(): void {
    this.snackbar.open(
      $localize`Could not prepare shared photos. Share up to 8 JPEG, PNG or WebP photos and try again.`,
      $localize`Dismiss`, {duration: 8000},
    );
  }

  private async review(): Promise<void> {
    if (!this.auth.initialAuthStateResolved()) return;
    if (this.processing) { this.rerun = true; return; }
    this.processing = true;
    try {
      const {batches} = await PhotoShare.pending();
      if (!batches.length) return;
      if (!this.auth.authState$.value) {
        this.snackbar.open($localize`Sign in to upload photos.`, $localize`Dismiss`, {duration: 6000});
        await this.router.navigate(["/account"]);
        return;
      }
      if (!this.ageAssurance.canParticipatePublicly()) {
        this.snackbar.open(this.ageAssurance.getRestrictionMessage(), $localize`Dismiss`, {duration: 6000});
        return;
      }
      for (const batch of batches) {
        if (this.deferred.has(batch.id)) continue;
        this.deferred.add(batch.id);
        const {SharedPhotoTargetDialogComponent} = await import("../components/shared-photo-target-dialog/shared-photo-target-dialog.component");
        const target = await firstValueFrom(this.dialog.open(SharedPhotoTargetDialogComponent, {width: "560px"}).afterClosed());
        if (target?.discard) { await PhotoShare.acknowledge({id: batch.id}); continue; }
        const spotId = target?.spotId;
        if (!spotId) continue;
        const files: File[] = [];
        const progress = this.snackbar.open($localize`Preparing photos…`);
        try {
          // Sequential preparation bounds decoder memory and strips source EXIF.
          for (const photo of batch.files) {
            const response = await fetch(Capacitor.convertFileSrc(photo.uri));
            if (!response.ok) throw new Error("photo-unavailable");
            const source = new Blob([await response.blob()], {type: photo.mimeType});
            const prepared = await prepareSpotPhoto(source);
            if (!prepared.ready) throw new Error(prepared.reason);
            files.push(new File([prepared.blob], `${photo.name}.jpg`, {type: "image/jpeg"}));
          }
        } catch {
          progress.dismiss();
          const action = await firstValueFrom(this.dialog.open(SharedPhotoTargetDialogComponent, {
            width: "560px", data: {failed: true},
          }).afterClosed());
          if (action?.discard) await PhotoShare.acknowledge({id: batch.id});
          if (action?.retry) { this.deferred.delete(batch.id); this.rerun = true; }
          continue;
        } finally { progress.dismiss(); }
        if (!this.ageAssurance.canParticipatePublicly() || !this.auth.authState$.value) return;
        const {MediaUploadDialogComponent} = await import("../components/media-upload-dialog/media-upload-dialog.component");
        const result = await firstValueFrom(this.dialog.open(MediaUploadDialogComponent, {
          width: "680px", disableClose: true,
          data: {spotId: spotId as SpotId, initialFiles: files, allowedMimeTypes: ["image/jpeg"]},
        }).afterClosed());
        // Native originals survive cancellation, crashes and upload failures.
        // Only an explicit discard or completed upload acknowledges the batch.
        if (result === "completed" || result === "discarded") await PhotoShare.acknowledge({id: batch.id});
      }
    } catch {
      this.showFailure();
    } finally {
      this.processing = false;
      if (this.rerun) { this.rerun = false; void this.review(); }
    }
  }
}
