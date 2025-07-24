import { Injectable } from "@angular/core";
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
import { getApp } from "@angular/fire/app";
import { BehaviorSubject, firstValueFrom } from "rxjs";
import { User } from "../../../db/models/User";
import { UsersService } from "./firestore/users.service";
import { UserSchema } from "../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../consent-aware.service";

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

  private _auth: Auth | null = null;
  public get auth(): Auth {
    if (!this._auth) {
      // Initialize Auth manually since we removed it from app config
      const app = getApp();
      this._auth = getAuth(app);
    }
    return this._auth;
  }
  private _authStateListenerInitialized = false;

  constructor(private _userService: UsersService) {
    super();

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
      // This call will trigger the accounts:lookup API call
      this.auth.onAuthStateChanged(
        this.firebaseAuthChangeListener,
        this.firebaseAuthChangeError
      );
    }
  }

  private _currentFirebaseUser: FirebaseUser | null = null;

  private _defaultUserSettings: UserSchema["settings"] = {
    maps: "googlemaps",
  };

  private firebaseAuthChangeListener = (firebaseUser: FirebaseUser | null) => {
    // Auth state changed
    if (firebaseUser) {
      // If we have a firebase user, we are signed in.
      this._currentFirebaseUser = firebaseUser;
      this.isSignedIn = true;

      this.user.uid = firebaseUser.uid;
      this.user.email = firebaseUser.email ?? undefined;
      this.user.emailVerified = firebaseUser.emailVerified;

      // Send basic auth state immediately (with Firebase user data)
      this.authState$.next(this.user);

      // Fetch user data from Firestore immediately (already consent-gated by executeWhenConsent wrapper)
      this._fetchUserData(firebaseUser.uid, true);
    } else {
      // We don't have a firebase user, we are not signed in
      this._currentFirebaseUser = null;
      this.isSignedIn = false;
      this.user.uid = "";

      this.authState$.next(null);
    }
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

  public signInEmailPassword(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  public async signInGoogle(): Promise<void> {
    let googleAuthProvider = new GoogleAuthProvider();
    googleAuthProvider.addScope("email");
    googleAuthProvider.addScope("profile");

    let googleSignInResponse = await signInWithPopup(
      this.auth,
      googleAuthProvider
    );

    // check if the user exists in the database
    try {
      let user: User | null = await firstValueFrom(
        this._userService.getUserById(googleSignInResponse.user.uid)
      ); // TODO check out of context
      if (!user) {
        // This is a new user!
        this.trackEventWithConsent("Create Account", {
          props: { accountType: "Google" },
        });

        if (!googleSignInResponse.user.displayName) {
          console.error("Google Sign In: No display name found");
          return;
        }

        // create a database entry for the user
        this._userService.addUser(
          googleSignInResponse.user.uid,
          googleSignInResponse.user.displayName,
          {
            verified_email: googleSignInResponse.user.emailVerified, // TODO check
            settings: this._defaultUserSettings,
          }
        );
      }
    } catch (error) {
      // user does not exist
      console.error(error);
    }
  }

  public logUserOut(): Promise<void> {
    return signOut(this.auth);
  }

  public resendVerificationEmail(): Promise<void> {
    if (!this._currentFirebaseUser) {
      return Promise.reject("No current firebase user found");
    }
    return sendEmailVerification(this._currentFirebaseUser);
  }

  public async createAccount(
    email: string,
    confirmedPassword: string,
    displayName: string
  ): Promise<void> {
    // Ensure consent before creating account (which triggers reCAPTCHA)
    return this.executeWithConsent(() => {
      return createUserWithEmailAndPassword(
        this.auth,
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
        this._userService.addUser(firebaseAuthResponse.user.uid, displayName, {
          verified_email: false,
          settings: this._defaultUserSettings,
        });

        // Send verification email
        sendEmailVerification(firebaseAuthResponse.user);
      });
    });
  }
}
