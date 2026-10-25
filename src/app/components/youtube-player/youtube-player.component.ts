import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef,
  afterNextRender, computed, inject, input, linkedSignal, signal,
} from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";
import { MatButtonModule } from "@angular/material/button";
import { ExternalMediaPreferencesService } from "../../services/external-media-preferences.service";
import { youtubeVideoId } from "../../../db/utils/youtube-video";

@Component({
  selector: "app-youtube-player",
  imports: [MatButtonModule],
  templateUrl: "./youtube-player.component.html",
  styleUrl: "./youtube-player.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YoutubePlayerComponent {
  readonly src = input.required<string>();
  readonly active = input(true);
  readonly preferences = inject(ExternalMediaPreferencesService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly visible = signal(false);
  readonly videoId = computed(() => youtubeVideoId(this.src()));
  readonly loadOnce = linkedSignal({
    source: () => ({ id: this.videoId(), revocation: this.preferences.revocationVersion() }),
    computation: () => false,
  });
  readonly watchUrl = computed(() => `https://www.youtube.com/watch?v=${this.videoId()}`);
  readonly playerUrl = computed(() => {
    const id = this.videoId();
    if (!id || !this.active() || !this.visible() || !(this.loadOnce() || this.preferences.youtubeAllowed())) return null;
    // Only the strict video ID parser above can contribute to this trusted URL.
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&autoplay=0`,
    );
  });

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === "undefined") {
        this.visible.set(true);
        return;
      }
      const observer = new IntersectionObserver(([entry]) => {
        // Removing an offscreen player also stops audio when its slide leaves view.
        this.visible.set(entry.isIntersecting && entry.intersectionRatio >= 0.35);
      }, { threshold: [0, 0.35] });
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
