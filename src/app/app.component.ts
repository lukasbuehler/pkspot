import {
  AfterViewInit,
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
  WritableSignal,
} from "@angular/core";
import { Injector } from "@angular/core";
import {
  Router,
  RoutesRecognized,
  RouterLink,
  RouterOutlet,
  ActivatedRoute,
  NavigationEnd,
  RouterModule,
} from "@angular/router";
import { filter } from "rxjs/operators";
import { AuthenticationService } from "./services/firebase/authentication.service";
import { StorageService } from "./services/firebase/storage.service";
import { GlobalVariables } from "../scripts/global";
import { NgOptimizedImage, PathLocationStrategy } from "@angular/common";
import { MatButtonModule, MatFabButton } from "@angular/material/button";
import { MatIcon, MatIconRegistry } from "@angular/material/icon";
import {
  MatMenuTrigger,
  MatMenu,
  MatMenuItem,
  MatMenuPanel,
  MatMenuModule,
} from "@angular/material/menu";
import { MatToolbar } from "@angular/material/toolbar";
import { NavRailContentComponent } from "./nav-rail-content/nav-rail-content.component";
import { Mat3NavButtonComponent } from "./mat3-nav-button/mat3-nav-button.component";
import { NavRailComponent } from "./nav-rail/nav-rail.component";
import { NavRailContainerComponent } from "./nav-rail-container/nav-rail-container.component";
import { WelcomeDialogComponent } from "./welcome-dialog/welcome-dialog.component";
import { MatDialog } from "@angular/material/dialog";
import { languageCodes } from "../scripts/Languages";
import { LocaleCode } from "../db/models/Interfaces";
import { MatSnackBar } from "@angular/material/snack-bar";
import { WebSite } from "schema-dts";
import { StructuredDataService } from "./services/structured-data.service";
import { StorageImage } from "../db/models/Media";
import { SelectLanguageDialogComponent } from "./select-language-dialog/select-language-dialog.component";
import { firstValueFrom } from "rxjs";
import { PlausibleService } from "./services/plausible.service";
import { ConsentService } from "./services/consent.service";

interface ButtonBase {
  name: string;
  icon: string;
  image?: string;
}

interface LinkButton extends ButtonBase {
  link: string;
  menu?: never;
  function?: never;
}

interface MenuButton extends ButtonBase {
  menu: "lang" | "user";
  link?: never;
  function?: never;
}

interface FunctionButton extends ButtonBase {
  function: () => void;
  link?: never;
  menu?: never;
}

type LinkMenuButton = LinkButton | MenuButton | FunctionButton;

type NavbarButton = LinkMenuButton & {
  spacerBefore?: boolean;
};

type NavbarButtonConfig = NavbarButton[];
type ButtonConfig = LinkMenuButton[];

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
  ],
})
export class AppComponent implements OnInit {
  readonly dialog = inject(MatDialog);
  private _snackbar = inject(MatSnackBar);
  private _structuredDataService = inject(StructuredDataService);

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

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private matIconRegistry: MatIconRegistry,
    private _plausibleService: PlausibleService,
    private _consentService: ConsentService
  ) {
    this.matIconRegistry.setDefaultFontSetClass("material-symbols-rounded");

    this.enforceAlainMode();
  }

  hasAds = false;
  userId: string = "";
  policyAccepted: boolean = false;

  alainMode: boolean = false;

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

  languageCodes = languageCodes;

  @HostListener("window:resize", ["$event"])
  onResize(event: Event) {
    this.enforceAlainMode();
  }

  enforceAlainMode() {
    if (typeof window !== "undefined") {
      if (window.innerHeight < 700 && window.innerWidth < 768) {
        this.alainMode = true;
      } else {
        this.alainMode = false;
      }
      GlobalVariables.alainMode.next(this.alainMode);
      this._plausibleService.trackPageview({ alainMode: this.alainMode });
    }
  }

  ngOnInit() {
    // structured data
    const json: WebSite = {
      "@type": "WebSite",
      name: "PK Spot",
      alternateName: [
        "pkspot.app",
        "PK Spot App",
        "Parkour Spot",
        "Parkour Spot App",
        "PKFR Spot",
        "pkfrspot.com",
      ],
      url: "https://pkspot.app/",
    };
    this._structuredDataService.addStructuredData("website", json);

    // Setup route events and consent dialog logic immediately (before consent)
    this.router.events
      .pipe(filter((event) => event instanceof RoutesRecognized))
      .subscribe((event: RoutesRecognized) => {
        const isEmbedded = event.url.split("/")[1] === "embedded";
        this.isEmbedded.set(isEmbedded);

        this.maybeOpenClickWrap();
      });

    // Setup auth state listener immediately for session restoration
    // (This is now safe - only reCAPTCHA-triggering operations like sign-up require consent)
    this.setupAuthStateListener();

    if (typeof window !== "undefined") {
      this.hasAds = (window as any)["canRunAds"] ?? false;
    }
  }

  private setupAuthStateListener() {
    console.log("Setting up auth state listener with consent");

    this.authService.authState$.subscribe(
      (user) => {
        let isAuthenticated: boolean = false;
        if (user && user.uid) {
          if (user.uid !== this.userId) {
            this.userId = user.uid;
          }
          isAuthenticated = true;
        }

        this.shortUserDisplayName.set(
          // Get display name from Firestore user data if consent is granted
          user?.data?.displayName?.split(" ")[0] ?? undefined
        );

        // Only access Firestore user data if consent is granted
        if (this._consentService.hasConsent()) {
          this.userPhoto.set(
            this.authService?.user?.data?.profilePicture?.getSrc(200) ??
              undefined
          );
        } else {
          this.userPhoto.set(undefined);
        }

        this._plausibleService.trackPageview({
          authenticated: isAuthenticated,
        });
      },
      (error) => {
        console.error(error);
      }
    );

    // Listen for consent changes to update profile picture
    this._consentService.consentGranted$.subscribe((hasConsent) => {
      if (hasConsent && this.authService?.user?.data?.profilePicture) {
        this.userPhoto.set(
          this.authService.user.data.profilePicture.getSrc(200)
        );
      } else if (!hasConsent) {
        this.userPhoto.set(undefined);
      }
    });
  }

  maybeOpenClickWrap() {
    const currentTermsVersion = "4";

    let isABot: boolean = false;
    if (typeof window !== "undefined") {
      isABot =
        navigator.userAgent.match(
          /bot|googlebot|crawler|spider|robot|crawling/i
        ) !== null;
      let acceptedVersion = localStorage.getItem("acceptedVersion");

      this.policyAccepted = acceptedVersion === currentTermsVersion;

      if (
        !this.policyAccepted &&
        !isABot &&
        this.isEmbedded() === false &&
        this.dialog.openDialogs.length === 0
      ) {
        firstValueFrom(
          this.router.events.pipe(
            filter((event) => event instanceof NavigationEnd)
          )
        )
          .then(() => {
            // Check route data after navigation completes
            const checkRouteData = () => {
              const currentRoute = this.route;
              let activeRoute = currentRoute;

              // Navigate to the actual active route
              while (activeRoute.firstChild) {
                activeRoute = activeRoute.firstChild;
              }

              const data = activeRoute.snapshot.data;
              const acceptanceFree = data["acceptanceFree"] || false;

              // Check again if user has accepted terms (might have changed)
              const currentAcceptedVersion =
                localStorage.getItem("acceptedVersion");

              if (currentAcceptedVersion !== currentTermsVersion) {
                if (!acceptanceFree) {
                  // Only show dialog if not on an acceptance-free page
                  if (this.dialog.openDialogs.length === 0) {
                    const dialogRef = this.dialog.open(WelcomeDialogComponent, {
                      data: { version: currentTermsVersion },
                      hasBackdrop: true,
                      disableClose: true,
                    });

                    // Listen for dialog close and grant consent if user agreed
                    dialogRef.afterClosed().subscribe((agreed: boolean) => {
                      if (agreed) {
                        this._consentService.grantConsent();
                      }
                    });
                  }
                } else {
                  // if the dialog was already open on acceptance-free page, close it
                  this.dialog.closeAll();
                  // Do NOT grant consent just for visiting a consent-free page
                  // Consent should only be granted when user explicitly agrees
                }
              } else {
                // User has already accepted current terms version, grant consent
                this._consentService.grantConsent();
              }
            };

            // Check route data immediately and also subscribe to route changes
            checkRouteData();

            // Also listen to route data changes for future navigation
            this.router.events
              .pipe(filter((event) => event instanceof NavigationEnd))
              .subscribe(() => {
                setTimeout(() => checkRouteData(), 100); // Small delay to ensure route data is updated
              });
          })
          .catch((err) => {
            console.error(
              "Error from navigation when opening welcome dialog:",
              err
            );
          });
      }
    }
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
          }
        );
      });
  }

  changeLanguage() {
    const url = new URL(window.location.href);
    const segments = url.pathname.split("/");
    console.log("segments", segments);
    const currentLocale = segments[1];

    // open language dialog
    const dialogRef = this.dialog.open(SelectLanguageDialogComponent, {
      data: {
        locale: currentLocale as LocaleCode,
        supportedUiLocales: this.availableLanguageCodes,
        mode: "ui",
      },
      width: "400px",
      maxWidth: "90vw",
    });
    dialogRef.afterClosed().subscribe((localeCode) => {
      if (localeCode) {
        // set the new language
        segments[1] = localeCode;
        url.pathname = segments.join("/");
        window.location.href = url.toString();
      }
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

  unauthenticatedUserMenuConfig: ButtonConfig = [
    {
      name: $localize`:@@login.nav_label:Login`,
      link: "/sign-in",
      icon: "login",
    },
    {
      name: $localize`:@@create_acc.nav_label:Create Account`,
      link: "/sign-up",
      icon: "person_add",
    },
    {
      name: $localize`:Language button label|The label of the change language button@@lang_btn_label:Language`,
      icon: "language",
      function: () => this.changeLanguage(),
    },
  ];

  authenticatedUserMenuConfig: ButtonConfig = [
    {
      name: $localize`:@@profile.nav_label:My Profile`,
      link: "/profile",
      icon: "face",
    },
    {
      name: $localize`:Language button label|The label of the change language button@@lang_btn_label:Language`,
      icon: "language",
      function: () => this.changeLanguage(),
    },
    {
      name: $localize`:@@settings.nav_label:Settings`,
      link: "/settings",
      icon: "settings",
    },
    {
      name: $localize`:@@logout.nav_label:Logout`,
      function: () => {
        return this.logUserOut();
      },
      icon: "logout",
    },
  ];

  shortUserDisplayName = signal<string | undefined>(undefined);
  userPhoto = signal<string | undefined>(undefined);

  // Safe computed properties for template to prevent SSR issues
  isSignedIn = computed(() => {
    // Only access authService when not during SSR
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return this.authService?.isSignedIn ?? false;
    } catch {
      return false;
    }
  });

  userMenuConfig = computed(() => {
    return this.isSignedIn()
      ? this.authenticatedUserMenuConfig
      : this.unauthenticatedUserMenuConfig;
  });

  hasUserProfilePicture = computed(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return (
        this.authService?.isSignedIn &&
        this.authService?.user?.data?.profilePicture
      );
    } catch {
      return false;
    }
  });

  userProfilePictureUrl = computed(() => {
    if (typeof window === "undefined") {
      return "";
    }
    try {
      if (
        this.authService?.isSignedIn &&
        this.authService?.user?.data?.profilePicture
      ) {
        return this.authService.user.data.profilePicture.getSrc(200);
      }
      return "";
    } catch {
      return "";
    }
  });

  navbarConfig = computed<NavbarButtonConfig | undefined>(() => {
    const shortUserDisplayName = this.shortUserDisplayName();
    const userPhoto = this.userPhoto();

    return [
      // {
      //   name: "Posts",
      //   link: "/posts",
      //   icon: "question_answer",
      // },
      {
        name: $localize`:Spot map navbar button label|A very short label for the navbar spot map label@@spot_map_label:Spot map`,
        link: "/map",
        icon: "map",
      },
      {
        name: $localize`:@@events.nav_label:Events`,
        link: "/events",
        icon: "calendar_month", // or event, local_activity, calendar_month
      },
      // {
      //   name: "Swiss Jam",
      //   link: "/events/swissjam25",
      //   icon: "local_activity",
      // },
      {
        name: $localize`:About page navbar button label|A very short label for the navbar about page button@@about_page_label:About`,
        link: "/about",
        icon: "info",
      },
      {
        spacerBefore: true,
        name: shortUserDisplayName ? shortUserDisplayName : $localize`Account`,
        menu: "user",
        icon: "person",
        image: shortUserDisplayName && userPhoto ? userPhoto : "",
      },
    ];
  });
}
