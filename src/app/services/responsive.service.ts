import {
  Injectable,
  signal,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  REQUEST,
} from "@angular/core";
import { BreakpointObserver } from "@angular/cdk/layout";
import { isPlatformBrowser } from "@angular/common";
import { getNavigationLayout } from "../features/navigation-layout";

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
  private readonly destroyRef = inject(DestroyRef);
  private initializationFrame = 0;
  private breakpointObserver = inject(BreakpointObserver);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private request = inject(REQUEST);
  private _initializationCheckScheduled = false;

  /**
   * Tracks whether breakpoints have been determined.
   * Always false during SSR (we don't trust UA detection for layout).
   * In browser: false until first BreakpointObserver emission.
   * This ensures layout-specific components (@defer blocks) only render client-side.
   */
  readonly isInitialized = signal(false);

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

  /** Current layout viewport width, observed independently of the app shell. */
  private readonly _viewportWidth = signal<number | null>(this.getViewportWidth());
  readonly viewportWidth = this._viewportWidth.asReadonly();

  /**
   * Current layout viewport height, observed independently of the app shell.
   * Deliberately uses `innerHeight` rather than VisualViewport so opening the
   * keyboard never switches the navigation placement.
   */
  private readonly _viewportHeight = signal<number | null>(
    this.getViewportHeight(),
  );
  readonly viewportHeight = this._viewportHeight.asReadonly();

  readonly navigationLayout = computed(() => getNavigationLayout({
    width: this.viewportWidth(),
    height: this.viewportHeight(),
  }));
  readonly alainMode = computed(() => this.navigationLayout() === "menu");

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
      this.observeViewport();
    }
  }

  refreshViewport(): void {
    this._viewportWidth.set(this.getViewportWidth());
    this._viewportHeight.set(this.getViewportHeight());
    const mode = this.detectViewportMode();
    if (mode) this.applyViewportMode(mode);
  }

  /**
   * Detect if device is mobile from User-Agent during SSR or window size in browser
   */
  private detectInitialMobile(): boolean {
    if (this.isBrowser) {
      // In browser, detect immediately using window.innerWidth
      const width = this.getViewportWidth();
      if (width !== null) {
        return width < 600;
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
      const width = this.getViewportWidth();
      if (width !== null) {
        return width >= 600 && width < 960;
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
      const width = this.getViewportWidth();
      if (width !== null) {
        return width >= 960;
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

    // Check modern Client Hints header
    const secChUaMobile = this.request.headers.get("sec-ch-ua-mobile");
    if (secChUaMobile === "?1") return true;
    if (secChUaMobile === "?0") return false;

    const ua = this.request.headers.get("user-agent") ?? "";
    // Added 'Mobile' to the regex to catch more general mobile user agents
    return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      ua
    );
  }

  /**
   * Check if User-Agent indicates a tablet device
   */
  private isTabletUserAgent(): boolean {
    if (!this.request) return false;
    const ua = this.request.headers.get("user-agent") ?? "";
    return /iPad|Android(?!.*Mobile)/i.test(ua);
  }

  private setupBreakpointListener() {
    // Listen to CDK breakpoints: xs (0), sm (576), md (600), lg (960), xl (1200), xxl (1400)
    // We use custom breakpoints to align with Bootstrap's grid:
    // - Mobile: < 600px
    // - Tablet: 600px - 959px
    // - Desktop: >= 960px
    const subscription = this.breakpointObserver
      .observe([
        "(max-width: 599.98px)", // mobile
        "(min-width: 600px) and (max-width: 959.98px)", // tablet
        "(min-width: 960px)", // desktop
      ])
      .subscribe((result) => {
        this.refreshViewport();
        const viewportMode = this.detectViewportMode();
        const isMobile =
          viewportMode === "mobile" ||
          (!viewportMode && result.breakpoints["(max-width: 599.98px)"]);
        const isTablet =
          viewportMode === "tablet" ||
          (!viewportMode &&
            result.breakpoints["(min-width: 600px) and (max-width: 959.98px)"]);
        const isDesktop =
          viewportMode === "desktop" ||
          (!viewportMode && result.breakpoints["(min-width: 960px)"]);

        this.isMobile.set(isMobile);
        this.isTablet.set(isTablet);
        this.isDesktop.set(isDesktop);

        if (!this.isInitialized()) {
          this.scheduleInitializedAfterViewportSettles();
        }
      });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private observeViewport(): void {
    const refresh = () => this.refreshViewport();
    // WebKit may settle its layout after bootstrap, without crossing a CDK
    // breakpoint. Observe both axes, including changes within the same mode.
    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(refresh);
    observer?.observe(document.documentElement);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
      observer?.disconnect();
      cancelAnimationFrame(this.initializationFrame);
    });
  }

  private getViewportWidth(): number | null {
    if (!this.isBrowser || typeof window === "undefined") return null;

    const documentWidth =
      typeof document !== "undefined"
        ? document.documentElement.clientWidth
        : null;

    return Math.round(
      Math.min(
        ...[documentWidth, window.innerWidth].filter(
          (width): width is number => typeof width === "number" && width > 0
        )
      )
    );
  }

  private getViewportHeight(): number | null {
    if (!this.isBrowser || typeof window === "undefined") return null;
    const documentHeight =
      typeof document !== "undefined"
        ? document.documentElement.clientHeight
        : null;

    return Math.round(
      Math.min(
        ...[documentHeight, window.innerHeight].filter(
          (height): height is number => typeof height === "number" && height > 0,
        ),
      ),
    );
  }

  private detectViewportMode(): ViewMode | null {
    const width = this.getViewportWidth();
    if (width === null) return null;
    if (width < 600) return "mobile";
    if (width < 960) return "tablet";
    return "desktop";
  }

  private applyViewportMode(mode: ViewMode) {
    this.isMobile.set(mode === "mobile");
    this.isTablet.set(mode === "tablet");
    this.isDesktop.set(mode === "desktop");
  }

  private scheduleInitializedAfterViewportSettles() {
    if (this._initializationCheckScheduled) return;
    this._initializationCheckScheduled = true;

    let lastSize = "";
    let stableFrameCount = 0;
    let frameCount = 0;
    const requiredStableFrames = 6;
    const maxFrames = 45;

    const check = () => {
      this.refreshViewport();
      const mode = this.detectViewportMode();
      const size = `${this.viewportWidth()}x${this.viewportHeight()}`;
      frameCount += 1;

      if (mode) {
        this.applyViewportMode(mode);
        stableFrameCount = size === lastSize ? stableFrameCount + 1 : 1;
        lastSize = size;
      }

      if (
        mode &&
        (stableFrameCount >= requiredStableFrames || frameCount >= maxFrames)
      ) {
        this.isInitialized.set(true);
        this._initializationCheckScheduled = false;
        return;
      }

      if (frameCount >= maxFrames) {
        this.isInitialized.set(true);
        this._initializationCheckScheduled = false;
        return;
      }

      this.initializationFrame = requestAnimationFrame(check);
    };

    this.initializationFrame = requestAnimationFrame(check);
  }
}
