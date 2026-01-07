import {
  inject,
  Injectable,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import {
  GoogleAuthProvider,
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  signInWithPopup,
  User as FirebaseUser,
  signOut,
  sendEmailVerification,
  createUserWithEmailAndPassword,
  updateProfile,
} from "@angular/fire/auth";
import {
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
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

interface AuthServiceUser {
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  data?: User;
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

  private _auth: Auth;
  public get auth() {
    return this._auth;
  }
  private _authStateListenerInitialized = false;

  // Guard against concurrent account creation attempts
  private _isCreatingAccount = false;
  // Guard against concurrent Google sign-in attempts
  private _isSigningInWithGoogle = false;

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

      let googleSignInResponse = await signInWithPopup(
        this.auth,
        googleAuthProvider
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
    } finally {
      this._isSigningInWithGoogle = false;
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
}
