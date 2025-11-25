import {
  Injectable,
  signal,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  Optional,
  Inject,
} from "@angular/core";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { isPlatformBrowser } from "@angular/common";
import { REQUEST } from "../../express.token";
import { Request } from "express";

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
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private request = inject(REQUEST, { optional: true }) as Request | null;

  /**
   * Tracks whether breakpoints have been determined
   * False during SSR and initial browser render until first breakpoint detection
   */
  readonly isInitialized = signal(!this.isBrowser); // True for SSR (we use UA), false for browser until first breakpoint

  /**
   * Mobile view: < 600px (xs & sm breakpoints)
   * Typical devices: phones
   */
  readonly isMobile = signal(this.detectInitialMobile());

  /**
   * Tablet view: 600px - 959px (md breakpoint)
   * Typical devices: tablets, large phones
   */
  readonly isTablet = signal(this.detectInitialTablet());

  /**
   * Desktop view: >= 960px (lg & xl breakpoints)
   * Typical devices: desktops, laptops
   */
  readonly isDesktop = signal(this.detectInitialDesktop());

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
    // Only setup breakpoint listener in browser environment
    if (this.isBrowser) {
      this.setupBreakpointListener();
    }
  }

  /**
   * Detect if device is mobile from User-Agent during SSR or window size in browser
   */
  private detectInitialMobile(): boolean {
    if (this.isBrowser) {
      // In browser, detect immediately using window.innerWidth
      if (typeof window !== 'undefined') {
        return window.innerWidth < 600;
      }
      return false;
    }
    return this.isMobileUserAgent();
  }

  /**
   * Detect if device is tablet from User-Agent during SSR or window size in browser
   */
  private detectInitialTablet(): boolean {
    if (this.isBrowser) {
      // In browser, detect immediately using window.innerWidth
      if (typeof window !== 'undefined') {
        return window.innerWidth >= 600 && window.innerWidth < 960;
      }
      return false;
    }
    return this.isTabletUserAgent();
  }

  /**
   * Detect if device is desktop from User-Agent during SSR or window size in browser
   */
  private detectInitialDesktop(): boolean {
    if (this.isBrowser) {
      // In browser, detect immediately using window.innerWidth
      if (typeof window !== 'undefined') {
        return window.innerWidth >= 960;
      }
      return true; // Fallback to desktop if window is not available
    }
    // Default to desktop if not mobile or tablet
    return !this.isMobileUserAgent() && !this.isTabletUserAgent();
  }

  /**
   * Check if User-Agent indicates a mobile device
   */
  private isMobileUserAgent(): boolean {
    if (!this.request) return false;
    const ua = this.request.headers["user-agent"] || "";
    return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  }

  /**
   * Check if User-Agent indicates a tablet device
   */
  private isTabletUserAgent(): boolean {
    if (!this.request) return false;
    const ua = this.request.headers["user-agent"] || "";
    return /iPad|Android(?!.*Mobile)/i.test(ua);
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
        
        // Mark as initialized after first emission
        if (!this.isInitialized()) {
          this.isInitialized.set(true);
        }
      });
  }
}
