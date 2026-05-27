import {
  AfterViewInit,
  ApplicationRef,
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
  WritableSignal,
  NgZone,
  ChangeDetectionStrategy,
} from "@angular/core";
import {
  trigger,
  transition,
  style,
  animate,
  state,
} from "@angular/animations";
import { Injector } from "@angular/core";
import {
  Router,
  RouterLink,
  RouterOutlet,
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
  NavigationCancel,
  NavigationError,
  RoutesRecognized,
  GuardsCheckStart,
  GuardsCheckEnd,
  ResolveStart,
  ResolveEnd,
  RouteConfigLoadStart,
  RouteConfigLoadEnd,
  RouterModule,
} from "@angular/router";
import { filter } from "rxjs/operators";
import { AuthenticationService } from "./services/firebase/authentication.service";
import { StorageService } from "./services/firebase/storage.service";
import { ResponsiveService } from "./services/responsive.service";
import { GlobalVariables } from "../scripts/global";
import { environment } from "../environments/environment";
import { isBot } from "../scripts/Helpers";
import { ACCEPTANCE_FREE_PREFIXES } from "./app.routes";
import { NgOptimizedImage, PathLocationStrategy } from "@angular/common";
import { MatButtonModule, MatFabButton } from "@angular/material/button";
import { MatIcon, MatIconRegistry } from "@angular/material/icon";
import {
  MatMenuTrigger,
  MatMenu,
  MatMenuItem,
  MatMenuModule,
} from "@angular/material/menu";
import { MatToolbar } from "@angular/material/toolbar";
import { CdkScrollable } from "@angular/cdk/scrolling";
import { NavRailContentComponent } from "./components/nav-rail-content/nav-rail-content.component";
import { Mat3NavButtonComponent } from "./components/mat3-nav-button/mat3-nav-button.component";
import { NavRailComponent } from "./components/nav-rail/nav-rail.component";
import { NavRailContainerComponent } from "./components/nav-rail-container/nav-rail-container.component";
import { WelcomeDialogComponent } from "./components/welcome-dialog/welcome-dialog.component";
import { MatDialog } from "@angular/material/dialog";
import { LocaleCode } from "../db/models/Interfaces";
import { MatSnackBar } from "@angular/material/snack-bar";
import { WebSite } from "schema-dts";
import { StructuredDataService } from "./services/structured-data.service";
import { StorageImage } from "../db/models/Media";
// import { SelectLanguageDialogComponent } from "./components/select-language-dialog/select-language-dialog.component";
import { firstValueFrom } from "rxjs";
import { AnalyticsService } from "./services/analytics.service";
import { ConsentService } from "./services/consent.service";
import { Capacitor } from "@capacitor/core";
import { BackHandlingService } from "./services/back-handling.service";
import { CheckInService } from "./services/check-in.service";
import { SpotId } from "../db/schemas/SpotSchema";
import { MetaTagService } from "./services/meta-tag.service";
import { KeyboardService } from "./services/keyboard.service";
import type { ContentType } from "./resolvers/content.resolver";
import { APP_LINKS } from "./shared/app-links";

interface ButtonBase {
  name: string;
  icon: string;
  image?: string;
  active?: boolean;
}

interface LinkButton extends ButtonBase {
  link: string;
  function?: never;
}

interface FunctionButton extends ButtonBase {
  function: () => void;
  link?: never;
}

type NavbarButton = (LinkButton | FunctionButton) & {
  spacerBefore?: boolean;
};

type NavbarButtonConfig = NavbarButton[];

interface NavigationPerfEntry {
  startedAt: number;
  url: string;
  lastPhaseAt: number;
}

type NavigationPerfDetails = Record<string, unknown>;

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  imports: [
    NavRailContainerComponent,
    NavRailComponent,
    RouterLink,
    NavRailContentComponent,
    RouterOutlet,
    MatToolbar,
    MatMenuTrigger,
    MatMenu,
    MatMenuItem,
    MatIcon,
    MatFabButton,
    Mat3NavButtonComponent,
    NgOptimizedImage,
    MatMenuModule,
    RouterModule,
    MatButtonModule,
    CdkScrollable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger("slideVertical", [
      transition(
        ":enter",
        [
          style({
            opacity: 0,
            transform: "translateY({{startPos}})",
          }),
          animate(
            "0.5s cubic-bezier(0.25, 0.8, 0.25, 1)",
            style({ opacity: 1, transform: "translateY(0)" }),
          ),
        ],
        { params: { startPos: "100%" } },
      ),
      transition(":leave", [
        animate(
          "0.3s ease-in",
          style({ opacity: 0, transform: "translateY({{startPos}})" }),
        ),
      ]),
    ]),
  ],
})
export class AppComponent implements OnInit, AfterViewInit {
  readonly dialog = inject(MatDialog);
  private _snackbar = inject(MatSnackBar);
  private _structuredDataService = inject(StructuredDataService);
  private _appRef = inject(ApplicationRef);
  readonly responsive = inject(ResponsiveService);

  // Inject AuthService immediately to ensure auth state restoration works
  private _authService = inject(AuthenticationService);
  public get authService(): AuthenticationService {
    return this._authService;
  }

  // Keep a reference to the injector captured during construction
  private _injector = inject(Injector);

  // Lazy inject StorageService to prevent automatic Firebase Storage initialization
  private _storageService: StorageService | null = null;
  public get storageService(): StorageService {
    if (!this._storageService) {
      // Use captured Injector to lazily resolve the service without calling inject() now
      this._storageService = this._injector.get(StorageService);
    }
    return this._storageService as StorageService;
  }

  private _backHandlingService = inject(BackHandlingService);
  private _keyboardService = inject(KeyboardService);
  public checkInService = inject(CheckInService);
  readonly checkInEnabled = environment.features.checkIns;
  readonly activityEnabled = environment.features.activity;

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private matIconRegistry: MatIconRegistry,
    private _analyticsService: AnalyticsService,
    private _consentService: ConsentService,
    private _metaTagService: MetaTagService,
  ) {
    this.matIconRegistry.setDefaultFontSetClass("material-symbols-rounded");

    this.enforceAlainMode();
  }

  hasAds = false;
  userId: string = "";
  policyAccepted: boolean = false;
  private _lastTrackedAuthUid: string | null = null;
  private _lastConsentState: boolean | null = null;
  private readonly _engagedPingEnabled = false;
  private readonly _navigationPerfEntries = new Map<
    number,
    NavigationPerfEntry
  >();
  private _activeNavigationPerfId: number | null = null;

  alainMode: boolean = false;

  /** True when running with a non-production environment (dev/ios dev config) */
  isDevMode: boolean = !environment.production;

  /** True when running as a native iOS or Android app via Capacitor */
  isNativePlatform: boolean = Capacitor.isNativePlatform();

  isEmbedded: WritableSignal<boolean | null> = signal(null);

  availableLanguageCodes: LocaleCode[] = [
    "en",
    "de",
    "de-CH",
    "fr",
    "it",
    "es",
    "nl",
  ];

  @HostListener("window:resize", ["$event"])
  onResize(event: Event) {
    this.enforceAlainMode();
  }

  enforceAlainMode() {
    if (typeof window !== "undefined") {
      // Enable alain mode when:
      // 1. Height is very small (< 500px) - handles landscape mobile
      // 2. OR both height < 700 and width < 768 - handles portrait mobile
      const isLandscapeMobile = window.innerHeight < 500;
      const isPortraitMobile =
        window.innerHeight < 700 && window.innerWidth < 768;

      const nextAlainMode = isLandscapeMobile || isPortraitMobile;
      if (this.alainMode === nextAlainMode) {
        return;
      }

      this.alainMode = nextAlainMode;
      GlobalVariables.alainMode.next(nextAlainMode);
      this._analyticsService.trackEvent("Alain Mode Changed", {
        alainMode: nextAlainMode,
      });
    }
  }

  async ngAfterViewInit() {
    await this.waitForInitialRenderState();
    await this.waitForNextPaint();
    await this.waitForNextPaint();
    await this.hideSplashScreens();
  }

  async ngOnInit() {
    // Wire initial layout-affecting state before any awaited startup work.
    if (typeof window !== "undefined") {
      this.setEmbeddedStateFromUrl(window.location.pathname);
    } else {
      this.isEmbedded.set(false);
    }

    this._keyboardService.init();
    this.installNavigationPerformanceLogging();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.setEmbeddedStateFromUrl(event.url);
      });

    // Setup auth state listener immediately for session restoration
    // (This is now safe - only reCAPTCHA-triggering operations like sign-up require consent)
    this.setupAuthStateListener();

    this.maybeOpenInitialWelcomeDialog();

    // Initialize analytics
    await this._analyticsService.init();

    // Handle Deep Links (Universal Links/App Links)
    if (typeof window !== "undefined") {
      import("@capacitor/app").then(({ App }) => {
        App.addListener("appUrlOpen", (event: any) => {
          // Normalize the URL
          const url = new URL(event.url);
          // Get the path and query params (everything after domain)
          let path = url.pathname;

          // Check for OAuth callback from Chrome Custom Tabs
          if (path === "/oauth/callback" || path.endsWith("/oauth/callback")) {
            // OAuth callback - extract ID token from URL fragment
            const hashParams = new URLSearchParams(url.hash.substring(1));
            const idToken = hashParams.get("id_token");

            if (idToken) {
              console.log("OAuth callback received, processing ID token...");
              this._injector.get(NgZone).run(() => {
                // Import Browser to close the Custom Tab
                import("@capacitor/browser").then(({ Browser }) => {
                  this._authService
                    .handleOAuthCallback(idToken)
                    .then(() => {
                      Browser.close(); // Close the browser
                      this.router.navigateByUrl("/map");
                    })
                    .catch((err) => {
                      console.error("OAuth callback error:", err);
                      Browser.close();
                    });
                });
              });
              return; // Don't process as regular deep link
            }
          }

          // Strip locale prefix if present (e.g. /fr/map -> /map)
          // The app might be running in a specific locale or default,
          // but the router likely expects paths without the *other* locale prefixes
          // unless fully configured for i18n routing in the same app instance.
          // For Capacitor, we usually want to just navigate to the content.
          const segments = path.split("/");
          if (
            segments.length > 1 &&
            this.availableLanguageCodes.includes(segments[1] as any)
          ) {
            // Remove the locale segment
            segments.splice(1, 1);
            path = segments.join("/");
          }

          const slug = path + url.search;

          // If the link is a "login" link with returnUrl, we might want to preserve that
          // But usually just navigating to the slug is enough as Angular Router handles the rest
          if (slug) {
            this._injector.get(NgZone).run(() => {
              this.router.navigateByUrl(slug);
            });
          }
        });
      });
    }

    if (this.isNativePlatform && typeof window !== "undefined") {
      document.documentElement.classList.add("native-platform");
      document.documentElement.classList.add(
        `platform-${Capacitor.getPlatform()}`,
      );

      // Detect if running on macOS (iOS app via "Designed for iPad" / Mac Catalyst)
      // navigator.platform is deprecated but still works and is useful here
      const isMacOSOrIPad =
        navigator.platform?.toLowerCase().includes("mac") ||
        navigator.userAgent?.toLowerCase().includes("macintosh") ||
        navigator.userAgent?.toLowerCase().includes("ipad");
      if (isMacOSOrIPad) {
        document.documentElement.classList.add("running-on-macos-or-ipad");
      }

      console.log(
        `[Platform] Native: ${Capacitor.getPlatform()}, isMacOSOrIPad: ${isMacOSOrIPad}`,
      );

      // Set status bar style to use light (white) icons on Android
      // Style.Dark = light/white icons (for dark backgrounds)
      // Style.Light = dark/black icons (for light backgrounds)
      import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: Style.Dark });

        // Initial check for orientation
        this.updateStatusBarVisibility();

        // Listen for orientation changes to hide/show status bar
        // standard window.screen.orientation API works in Android WebView
        if (screen && screen.orientation) {
          screen.orientation.addEventListener("change", () => {
            this.updateStatusBarVisibility();
          });
        } else {
          // Fallback to resize event if orientation API not supported
          window.addEventListener("resize", () => {
            this.updateStatusBarVisibility();
          });
        }
      });

      // Listen for hardware back button
      import("@capacitor/app").then(({ App }) => {
        App.addListener("backButton", () => {
          this._injector.get(NgZone).run(() => {
            console.log("Hardware back button pressed");
            this._backHandlingService.handleBack();
          });
        });
      });
    }

    // structured data
    const json: WebSite = {
      "@type": "WebSite",
      name: StructuredDataService.BRAND_NAME,
      alternateName: [
        "pkspot.app",
        "PK Spot App",
        "Parkour Spot",
        "Parkour Spot App",
      ],
      url: StructuredDataService.BRAND_URL,
    };
    this._structuredDataService.addStructuredData("website", json);
    this._structuredDataService.addStructuredData(
      "organization",
      this._structuredDataService.generateOrganizationData(),
    );
    this._structuredDataService.addStructuredData(
      "software-application",
      this._structuredDataService.generateSoftwareApplicationData(),
    );

    // Track when consent is granted so we can correlate accepters vs non-accepters
    this._consentService.consentGranted$.subscribe((granted) => {
      try {
        const previousConsentState = this._lastConsentState;
        const consentChangedToGranted =
          previousConsentState === false && granted;
        this._lastConsentState = granted;

        if (granted) {
          // set person + super-properties for consent so future events are labeled
          const version = this._consentService.CURRENT_TERMS_VERSION;
          this._analyticsService.setConsentProperties(true, version);

          if (consentChangedToGranted) {
            this._analyticsService.trackEvent("Consent Granted", {
              source: "welcome_dialog_or_flow",
              accepted_version: version,
              is_user_action: false,
            });
          }

          // If we're currently tracking engagement for a page, start sending pings
          if (this._engagement) {
            this._engagement.startPingsIfNeeded();
          }
        }
      } catch (err) {
        console.error("AppComponent: error tracking consent change", err);
      }
    });

    // Manual pageview + engaged-time tracking (disable autocapture to avoid race conditions)
    let initialPageviewSent = false;

    // Engagement helper object to manage timers and handlers per-page
    this._engagement = {
      visibleStart: null as number | null,
      totalVisibleMs: 0,
      pingIntervalId: null as any,
      visibilityHandler: null as any,
      beforeUnloadHandler: null as any,
      pingIntervalMs: 15000,

      startPingsIfNeeded: () => {
        if (!this._engagedPingEnabled) return;
        // start periodic pings only if consent granted
        try {
          if (!this._consentService.hasConsent()) return;
          // Do not start pings during SSR where `document`/`window` are not available
          if (typeof document === "undefined" || typeof window === "undefined")
            return;
          if (this._engagement.pingIntervalId) return;
          this._engagement.pingIntervalId = setInterval(() => {
            try {
              if (document.visibilityState === "visible") {
                // increment by configured interval
                this._engagement.totalVisibleMs +=
                  this._engagement.pingIntervalMs;
                this._analyticsService.trackEvent("Engaged Ping", {
                  increment_seconds: Math.round(
                    this._engagement.pingIntervalMs / 1000,
                  ),
                  path: window.location ? window.location.pathname : "",
                  authenticated: this.isSignedIn(),
                  consent_granted: this._consentService.hasConsent(),
                  source: "engaged_ping",
                });
              }
            } catch (e) {
              console.error("Error during engaged ping", e);
            }
          }, this._engagement.pingIntervalMs);
        } catch (e) {
          console.error("Failed to start engagement pings", e);
        }
      },

      stopPings: () => {
        if (this._engagement.pingIntervalId) {
          clearInterval(this._engagement.pingIntervalId);
          this._engagement.pingIntervalId = null;
        }
      },

      cleanupHandlers: () => {
        try {
          if (
            typeof document !== "undefined" &&
            this._engagement.visibilityHandler
          ) {
            document.removeEventListener(
              "visibilitychange",
              this._engagement.visibilityHandler,
            );
            this._engagement.visibilityHandler = null;
          }
          if (
            typeof window !== "undefined" &&
            this._engagement.beforeUnloadHandler
          ) {
            window.removeEventListener(
              "beforeunload",
              this._engagement.beforeUnloadHandler,
            );
            this._engagement.beforeUnloadHandler = null;
          }
        } catch (e) {
          // ignore
        }
      },

      finalizeAndSend: (path?: string) => {
        try {
          // accumulate any currently visible time
          const now = Date.now();
          if (this._engagement.visibleStart) {
            this._engagement.totalVisibleMs +=
              now - this._engagement.visibleStart;
            this._engagement.visibleStart = null;
          }

          const seconds = Math.round(this._engagement.totalVisibleMs / 1000);
          if (seconds > 0) {
            const currentPath =
              path ??
              (typeof window !== "undefined" ? window.location.pathname : "");
            this._analyticsService.trackEvent("Session Duration", {
              path: currentPath,
              duration_seconds: seconds,
              authenticated: this.isSignedIn(),
              consent_granted: this._consentService.hasConsent(),
              source: "manual",
            });
          }

          // reset totals
          this._engagement.totalVisibleMs = 0;
          this._engagement.stopPings();
          this._engagement.cleanupHandlers();
        } catch (e) {
          console.error("Failed to finalize engagement", e);
        }
      },
    } as any;

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const nav = event as NavigationEnd;
        this.currentNavUrl.set(nav.urlAfterRedirects);
        this.checkWelcomeDialogForCurrentRoute();

        const send = () => {
          try {
            const isBrowser =
              typeof window !== "undefined" && typeof document !== "undefined";

            // Reset scroll position of the main content container on navigation
            // This is needed because we use a custom scroll container (.main-content)
            // not the viewport, so Angular's scrollPositionRestoration doesn't work
            if (isBrowser) {
              const mainContent = document.querySelector(".main-content");
              if (mainContent) {
                mainContent.scrollTop = 0;
              }
            }

            const url = isBrowser
              ? window.location.href
              : nav.urlAfterRedirects;
            const authenticated = this.isSignedIn();
            const consentGranted = this._consentService.hasConsent();
            const acceptedVersion = isBrowser
              ? localStorage.getItem("acceptedVersion")
              : null;

            // finalize previous page's engagement before starting new
            this._engagement.finalizeAndSend();

            // Emit manual pageview using PostHog's standard $pageview event

            if (!this.isNativePlatform) {
              const attribution =
                this._analyticsService.getCurrentAttributionProperties();
              this._analyticsService.trackEvent("$pageview", {
                path: nav.urlAfterRedirects,
                current_url: url,
                ...attribution,
                authenticated: authenticated,
                consent_granted: consentGranted,
                accepted_version: acceptedVersion,
                source: "manual",
              });
              this._analyticsService.trackStickerScanFromCurrentUrl();
              this._analyticsService.cleanCurrentUtmParametersFromUrl();
            }

            if (this.shouldSyncCanonicalFromNavigation()) {
              this._metaTagService.syncCanonicalAndHreflangForPath(
                nav.urlAfterRedirects,
              );
            }

            // Start new engagement tracking for this page (browser-only)
            if (isBrowser && document.visibilityState === "visible") {
              this._engagement.visibleStart = Date.now();
            } else {
              this._engagement.visibleStart = null;
            }

            // visibility handler (browser-only)
            if (isBrowser) {
              this._engagement.visibilityHandler = () => {
                if (document.visibilityState === "hidden") {
                  if (this._engagement.visibleStart) {
                    this._engagement.totalVisibleMs +=
                      Date.now() - this._engagement.visibleStart;
                    this._engagement.visibleStart = null;
                  }
                } else {
                  this._engagement.visibleStart = Date.now();
                }
              };
              document.addEventListener(
                "visibilitychange",
                this._engagement.visibilityHandler,
              );

              // beforeunload handler to try and send final duration
              this._engagement.beforeUnloadHandler = () => {
                this._engagement.finalizeAndSend(nav.urlAfterRedirects);
              };
              window.addEventListener(
                "beforeunload",
                this._engagement.beforeUnloadHandler,
                { capture: false },
              );
            }

            // start periodic pings if consent already granted (browser-only)
            if (
              this._engagedPingEnabled &&
              this._consentService.hasConsent() &&
              isBrowser &&
              !this.isNativePlatform
            ) {
              this._engagement.startPingsIfNeeded();
            }
          } catch (e) {
            console.error("Failed to send manual pageview", e);
          }
        };

        if (!initialPageviewSent) {
          // wait until auth state is restored to get correct `authenticated` flag
          this.waitForInitialAuthState()
            .then(() => {
              send();
              initialPageviewSent = true;
            })
            .catch(() => {
              // even if auth retrieval fails, still send a pageview
              send();
              initialPageviewSent = true;
            });
        } else {
          send();
        }
      });
  }

  private setEmbeddedStateFromUrl(url: string) {
    this.isEmbedded.set(url.split("/")[1] === "embedded");
  }

  private maybeOpenInitialWelcomeDialog(): void {
    if (typeof window === "undefined") {
      return;
    }

    this.hasAds = (window as { canRunAds?: boolean }).canRunAds ?? false;
    this.checkWelcomeDialogForCurrentRoute();
  }

  private checkWelcomeDialogForCurrentRoute(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const currentTermsVersion = this._consentService.CURRENT_TERMS_VERSION;
      const acceptedVersion = localStorage.getItem("acceptedVersion");
      this.policyAccepted = acceptedVersion === currentTermsVersion;

      if (this.policyAccepted) {
        this._consentService.grantConsent();
        return;
      }

      const path = window.location.pathname;
      const isEmbedded =
        path.startsWith("/embedded") ||
        this.isEmbedded() === true ||
        window.self !== window.top;
      const isAcceptanceFree =
        this.getActiveRouteAcceptanceFree() || this.isAcceptanceFreePath(path);

      if (isAcceptanceFree) {
        this.dialog.openDialogs
          .filter(
            (dialogRef) =>
              dialogRef.componentInstance instanceof WelcomeDialogComponent
          )
          .forEach((dialogRef) => dialogRef.close(false));
        return;
      }

      if (!isEmbedded && !isBot() && this.dialog.openDialogs.length === 0) {
        const dialogRef = this.dialog.open(WelcomeDialogComponent, {
          data: { version: currentTermsVersion },
          hasBackdrop: true,
          disableClose: true,
          enterAnimationDuration: "0ms",
        });

        dialogRef.afterClosed().subscribe((agreed: boolean) => {
          if (agreed) {
            this._consentService.grantConsent();
          }
        });
      }
    } catch (e) {
      console.error("Error in welcome dialog check", e);
    }
  }

  private getActiveRouteAcceptanceFree(): boolean {
    let activeRoute = this.route;
    while (activeRoute.firstChild) {
      activeRoute = activeRoute.firstChild;
    }

    return activeRoute.snapshot.data["acceptanceFree"] === true;
  }

  private isAcceptanceFreePath(pathname: string): boolean {
    const path = this.stripLocalePrefix(pathname);

    return ACCEPTANCE_FREE_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }

  private stripLocalePrefix(pathname: string): string {
    const segments = pathname.split("/");

    if (
      segments.length > 1 &&
      this.availableLanguageCodes.includes(segments[1] as LocaleCode)
    ) {
      segments.splice(1, 1);
      return segments.join("/") || "/";
    }

    return pathname || "/";
  }

  private shouldSyncCanonicalFromNavigation(): boolean {
    const contentType = this.getActiveRouteContentType();
    return !(
      contentType === "spot" ||
      contentType === "challenge" ||
      contentType === "spotEditHistory"
    );
  }

  private getActiveRouteContentType(): ContentType | null {
    let activeRoute = this.route;
    while (activeRoute.firstChild) {
      activeRoute = activeRoute.firstChild;
    }

    const content = activeRoute.snapshot.data["content"];
    if (typeof content !== "object" || content === null) {
      return null;
    }

    const contentType = (content as { contentType?: unknown }).contentType;
    return typeof contentType === "string"
      ? (contentType as ContentType)
      : null;
  }

  private async waitForInitialRenderState() {
    if (typeof window === "undefined") return;

    await Promise.all([
      this.withTimeout(this.waitForAppStable(), 3000),
      this.withTimeout(
        this.waitUntil(() => this.authService.initialAuthStateResolved()),
        3000,
      ),
      this.withTimeout(
        this.waitUntil(() => this.responsive.isInitialized()),
        3000,
      ),
      this.withTimeout(
        this.waitUntil(() => this.isEmbedded() !== null),
        3000,
      ),
    ]);
  }

  private waitForInitialAuthState(): Promise<void> {
    if (typeof window === "undefined") {
      return Promise.resolve();
    }

    return this.waitUntil(() => this.authService.initialAuthStateResolved());
  }

  private async waitForAppStable() {
    await firstValueFrom(
      this._appRef.isStable.pipe(filter((stable) => stable === true)),
    );
  }

  private waitUntil(predicate: () => boolean): Promise<void> {
    if (predicate()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const check = () => {
        if (predicate()) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  private withTimeout(
    promise: Promise<void>,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, timeoutMs);
      promise
        .catch((error) => {
          console.error("Initial render readiness check failed:", error);
        })
        .finally(() => {
          clearTimeout(timeoutId);
          resolve();
        });
    });
  }

  private waitForNextPaint(): Promise<void> {
    // No paint on the server — resolve immediately so SSR doesn't crash on
    // the missing `requestAnimationFrame` global.
    if (typeof requestAnimationFrame === "undefined") {
      return Promise.resolve();
    }
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  private async hideSplashScreens() {
    if (this.isNativePlatform) {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide();
    }

    if (typeof document === "undefined") return;

    const splash = document.getElementById("app-splash-screen");
    if (!splash) return;

    splash.classList.add("splash-fade-out");
    setTimeout(() => {
      splash.remove();
    }, 300);
  }

  private setupAuthStateListener() {
    // console.log("Setting up auth state listener with consent");

    this.authService.authState$.subscribe(
      (user) => {
        let isAuthenticated: boolean = false;
        if (user && user.uid) {
          this.userId = user.uid;
          try {
            const props: Record<string, unknown> = {};
            if (user?.data?.displayName) {
              props["display_name"] = user.data.displayName;
            }
            if (user?.email) {
              props["email"] = user.email;
            }
            if (Object.keys(props).length > 0) {
              this._analyticsService.setUserProperties(props);
            }
          } catch (e) {
            console.error("Failed to update analytics user properties", e);
          }
          isAuthenticated = true;
        } else {
          this.userId = "";
        }
        this.isSignedIn.set(isAuthenticated);

        if (user && user.uid) {
          this.shortUserDisplayName.set(
            // Get display name from Firestore user data if consent is granted
            user?.data?.displayName?.split(" ")[0] ?? undefined,
          );

          // Only access Firestore user data if consent is granted
          if (this._consentService.hasConsent()) {
            this.userPhoto.set(
              this.authService?.user?.data?.profilePicture?.getSrc(200) ??
              undefined,
            );
          } else {
            this.userPhoto.set(undefined);
          }
        } else {
          // User signed out - clear display name and photo
          this.shortUserDisplayName.set(undefined);
          this.userPhoto.set(undefined);
        }

        const currentAuthUid = user?.uid ?? null;
        if (currentAuthUid && this._lastTrackedAuthUid !== currentAuthUid) {
          this._analyticsService.trackEvent("User Authenticated", {
            authenticated: true,
            is_user_action: false,
          });
          this._lastTrackedAuthUid = currentAuthUid;
        }
      },
      (error) => {
        console.error(error);
      },
    );

    // Listen for consent changes to update profile picture
    this._consentService.consentGranted$.subscribe((hasConsent) => {
      if (hasConsent && this.authService?.user?.data?.profilePicture) {
        this.userPhoto.set(
          this.authService.user.data.profilePicture.getSrc(200),
        );
      } else if (!hasConsent) {
        this.userPhoto.set(undefined);
      }
    });
  }

  private updateStatusBarVisibility() {
    // Logic to hide status bar in landscape mode on Android
    if (Capacitor.getPlatform() === "android") {
      import("@capacitor/status-bar").then(({ StatusBar }) => {
        const isLandscape = window.innerWidth > window.innerHeight;
        if (isLandscape) {
          StatusBar.hide();
        } else {
          StatusBar.show();
        }
      });
    }
  }

  private installNavigationPerformanceLogging(): void {
    if (!this.isNativePlatform || typeof window === "undefined") {
      return;
    }

    this.router.events.subscribe((event) => {
      const now = performance.now();

      if (event instanceof NavigationStart) {
        this._activeNavigationPerfId = event.id;
        this._navigationPerfEntries.set(event.id, {
          startedAt: now,
          lastPhaseAt: now,
          url: event.url,
        });
        this.logNavigationPerformance(event.id, "NavigationStart", {
          url: event.url,
          trigger: event.navigationTrigger,
          restoredState: event.restoredState,
        });
        return;
      }

      if (
        event instanceof RouteConfigLoadStart ||
        event instanceof RouteConfigLoadEnd
      ) {
        this.logNavigationPerformance(
          this._activeNavigationPerfId ?? -1,
          this.getNavigationPerformancePhase(event),
          {
            routePath: event.route.path,
          },
        );
        return;
      }

      if (
        event instanceof RoutesRecognized ||
        event instanceof GuardsCheckStart ||
        event instanceof GuardsCheckEnd ||
        event instanceof ResolveStart ||
        event instanceof ResolveEnd ||
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.logNavigationPerformance(
          event.id,
          this.getNavigationPerformancePhase(event),
          {
            url: "url" in event ? event.url : undefined,
            urlAfterRedirects:
              "urlAfterRedirects" in event
                ? event.urlAfterRedirects
                : undefined,
            reason:
              event instanceof NavigationCancel ? event.reason : undefined,
            error:
              event instanceof NavigationError
                ? this.summarizeNavigationError(event.error)
                : undefined,
          },
        );

        if (
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError
        ) {
          this._navigationPerfEntries.delete(event.id);
          if (this._activeNavigationPerfId === event.id) {
            this._activeNavigationPerfId = null;
          }
        }
      }
    });

    this.installNavigationClickLogging();
    this.installLongTaskLogging();
  }

  private getNavigationPerformancePhase(
    event:
      | RoutesRecognized
      | GuardsCheckStart
      | GuardsCheckEnd
      | ResolveStart
      | ResolveEnd
      | RouteConfigLoadStart
      | RouteConfigLoadEnd
      | NavigationEnd
      | NavigationCancel
      | NavigationError,
  ): string {
    if (event instanceof RoutesRecognized) return "RoutesRecognized";
    if (event instanceof GuardsCheckStart) return "GuardsCheckStart";
    if (event instanceof GuardsCheckEnd) return "GuardsCheckEnd";
    if (event instanceof ResolveStart) return "ResolveStart";
    if (event instanceof ResolveEnd) return "ResolveEnd";
    if (event instanceof RouteConfigLoadStart) return "RouteConfigLoadStart";
    if (event instanceof RouteConfigLoadEnd) return "RouteConfigLoadEnd";
    if (event instanceof NavigationEnd) return "NavigationEnd";
    if (event instanceof NavigationCancel) return "NavigationCancel";
    return "NavigationError";
  }

  private logNavigationPerformance(
    navigationId: number,
    phase: string,
    details: NavigationPerfDetails = {},
  ): void {
    const now = performance.now();
    const entry = this._navigationPerfEntries.get(navigationId);
    const sinceStartMs = entry ? Math.round(now - entry.startedAt) : 0;
    const sincePreviousMs = entry ? Math.round(now - entry.lastPhaseAt) : 0;

    if (entry) {
      entry.lastPhaseAt = now;
    }

    this.writeNavigationPerformanceLog("info", {
      navigationId,
      phase,
      sinceStartMs,
      sincePreviousMs,
      ...details,
    });
  }

  private writeNavigationPerformanceLog(
    level: "info" | "warn",
    details: NavigationPerfDetails,
  ): void {
    const message = `[NavPerf] ${this.stringifyNavigationPerformanceDetails(details)}`;
    if (level === "warn") {
      console.warn(message);
      return;
    }

    console.info(message);
  }

  private stringifyNavigationPerformanceDetails(
    details: NavigationPerfDetails,
  ): string {
    return Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${this.stringifyNavigationPerformanceValue(value)}`)
      .join(" ");
  }

  private stringifyNavigationPerformanceValue(value: unknown): string {
    if (typeof value === "string") {
      return JSON.stringify(value);
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private installNavigationClickLogging(): void {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const anchor = target.closest("a");
        const button = target.closest("button");
        const element = anchor ?? button;
        if (!element) {
          return;
        }

        this.writeNavigationPerformanceLog("info", {
          phase: "Click",
          tagName: element.tagName.toLowerCase(),
          href: anchor?.getAttribute("href") ?? undefined,
          text: element.textContent?.trim().slice(0, 80) ?? "",
          path: window.location.pathname,
        });
      },
      { capture: true },
    );
  }

  private installLongTaskLogging(): void {
    const performanceObserver = (
      window as {
        PerformanceObserver?: typeof PerformanceObserver;
      }
    ).PerformanceObserver;
    if (!performanceObserver) {
      return;
    }

    try {
      const observer = new performanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.writeNavigationPerformanceLog("warn", {
            phase: "LongTask",
            startTimeMs: Math.round(entry.startTime),
            durationMs: Math.round(entry.duration),
            path: window.location.pathname,
          });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch (error) {
      console.debug("[NavPerf] LongTask observer unavailable", error);
    }
  }

  private summarizeNavigationError(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }

  logUserOut() {
    if (!this.authService) {
      console.error("AuthService not available");
      return;
    }
    if (!this.authService.isSignedIn) {
      console.error("User is not signed in");
      return;
    }

    this.authService
      .logUserOut()
      .then(() => {
        // Successfully logged out
        this._snackbar.open("You were successfully signed out!", "OK", {
          duration: 2000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        });
      })
      .catch((err) => {
        // There was an error logging out.
        this._snackbar.open(
          "Error, there was a problem signing out!",
          "Dismiss",
          {
            duration: 5000,
            horizontalPosition: "center",
            verticalPosition: "bottom",
          },
        );
      });
  }

  /**
   * Returns the current URL minus '/embedded' if present.
   * Used to open the actual site that was embedded.
   */
  getUnembeddedUrl(): string {
    if (typeof window === "undefined") return "https://pkspot.app";
    const url = new URL(window.location.href);
    // Remove '/embedded' from the path if present
    url.pathname = url.pathname.replace(/\/embedded(\/)?/, "/");
    // Remove any trailing slash (except root)
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  }

  /**
   * Navigate to the account page with the current URL as the return URL.
   */
  navigateToAccount() {
    const returnUrl = this.router.url;
    this.router.navigate(["/account"], { queryParams: { returnUrl } });
  }

  shortUserDisplayName = signal<string | undefined>(undefined);
  userPhoto = signal<string | undefined>(undefined);
  isSignedIn = signal(false);
  currentNavUrl = signal<string>(this.router.url);

  // Engagement tracking state (initialized in ngOnInit)
  private _engagement: any = null;

  spotCheckIn(spotId: SpotId) {
    this.checkInService.checkIn(spotId);
  }

  hasUserProfilePicture = computed(() => {
    return this.isSignedIn() && !!this.userPhoto();
  });

  userProfilePictureUrl = computed(() => {
    return this.userPhoto() || "";
  });

  openPKSpotinAppStore() {
    if (this.isNativePlatform) {
      console.debug(
        "This is already native - no need to open the App Store. (this button should not appear here and be clickable)",
      );
      return;
    }

    const userAgent = navigator.userAgent;
    const isAppleOS = /iPad|iPhone|iPod|Safari/.test(userAgent);
    const isAndroidOS = /Android/.test(userAgent);

    if (isAppleOS) {
      window.open(APP_LINKS.appleAppStoreUrl, "_blank");
    } else if (isAndroidOS) {
      window.open(APP_LINKS.googlePlayStoreUrl, "_blank");
    }
  }

  navbarConfig = computed<NavbarButtonConfig | undefined>(() => {
    const signedIn = this.isSignedIn();
    const shortUserDisplayName = this.shortUserDisplayName();
    const userPhoto = this.userPhoto();
    const currentNavUrl = this.currentNavUrl();
    const isCompact = this.responsive.viewMode() !== "desktop";
    const isOnMobileWeb = this.isMobileAppStoreBrowser();

    const buttons: NavbarButtonConfig = [
      {
        name: $localize`:Map navbar button label|A very short label for the navbar map label@@map_label:Map`,
        link: "/map",
        icon: "map",
      },
    ];
    if (this.activityEnabled) {
      buttons.push({
        name: $localize`Activity`,
        link: "/activity",
        icon: "vital_signs",
      });
    }

    buttons.push({
      name: $localize`:Events navbar button label|A very short label for the navbar events page button@@events_label:Events`,
      link: "/events",
      icon: "event",
    });

    // Drop "About" on tight viewports so the bottom toolbar fits 4 items
    // (map, activity, events, profile/account).
    if (!isCompact) {
      buttons.push({
        name: $localize`:About page navbar button label|A very short label for the navbar about page button@@about_page_label:About`,
        link: "/about",
        icon: "info",
      });
    }

    if (isOnMobileWeb) {
      buttons.push({
        spacerBefore: true,
        name: $localize`:Get App navbar button label|A very short label for the navbar get app button@@get_app_label:Get App`,
        function: () => this.openPKSpotinAppStore(),
        icon: "mobile_border",
      });
    }

    buttons.push({
      spacerBefore: !isOnMobileWeb,
      name: signedIn
        ? shortUserDisplayName || $localize`Profile`
        : $localize`:@@login.nav_label:Account`,
      ...(signedIn
        ? {
          link: "/profile",
          icon: "person",
          image: userPhoto || "",
          active:
            currentNavUrl.startsWith("/profile") ||
            currentNavUrl.startsWith("/u/"),
        }
        : {
          function: () => this.navigateToAccount(),
          icon: "manage_accounts",
          active:
            currentNavUrl.startsWith("/account") ||
            currentNavUrl.startsWith("/sign-in"),
        }),
    });

    return buttons;
  });

  private isMobileAppStoreBrowser(): boolean {
    if (this.isNativePlatform || typeof navigator === "undefined") {
      return false;
    }

    return /android|iphone|ipod|ipad/i.test(navigator.userAgent);
  }

  isOutlineIcon(icon: string): boolean {
    return icon.endsWith("_border");
  }
}
