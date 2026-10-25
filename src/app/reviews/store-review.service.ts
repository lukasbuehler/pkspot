import { AnalyticsService } from "../services/analytics.service";
import { MediaUploadStatusService } from "../services/firebase/firestore/media-upload-status.service";
import { DestroyRef, Injectable, inject } from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { Router, NavigationStart } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { MatDialog } from "@angular/material/dialog";
import { readReviewHistory, reviewEligible, REVIEW_HISTORY_KEY, ReviewHistory } from "./review-policy";

export const NativeStoreReview = registerPlugin<{
  prepare(): Promise<void>;
  request(): Promise<void>;
}>("StoreReview");

/** Local, capped engagement counts only: no location, sentiment or review outcome. */
@Injectable({ providedIn: "root" })
export class StoreReviewService {
  private readonly analytics = inject(AnalyticsService);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly uploads = Capacitor.isNativePlatform() ? inject(MediaUploadStatusService) : undefined;
  private readonly dialogs = inject(MatDialog);
  private readonly destroy = inject(DestroyRef);
  private history?: ReviewHistory;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private safeSurface?: () => boolean;

  constructor() {
    if (!Capacitor.isNativePlatform()) return;
    this.visit();
    const cancel = () => this.cancel();
    const events = ["pointerdown", "pointermove", "touchstart", "touchmove", "wheel", "scroll", "keydown", "input", "focusin"];
    for (const event of events) this.document.addEventListener(event, cancel, { capture: true, passive: true });
    const visibility = () => { this.cancel(); if (!this.document.hidden) this.visit(); };
    this.document.addEventListener("visibilitychange", visibility);
    this.document.defaultView?.addEventListener("blur", cancel);
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.cancel();
    });
    this.dialogs.afterOpened.pipe(takeUntilDestroyed()).subscribe(cancel);
    this.destroy.onDestroy(() => {
      this.cancel();
      for (const event of events) this.document.removeEventListener(event, cancel, true);
      this.document.removeEventListener("visibilitychange", visibility);
      this.document.defaultView?.removeEventListener("blur", cancel);
    });
  }

  registerCompletionSurface(ready: () => boolean): () => void {
    this.safeSurface = ready;
    return () => { if (this.safeSurface === ready) { this.safeSurface = undefined; this.cancel(); } };
  }

  recordActivity(): void {
    if (!this.history) return;
    this.visit();
    this.history.actions = Math.min(3, this.history.actions + 1);
    this.persist();
  }

  /** Called only after a successful new activity save and navigation to its overview. */
  offerAfterCompletion(): void {
    this.cancel();
    if (!this.history || !reviewEligible(this.history, Date.now())) return;
    const generation = this.generation;
    this.timer = setTimeout(() => { void this.attempt(generation); }, 5000);
  }

  private async attempt(generation: number): Promise<void> {
    if (!this.safe(generation)) return;
    let stage: "prepare" | "request" = "prepare";
    try {
      // Play's preparation is asynchronous. Recheck cancellation before displaying anything.
      await NativeStoreReview.prepare();
      if (!this.safe(generation) || !this.history) return;
      this.history.lastAttempt = Date.now();
      if (!this.persist()) return; // Never prompt without a durable cooldown.
      stage = "request";
      this.trackReview("store_review_request_attempted");
      await NativeStoreReview.request();
      // Native completion does not prove that a dialog appeared or a review was submitted.
      this.trackReview("store_review_request_returned");
    } catch {
      this.trackReview("store_review_api_failed", stage);
    }
  }

  private trackReview(event: string, stage?: "prepare" | "request"): void {
    try {
      this.analytics.trackEvent(event, {
        surface: "activity_log",
        trigger: "activity_saved",
        ...(stage ? { stage } : {}),
      });
    } catch { /* Analytics must not affect the review flow or cooldown. */ }
  }

  private safe(generation: number): boolean {
    return generation === this.generation && !this.document.hidden &&
      this.dialogs.openDialogs.length === 0 &&
      !this.uploads?.localUploads().some(upload => upload.status === "processing") && this.safeSurface?.() === true &&
      !this.document.querySelector('.cdk-overlay-pane, [aria-busy="true"], input:focus, textarea:focus, [contenteditable="true"]:focus');
  }

  private cancel(): void {
    this.generation++;
    clearTimeout(this.timer);
  }

  private visit(): void {
    try {
      const now = Date.now();
      this.history ??= readReviewHistory(this.document.defaultView!.localStorage.getItem(REVIEW_HISTORY_KEY), now);
      const date = new Date(now);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      this.history.days = [...new Set([...this.history.days, day])].slice(-3);
      this.persist();
    } catch { this.history = undefined; }
  }

  private persist(): boolean {
    try {
      this.document.defaultView!.localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(this.history));
      return true;
    } catch { return false; }
  }
}
