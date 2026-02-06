import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  Inject,
  PLATFORM_ID,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatAnchor, MatButtonModule } from "@angular/material/button";
import { NgOptimizedImage, isPlatformBrowser } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { RouterLinkWithHref } from "@angular/router";
import { MatTooltipModule } from "@angular/material/tooltip";

interface Partner {
  name: string;
  url: string;
  logoUrl: string;
  logoClass: string;
  invert?: boolean;
}

@Component({
  selector: "app-about-page",
  templateUrl: "./about-page.component.html",
  styleUrls: ["./about-page.component.scss"],
  imports: [
    MatAnchor,
    MatIconModule,
    NgOptimizedImage,
    MatCardModule,
    MatButtonModule,
    RouterLinkWithHref,
    MatTooltipModule,
  ],
})
export class AboutPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild("carouselTrack") carouselTrack!: ElementRef<HTMLElement>;

  // Base partners data
  readonly basePartners: Partner[] = [
    {
      name: "Swiss Parkour Association (SPKA)",
      url: "https://spka.ch/",
      logoUrl: "assets/logos/spka_orange.png",
      logoClass: "spka-background",
      invert: false,
    },
    {
      name: "ETH Student Project House",
      url: "https://sph.ethz.ch/projects/pk-spot",
      logoUrl: "assets/logos/sph.svg",
      logoClass: "sph-background",
    },
    {
      name: "Parkour Earth",
      url: "https://www.parkour.earth/",
      logoUrl: "assets/logos/parkour_earth_white.png",
      logoClass: "parkour-earth-background",
    },
  ];

  // Repeat sufficiently to cover large screens and fast scrolling
  // 30 copies * 2 items * 200px = 12,000px total width
  // Half width (reset point) = 6,000px
  partners: Partner[] = Array(30).fill(this.basePartners).flat();

  private currentOffset = 0;
  private readonly baseSpeed = 0.2; // Halved base speed
  private scrollVelocity = 0;
  private lastScrollTop = 0;
  private animationFrameId: number | null = null;
  private isBrowser: boolean;
  private scrollParent: HTMLElement | Window | null = null;

  constructor(private ngZone: NgZone, @Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit() {
    if (this.isBrowser) {
      if (this.carouselTrack?.nativeElement) {
        this.scrollParent = this.getScrollParent(
          this.carouselTrack.nativeElement
        );
      } else {
        this.scrollParent = window;
      }

      this.lastScrollTop = this.getScrollTop();
      this.scrollParent.addEventListener("scroll", this.onScroll, {
        passive: true,
      });

      this.startAnimation();
    }
  }

  ngOnDestroy() {
    if (this.isBrowser) {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
      }
      if (this.scrollParent) {
        this.scrollParent.removeEventListener("scroll", this.onScroll);
      }
    }
  }

  private getScrollParent(node: HTMLElement | null): HTMLElement | Window {
    if (!node) return window;
    // Check if node is scrollable
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const isScrollable =
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight;

    if (isScrollable) {
      return node;
    } else {
      return node.parentElement
        ? this.getScrollParent(node.parentElement)
        : window;
    }
  }

  private getScrollTop(): number {
    if (!this.scrollParent) return 0;
    if (this.scrollParent === window) {
      return window.scrollY;
    } else {
      return (this.scrollParent as HTMLElement).scrollTop;
    }
  }

  private onScroll = () => {
    if (!this.isBrowser) return;
    const currentScrollTop = this.getScrollTop();
    const delta = currentScrollTop - this.lastScrollTop;

    // Increase sensitivity
    // Scrolling down (positive delta) -> moves left faster (positive velocity)
    this.scrollVelocity += delta * 0.05;

    this.lastScrollTop = currentScrollTop;
  };

  private startAnimation() {
    if (!this.isBrowser) return;

    this.ngZone.runOutsideAngular(() => {
      const animate = () => {
        // Friction to return to base speed
        this.scrollVelocity *= 0.95;

        const currentSpeed = this.baseSpeed + this.scrollVelocity;

        this.currentOffset -= currentSpeed;

        const trackWidth = this.carouselTrack.nativeElement.scrollWidth / 2;

        if (Math.abs(this.currentOffset) >= trackWidth) {
          this.currentOffset = 0;
        }
        if (this.currentOffset > 0) {
          this.currentOffset = -trackWidth;
        }

        this.carouselTrack.nativeElement.style.transform = `translateX(${this.currentOffset}px)`;

        this.animationFrameId = requestAnimationFrame(animate);
      };
      this.animationFrameId = requestAnimationFrame(animate);
    });
  }
}
