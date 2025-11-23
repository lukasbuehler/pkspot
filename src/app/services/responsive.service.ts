import { Injectable, signal, computed, effect, inject } from "@angular/core";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";

/**
 * Responsive view mode based on screen size breakpoints
 * - mobile: < 600px (extra small & small screens)
 * - tablet: 600px - 959px (medium screens)
 * - desktop: >= 960px (large screens and up)
 */
export type ViewMode = "mobile" | "tablet" | "desktop";

/**
 * Service that provides reactive breakpoint detection using Angular signals.
 * Replaces Bootstrap's CSS media query classes (d-md-none, d-lg-block, etc.)
 * with a signal-based approach for better type safety and template control.
 *
 * Usage in templates:
 * @if(responsive.isMobile()) { ... }
 * @if(responsive.isTablet()) { ... }
 * @if(responsive.isDesktop()) { ... }
 *
 * Usage in components:
 * responsive.viewMode() === 'mobile' ? ... : ...
 */
@Injectable({ providedIn: "root" })
export class ResponsiveService {
  private breakpointObserver = inject(BreakpointObserver);

  /**
   * Mobile view: < 600px (xs & sm breakpoints)
   * Typical devices: phones
   */
  readonly isMobile = signal(false);

  /**
   * Tablet view: 600px - 959px (md breakpoint)
   * Typical devices: tablets, large phones
   */
  readonly isTablet = signal(false);

  /**
   * Desktop view: >= 960px (lg & xl breakpoints)
   * Typical devices: desktops, laptops
   */
  readonly isDesktop = signal(false);

  /**
   * Current view mode
   */
  readonly viewMode = computed<ViewMode>(() => {
    if (this.isMobile()) return "mobile";
    if (this.isTablet()) return "tablet";
    return "desktop";
  });

  /**
   * True if screen is NOT mobile (tablet or desktop)
   */
  readonly isNotMobile = computed(() => !this.isMobile());

  /**
   * True if screen is NOT tablet (mobile or desktop)
   */
  readonly isNotTablet = computed(() => !this.isTablet());

  /**
   * True if screen is NOT desktop (mobile or tablet)
   */
  readonly isNotDesktop = computed(() => !this.isDesktop());

  constructor() {
    this.setupBreakpointListener();
  }

  private setupBreakpointListener() {
    // Listen to CDK breakpoints: xs (0), sm (576), md (600), lg (960), xl (1200), xxl (1400)
    // We use custom breakpoints to align with Bootstrap's grid:
    // - Mobile: < 600px
    // - Tablet: 600px - 959px
    // - Desktop: >= 960px
    this.breakpointObserver
      .observe([
        "(max-width: 599.98px)", // mobile
        "(min-width: 600px) and (max-width: 959.98px)", // tablet
        "(min-width: 960px)", // desktop
      ])
      .subscribe((result) => {
        const isMobile = result.breakpoints["(max-width: 599.98px)"];
        const isTablet =
          result.breakpoints["(min-width: 600px) and (max-width: 959.98px)"];
        const isDesktop = result.breakpoints["(min-width: 960px)"];

        this.isMobile.set(isMobile);
        this.isTablet.set(isTablet);
        this.isDesktop.set(isDesktop);
      });
  }
}
