import {
  inject,
  Injectable,
  Injector,
  PLATFORM_ID,
  runInInjectionContext,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  OAuthProvider,
  GoogleAuthProvider,
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  User as FirebaseUser,
  signOut,
  sendEmailVerification,
  createUserWithEmailAndPassword,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthCredential,
  deleteUser,
  sendPasswordResetEmail,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  reauthenticateWithPopup,
  AuthProvider,
} from "@angular/fire/auth";
import { FirebaseApp } from "@angular/fire/app";
import { BehaviorSubject, firstValueFrom } from "rxjs";
import { User } from "../../../db/models/User";
import { UsersService } from "./firestore/users.service";
import { UserSchema } from "../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../consent-aware.service";
import { Capacitor } from "@capacitor/core";
import {
  FirebaseAuthentication,
  User as CapacitorFirebaseUser,
} from "@capacitor-firebase/authentication";
import { Browser } from "@capacitor/browser";

interface AuthServiceUser {
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  data?: User;
  providerId?: string;
}

@Injectable({
  providedIn: "root",
})
export class AuthenticationService extends ConsentAwareService {
  // Public properties
  public isSignedIn: boolean = false;
  /**
   * The user from the database corresponding to the currently authenticated user
   */
  public user: AuthServiceUser = {};

  public authState$: BehaviorSubject<AuthServiceUser | null> =
    new BehaviorSubject<AuthServiceUser | null>(null);

  private _injector = inject(Injector);
  private _platformId = inject(PLATFORM_ID);

  private get _isBrowser(): boolean {
    return isPlatformBrowser(this._platformId);
  }

  private _auth: Auth;
  public get auth() {
    return this._auth;
  }
  private _authStateListenerInitialized = false;

  // Guard against concurrent account creation attempts
  private _isCreatingAccount = false;
  // Guard against concurrent Google sign-in attempts
  private _isSigningInWithGoogle = false;
  // Guard against concurrent Apple sign-in attempts
  private _isSigningInWithApple = false;
  // Guard against concurrent email sign-in attempts
  private _isSigningInWithEmail = false;

  // Google Web Client ID for OAuth fallback (Chrome Custom Tabs)
  private readonly GOOGLE_WEB_CLIENT_ID =
    "294969617102-fuif26sghnbtrpecffne0909a4ders0e.apps.googleusercontent.com";

  /**
   * Returns true if running on a native platform (iOS/Android)
   */
  private get _isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  constructor(
    private _userService: UsersService,
    private _firebaseApp: FirebaseApp
  ) {
    super();

    // Skip auth initialization on server (SSR)
    if (!this._isBrowser) {
      this._auth = null as any;
      return;
    }

    this._auth = getAuth(this._firebaseApp);

    // Configure persistence with robust fallbacks (browser-only)
    // This addresses cases where a browser blocks a specific storage backend
    // and would otherwise fall back to in-memory (non-persistent) storage.
    this._configurePersistence(this._auth).catch((err) => {
      console.warn("Auth persistence configuration failed:", err);
    });

    // Check for existing session without triggering Firebase API calls
    this._checkExistingSessionSafely();

    // Setup Firebase auth state listener only after consent
    this.executeWhenConsent(() => {
      this._initializeAuthStateListener();
    }).catch(() => {
      console.log("Firebase Auth state listener waiting for consent");
    });

    // Listen for consent changes to restore pending sessions
    this._consentService.consentGranted$.subscribe((hasConsent: boolean) => {
      if (hasConsent) {
        this.restorePendingSession();
      }
    });
  }

  private _checkExistingSessionSafely() {
    // Check localStorage for basic session info without triggering Firebase API calls
    if (typeof window !== "undefined") {
      try {
        // Check if there are Firebase Auth persistence keys in localStorage
        const firebaseKeys = Object.keys(localStorage).filter(
          (key) =>
            key.startsWith("firebase:authUser:") ||
            key.includes("firebaseLocalStorageDb")
        );

        if (firebaseKeys.length > 0) {
          console.log(
            "Detected existing Firebase session, will restore after consent"
          );
          // Set a flag that we have a potential session to restore
          this._hasPendingSession = true;
        }
      } catch (error) {
        console.warn("Could not check for existing session:", error);
      }
    }
  }

  private _hasPendingSession = false;

  private _persistenceConfigured = false;
  private async _configurePersistence(auth: Auth) {
    if (this._persistenceConfigured) return;
    this._persistenceConfigured = true;

    if (typeof window === "undefined") return; // SSR: skip

    // Prefer IndexedDB first for best durability and multi-tab behavior.
    // Fall back to localStorage for environments where IndexedDB is blocked,
    // then in-memory as a last resort.
    // SKIP IndexedDB on Native (Capacitor) as it is unreliable in WebViews
    const isNative = Capacitor.isNativePlatform();

    try {
      if (!isNative) {
        await runInInjectionContext(this.injector, async () => {
          await this._auth.setPersistence(indexedDBLocalPersistence);
          console.log(
            "Firebase Auth persistence set: indexedDBLocalPersistence"
          );
        });
        return;
      }
    } catch (e1) {
      console.warn(
        "IndexedDB persistence unavailable, trying localStorage",
        e1
      );
    }

    try {
      await runInInjectionContext(this.injector, async () => {
        await this._auth.setPersistence(browserLocalPersistence);
        console.log("Firebase Auth persistence set: browserLocalPersistence");
      });
      return;
    } catch (e2) {
      console.warn(
        "localStorage persistence unavailable, falling back to in-memory",
        e2
      );
    }

    // Last resort to keep app functional (not persistent across reloads)
    await runInInjectionContext(this.injector, async () => {
      await this._auth.setPersistence(inMemoryPersistence);
      console.warn(
        "Firebase Auth persistence set: inMemoryPersistence (non-persistent)"
      );
    });
  }

  /**
   * Call this method when consent is granted to restore any pending authentication session
   */
  public restorePendingSession() {
    if (this._hasPendingSession && !this._authStateListenerInitialized) {
      console.log("Restoring pending authentication session after consent");
      this._initializeAuthStateListener();
      this._hasPendingSession = false;
    }
  }

  private _initializeAuthStateListener() {
    if (!this._authStateListenerInitialized) {
      this._authStateListenerInitialized = true;

      if (this._isNative) {
        // Use Capacitor Firebase Authentication listener for native platforms
        FirebaseAuthentication.addListener(
          "authStateChange",
          (change: { user: CapacitorFirebaseUser | null }) => {
            this._handleAuthStateChange(change.user);
          }
        );
        // Also check current user immediately
        FirebaseAuthentication.getCurrentUser().then((result) => {
          this._handleAuthStateChange(result.user);
        });

        // On Android, ALSO listen to web auth state changes
        // This is needed for Chrome Custom Tabs OAuth fallback which uses
        // signInWithCredential from the JS SDK (not the Capacitor plugin)
        if (Capacitor.getPlatform() === "android") {
          this.auth.onAuthStateChanged((user) => {
            if (user) {
              console.log(
                "Web auth state detected user (OAuth fallback):",
                user.uid
              );
              this._handleAuthStateChange(user);
            }
          });
        }
      } else {
        // Use web Firebase Auth listener
        this.auth.onAuthStateChanged(
          this.firebaseAuthChangeListener,
          this.firebaseAuthChangeError
        );
      }
    }
  }

  private _currentFirebaseUser: FirebaseUser | null = null;

  private _defaultUserSettings: UserSchema["settings"] = {
    maps: "googlemaps",
  };

  /**
   * Handles auth state changes from both web and native platforms
   */
  private _handleAuthStateChange(
    user: FirebaseUser | CapacitorFirebaseUser | null
  ) {
    if (user) {
      // If we have a firebase user, we are signed in.
      if (!this._isNative) {
        this._currentFirebaseUser = user as FirebaseUser;
      }
      this.isSignedIn = true;

      this.user.uid = user.uid;
      this.user.email = user.email ?? undefined;
      this.user.emailVerified = user.emailVerified;
      // detailed provider info is in providerData, but the top-level providerId explains how they signed in *this session*
      // or we check the first provider in providerData
      if (this._isNative) {
        // Capacitor user might have providerId directly or in providerId
        this.user.providerId = (user as any).providerId;

        // Fallback: if providerId is 'Firebase', check providerData to get the real provider
        if (
          this.user.providerId === "Firebase" &&
          (user as any).providerData?.length > 0
        ) {
          const firstProvider = (user as any).providerData[0];
          if (firstProvider && firstProvider.providerId) {
            this.user.providerId = firstProvider.providerId;
          }
        }
      } else {
        // Firebase web user
        const fbUser = user as FirebaseUser;
        this.user.providerId = fbUser.providerData[0]?.providerId;
      }

      // Send basic auth state immediately (with Firebase user data)
      this.authState$.next(this.user);

      // Fetch user data from Firestore immediately (already consent-gated by executeWhenConsent wrapper)
      this._fetchUserData(user.uid, true);
    } else {
      // We don't have a firebase user, we are not signed in
      this._currentFirebaseUser = null;
      this.isSignedIn = false;
      this.user.uid = "";

      this.authState$.next(null);
    }
  }

  private firebaseAuthChangeListener = (firebaseUser: FirebaseUser | null) => {
    this._handleAuthStateChange(firebaseUser);
  };

  private firebaseAuthChangeError = (error: any) => {
    console.error(error);
  };

  private _fetchUserData(uid: string, sendUpdate = true) {
    // Only fetch user data if consent is granted
    this.executeWithConsent(() => {
      this._userService.getUserById(uid).subscribe(
        (_user) => {
          if (_user) {
            this.user.data = _user;

            if (sendUpdate) {
              this.authState$.next(this.user);
            }
          } else {
            console.error("User data not found for uid", uid);
          }
        },
        (err) => {
          console.error(err);
        }
      );
    }).catch((err) => {
      console.warn("User data fetch blocked due to missing consent:", err);
    });
  }

  /**
   * Refetches the user data from the database. This only updates the data of the currently authenticated user.
   *
   * Meaning if, for example the display name changed in the background and this function is called on your own profile page, the name only changes in the navbar in the top right but not in the profile. Since the profile information is fetched seperately from the data belonging to the corresponding user
   *
   * Also: Following and Followers are not updated with this function call. Only things like display name, profile picture and so on.
   */
  public refetchUserData() {
    if (!this.user.uid) {
      console.error("No user uid found when refetching User Data");
      return;
    }

    // Only refetch if consent is granted
    this.executeWithConsent(() => {
      this._fetchUserData(this.user.uid!, true);
    }).catch((err) => {
      console.warn("User data refetch blocked due to missing consent:", err);
    });
  }

  // ============================================
  // Sign In with Email and Password
  // ============================================

  public signInEmailPassword(email: string, password: string) {
    if (this._isNative) {
      return this._signInEmailPasswordNative(email, password);
    }
    return this._signInEmailPasswordWeb(email, password);
  }

  private _signInEmailPasswordWeb(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  private async _signInEmailPasswordNative(email: string, password: string) {
    const result = await FirebaseAuthentication.signInWithEmailAndPassword({
      email,
      password,
    });
    return result;
  }

  // ============================================
  // Sign In with Google
  // ============================================

  public async signInGoogle(): Promise<void> {
    if (this._isNative) {
      return this._signInGoogleNative();
    }
    return this._signInGoogleWeb();
  }

  private async _signInGoogleWeb(): Promise<void> {
    // Guard against concurrent Google sign-in attempts
    if (this._isSigningInWithGoogle) {
      console.warn(
        "Google sign-in already in progress, rejecting duplicate request"
      );
      return Promise.reject(
        new Error(
          "Google sign-in is already in progress. Please wait for the first attempt to complete."
        )
      );
    }

    this._isSigningInWithGoogle = true;

    try {
      let googleAuthProvider = new GoogleAuthProvider();
      googleAuthProvider.addScope("email");
      googleAuthProvider.addScope("profile");

      let googleSignInResponse = await runInInjectionContext(
        this._injector,
        () => signInWithPopup(this.auth, googleAuthProvider)
      );

      // check if the user exists in the database
      await this._handleGoogleSignInResult(
        googleSignInResponse.user.uid,
        googleSignInResponse.user.displayName,
        googleSignInResponse.user.emailVerified
      );
    } finally {
      this._isSigningInWithGoogle = false;
    }
  }

  private async _signInGoogleNative(): Promise<void> {
    // Guard against concurrent Google sign-in attempts
    if (this._isSigningInWithGoogle) {
      console.warn(
        "Google sign-in already in progress, rejecting duplicate request"
      );
      return Promise.reject(
        new Error(
          "Google sign-in is already in progress. Please wait for the first attempt to complete."
        )
      );
    }

    this._isSigningInWithGoogle = true;

    try {
      const result = await FirebaseAuthentication.signInWithGoogle();

      if (result.user) {
        await this._handleGoogleSignInResult(
          result.user.uid,
          result.user.displayName,
          result.user.emailVerified
        );
      }
    } catch (error: any) {
      // Log detailed error information for debugging
      console.error("Google Sign-In Native Error:", {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        fullError: JSON.stringify(error, null, 2),
      });

      const errorMessage = error?.message?.toLowerCase() || "";

      // Check if user cancelled
      const isCancellation =
        errorMessage.includes("cancel") ||
        errorMessage.includes("user denied") ||
        errorMessage.includes("popup-closed");

      // Check if this might be a MicroG or credential manager conflict
      // Common with YouTube ReVanced users who have duplicate Google accounts
      const isMicroGLikeError =
        errorMessage.includes("no credentials") ||
        errorMessage.includes("nocredentialexception") ||
        errorMessage.includes("credential") ||
        (errorMessage === "" && error?.code === undefined); // Silent failures often indicate MicroG

      if (
        !isCancellation &&
        isMicroGLikeError &&
        Capacitor.getPlatform() === "android"
      ) {
        // Fall back to Chrome Custom Tabs OAuth for MicroG users
        console.log(
          "Native Google sign-in failed (likely MicroG), falling back to Chrome Custom Tabs OAuth..."
        );
        this._isSigningInWithGoogle = false;
        return this._signInGoogleCustomTabs();
      }

      throw error;
    } finally {
      this._isSigningInWithGoogle = false;
    }
  }

  /**
   * Sign in with Google using Chrome Custom Tabs (fallback for MicroG users on Android).
   * Opens a real browser for OAuth, bypassing WebView limitations.
   */
  private async _signInGoogleCustomTabs(): Promise<void> {
    const redirectUri = "https://pkspot.app/oauth/callback";
    const scope = encodeURIComponent("openid email profile");
    const responseType = "id_token";
    const nonce = this._generateNonce();

    // Store nonce for validation (optional, for extra security)
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("google_oauth_nonce", nonce);
    }

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${this.GOOGLE_WEB_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=${responseType}` +
      `&scope=${scope}` +
      `&nonce=${nonce}`;

    console.log("Opening Chrome Custom Tabs for Google OAuth...");

    // Open in Chrome Custom Tabs (real browser, not WebView)
    await Browser.open({ url: authUrl });
  }

  /**
   * Generate a random nonce for OAuth security
   */
  private _generateNonce(): string {
    const array = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto
      for (let i = 0; i < 16; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  /**
   * Handle OAuth callback from Chrome Custom Tabs.
   * Called by app.component.ts when a deep link to /oauth/callback is received.
   */
  public async handleOAuthCallback(idToken: string): Promise<void> {
    try {
      console.log("Handling OAuth callback with ID token...");

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await runInInjectionContext(this._injector, () =>
        signInWithCredential(this.auth, credential)
      );

      if (result.user) {
        console.log("OAuth callback sign-in successful");
        await this._handleGoogleSignInResult(
          result.user.uid,
          result.user.displayName,
          result.user.emailVerified
        );
      }
    } catch (error: any) {
      console.error("OAuth callback error:", {
        message: error?.message,
        code: error?.code,
      });
      throw error;
    }
  }

  /**
   * Shared logic for handling Google sign-in result (both web and native)
   */
  private async _handleGoogleSignInResult(
    uid: string,
    displayName: string | null,
    emailVerified: boolean
  ): Promise<void> {
    try {
      let user: User | null = await firstValueFrom(
        this._userService.getUserById(uid)
      );
      if (!user) {
        // This is a new user!
        this.trackEventWithConsent("Create Account", {
          props: { accountType: "Google" },
        });

        if (!displayName) {
          console.error("Google Sign In: No display name found");
          return;
        }

        // create a database entry for the user
        this._userService.addUser(uid, displayName, {
          verified_email: emailVerified,
          settings: this._defaultUserSettings,
        });
      }
    } catch (error) {
      // user does not exist
      console.error(error);
    }
  }

  // ============================================
  // Apple Sign In
  // ============================================

  public signInApple(): Promise<void> {
    if (this._isNative) {
      return this._signInAppleNative();
    }
    return this._signInAppleWeb();
  }

  private async _signInAppleWeb(): Promise<void> {
    // Guard against concurrent Apple sign-in attempts
    if (this._isSigningInWithApple) {
      console.warn(
        "Apple sign-in already in progress, rejecting duplicate request"
      );
      return Promise.reject(
        new Error(
          "Apple sign-in is already in progress. Please wait for the first attempt to complete."
        )
      );
    }

    this._isSigningInWithApple = true;

    try {
      let appleAuthProvider = new OAuthProvider("apple.com");
      appleAuthProvider.addScope("email");
      appleAuthProvider.addScope("name");

      let appleSignInResponse = await runInInjectionContext(
        this._injector,
        () => signInWithPopup(this.auth, appleAuthProvider)
      );

      // check if the user exists in the database
      await this._handleAppleSignIn(
        appleSignInResponse.user.uid,
        appleSignInResponse.user.displayName,
        appleSignInResponse.user.emailVerified
      );
    } finally {
      this._isSigningInWithApple = false;
    }
  }

  private async _signInAppleNative(): Promise<void> {
    // Guard against concurrent Apple sign-in attempts
    if (this._isSigningInWithApple) {
      console.warn(
        "Apple sign-in already in progress, rejecting duplicate request"
      );
      return Promise.reject(
        new Error(
          "Apple sign-in is already in progress. Please wait for the first attempt to complete."
        )
      );
    }

    this._isSigningInWithApple = true;

    try {
      const result = await FirebaseAuthentication.signInWithApple();

      if (result.user) {
        await this._handleAppleSignIn(
          result.user.uid,
          result.user.displayName,
          result.user.emailVerified
        );
      }
    } catch (error: any) {
      // Log detailed error information for debugging
      console.error("Apple Sign-In Native Error:", {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        fullError: JSON.stringify(error, null, 2),
      });
      throw error;
    } finally {
      this._isSigningInWithApple = false;
    }
  }

  private async _handleAppleSignIn(
    uid: string,
    displayName: string | null,
    emailVerified: boolean
  ): Promise<void> {
    try {
      let user: User | null = await firstValueFrom(
        this._userService.getUserById(uid)
      );
      if (!user) {
        // This is a new user!
        this.trackEventWithConsent("Create Account", {
          props: { accountType: "Apple" },
        });

        if (!displayName) {
          console.error("Apple Sign In: No display name found");
          return;
        }

        // create a database entry for the user
        this._userService.addUser(uid, displayName, {
          verified_email: emailVerified,
          settings: this._defaultUserSettings,
        });
      }
    } catch (error) {
      // user does not exist
      console.error(error);
    }
  }

  // ============================================
  // Sign Out
  // ============================================

  public logUserOut(): Promise<void> {
    if (this._isNative) {
      return this._logUserOutNative();
    }
    return this._logUserOutWeb();
  }

  private _logUserOutWeb(): Promise<void> {
    return signOut(this.auth);
  }

  private async _logUserOutNative(): Promise<void> {
    await FirebaseAuthentication.signOut();
  }

  // ============================================
  // Resend Verification Email
  // ============================================

  public resendVerificationEmail(): Promise<void> {
    if (this._isNative) {
      return this._resendVerificationEmailNative();
    }
    return this._resendVerificationEmailWeb();
  }

  private _resendVerificationEmailWeb(): Promise<void> {
    if (!this._currentFirebaseUser) {
      return Promise.reject("No current firebase user found");
    }
    return sendEmailVerification(this._currentFirebaseUser);
  }

  private async _resendVerificationEmailNative(): Promise<void> {
    const { user } = await FirebaseAuthentication.getCurrentUser();
    if (!user) {
      return Promise.reject("No current firebase user found");
    }
    await FirebaseAuthentication.sendEmailVerification();
  }

  // ============================================
  // Get Current User UID (Direct SDK Call)
  // ============================================

  public async getCurrentUserUid(): Promise<string | undefined> {
    if (this._isNative) {
      const { user } = await FirebaseAuthentication.getCurrentUser();
      return user?.uid;
    } else {
      return this.auth.currentUser?.uid;
    }
  }

  // ============================================
  // Create Account
  // ============================================

  public async createAccount(
    email: string,
    confirmedPassword: string,
    displayName: string
  ): Promise<void> {
    if (this._isNative) {
      return this._createAccountNative(email, confirmedPassword, displayName);
    }
    return this._createAccountWeb(email, confirmedPassword, displayName);
  }

  private async _createAccountWeb(
    email: string,
    confirmedPassword: string,
    displayName: string
  ): Promise<void> {
    if (!this.auth) {
      return Promise.reject("Auth service not initialized");
    }

    // Guard against concurrent account creation attempts
    if (this._isCreatingAccount) {
      console.warn(
        "Account creation already in progress, rejecting duplicate request"
      );
      return Promise.reject(
        new Error(
          "Account creation is already in progress. Please wait for the first attempt to complete."
        )
      );
    }

    this._isCreatingAccount = true;

    try {
      // Ensure consent before creating account (which triggers reCAPTCHA)
      return await this.executeWithConsent(() => {
        return createUserWithEmailAndPassword(
          this.auth!,
          email,
          confirmedPassword
        ).then((firebaseAuthResponse) => {
          this.trackEventWithConsent("Create Account", {
            props: { accountType: "Email and Password" },
          });

          if (!this._currentFirebaseUser) {
            return Promise.reject("No current firebase user found");
          }

          // Set the user chose Display name
          updateProfile(this._currentFirebaseUser, {
            displayName: displayName,
          });

          // create a database entry for the user
          this._userService.addUser(
            firebaseAuthResponse.user.uid,
            displayName,
            {
              verified_email: false,
              settings: this._defaultUserSettings,
            }
          );

          // Send verification email
          sendEmailVerification(firebaseAuthResponse.user);
        });
      });
    } finally {
      this._isCreatingAccount = false;
    }
  }

  private async _createAccountNative(
    email: string,
    confirmedPassword: string,
    displayName: string
  ): Promise<void> {
    // Guard against concurrent account creation attempts
    if (this._isCreatingAccount) {
      console.warn(
        "Account creation already in progress, rejecting duplicate request"
      );
      return Promise.reject(
        new Error(
          "Account creation is already in progress. Please wait for the first attempt to complete."
        )
      );
    }

    this._isCreatingAccount = true;

    try {
      // Ensure consent before creating account
      return await this.executeWithConsent(async () => {
        const result =
          await FirebaseAuthentication.createUserWithEmailAndPassword({
            email,
            password: confirmedPassword,
          });

        if (!result.user) {
          return Promise.reject("Failed to create user account");
        }

        this.trackEventWithConsent("Create Account", {
          props: { accountType: "Email and Password" },
        });

        // Set the user's display name
        await FirebaseAuthentication.updateProfile({
          displayName: displayName,
        });

        // Create a database entry for the user
        this._userService.addUser(result.user.uid, displayName, {
          verified_email: false,
          settings: this._defaultUserSettings,
        });

        // Send verification email
        await FirebaseAuthentication.sendEmailVerification();
      });
    } finally {
      this._isCreatingAccount = false;
    }
  }

  // ============================================
  // Reauthentication (required for sensitive ops)
  // ============================================

  /**
   * Reauthenticate the current user with their password.
   * Required before sensitive operations like email/password change or account deletion.
   */
  public async reauthenticateWithProvider(providerId: string): Promise<void> {
    if (this._isNative) {
      return this._reauthenticateWithProviderNative(providerId);
    }
    return this._reauthenticateWithProviderWeb(providerId);
  }

  private async _reauthenticateWithProviderWeb(
    providerId: string
  ): Promise<void> {
    if (!this.auth.currentUser) {
      return Promise.reject(new Error("No user signed in"));
    }

    let provider: AuthProvider;
    if (providerId === "google.com" || providerId === "google") {
      provider = new GoogleAuthProvider();
    } else if (providerId === "apple.com" || providerId === "apple") {
      provider = new OAuthProvider("apple.com");
    } else {
      return Promise.reject(new Error("Unsupported provider: " + providerId));
    }

    await runInInjectionContext(this._injector, () =>
      reauthenticateWithPopup(this.auth.currentUser!, provider)
    );
  }

  private async _reauthenticateWithProviderNative(
    providerId: string
  ): Promise<void> {
    console.log("Re-authenticating with provider (native):", providerId);

    // For native, "reauthentication" is effectively just signing in again
    // The native SDKs handle the session merge/refresh

    // Check for google (google.com or just google)
    if (providerId === "google.com" || providerId === "google") {
      try {
        await this.signInGoogle();
      } catch (err) {
        console.error("Native Google re-auth failed:", err);
        throw err;
      }
    }
    // Check for apple (apple.com or just apple)
    else if (providerId === "apple.com" || providerId === "apple") {
      try {
        await this.signInApple();
      } catch (err) {
        console.error("Native Apple re-auth failed:", err);
        throw err;
      }
    } else {
      console.error("Unsupported provider for re-auth:", providerId);
      throw new Error("Unsupported provider: " + providerId);
    }
  }

  public async reauthenticate(password: string): Promise<void> {
    if (this._isNative) {
      return this._reauthenticateNative(password);
    }
    return this._reauthenticateWeb(password);
  }

  private async _reauthenticateWeb(password: string): Promise<void> {
    if (!this._currentFirebaseUser || !this._currentFirebaseUser.email) {
      throw new Error("No authenticated user found");
    }

    const { EmailAuthProvider } = await import("@angular/fire/auth");
    const credential = EmailAuthProvider.credential(
      this._currentFirebaseUser.email,
      password
    );
    await reauthenticateWithCredential(this._currentFirebaseUser, credential);
  }

  private async _reauthenticateNative(password: string): Promise<void> {
    const { user } = await FirebaseAuthentication.getCurrentUser();
    if (!user || !user.email) {
      throw new Error("No authenticated user found");
    }
    // For native, we sign in again with email/password to reauthenticate
    await FirebaseAuthentication.signInWithEmailAndPassword({
      email: user.email,
      password,
    });
  }

  // ============================================
  // Update Email
  // ============================================

  /**
   * Update the user's email address.
   * Requires reauthentication first.
   */
  public async changeEmail(newEmail: string, password: string): Promise<void> {
    // Reauthenticate first
    await this.reauthenticate(password);

    if (this._isNative) {
      return this._changeEmailNative(newEmail);
    }
    return this._changeEmailWeb(newEmail);
  }

  private async _changeEmailWeb(newEmail: string): Promise<void> {
    if (!this._currentFirebaseUser) {
      throw new Error("No authenticated user found");
    }
    await updateEmail(this._currentFirebaseUser, newEmail);
    // Send verification email to new address
    await sendEmailVerification(this._currentFirebaseUser);
    // Update local state
    this.user.email = newEmail;
    this.user.emailVerified = false;
    this.authState$.next(this.user);
  }

  private async _changeEmailNative(newEmail: string): Promise<void> {
    await FirebaseAuthentication.updateEmail({ newEmail });
    await FirebaseAuthentication.sendEmailVerification();
    // Update local state
    this.user.email = newEmail;
    this.user.emailVerified = false;
    this.authState$.next(this.user);
  }

  // ============================================
  // Update Password
  // ============================================

  /**
   * Update the user's password.
   * Requires reauthentication first.
   */
  public async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    // Reauthenticate first
    await this.reauthenticate(currentPassword);

    if (this._isNative) {
      return this._changePasswordNative(newPassword);
    }
    return this._changePasswordWeb(newPassword);
  }

  private async _changePasswordWeb(newPassword: string): Promise<void> {
    if (!this._currentFirebaseUser) {
      throw new Error("No authenticated user found");
    }
    await updatePassword(this._currentFirebaseUser, newPassword);
  }

  private async _changePasswordNative(newPassword: string): Promise<void> {
    await FirebaseAuthentication.updatePassword({ newPassword });
  }

  // ============================================
  // Send Password Reset Email
  // ============================================

  /**
   * Send a password reset email to the specified address.
   */
  public async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this._auth, email);
  }

  // ============================================
  // Delete Account
  // ============================================

  /**
   * Delete the user's account.
   * This deletes both the Firebase Auth account and the Firestore user document.
   * Requires reauthentication first.
   */
  public async deleteAccount(password?: string): Promise<void> {
    // Reauthenticate first if password is provided
    if (password) {
      await this.reauthenticate(password);
    }

    const userId = this.user.uid;
    if (!userId) {
      throw new Error("No user ID found");
    }

    // Delete Firebase Auth account first (while still authenticated)
    if (this._isNative) {
      await this._deleteAccountNative();
    } else {
      await this._deleteAccountWeb();
    }

    // Then delete Firestore user document
    try {
      await this._userService.deleteUser(userId);
    } catch (err) {
      // Log but don't throw - auth user is already deleted
      console.warn("Failed to delete user document:", err);
    }

    // Clear local state
    this.isSignedIn = false;
    this.user = {};
    this.authState$.next(null);
  }

  private async _deleteAccountWeb(): Promise<void> {
    if (!this._currentFirebaseUser) {
      throw new Error("No authenticated user found");
    }
    await deleteUser(this._currentFirebaseUser);
  }

  private async _deleteAccountNative(): Promise<void> {
    await FirebaseAuthentication.deleteUser();
  }
}
