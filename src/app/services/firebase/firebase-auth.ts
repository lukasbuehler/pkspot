import type { FirebaseApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
// Internal API: signInWithPopup caches its resolver here, so warming any other
// instance would not help. package.json pins this package to the firebase version.
import { _getInstance } from "@firebase/auth/internal";

interface PopupRedirectResolverInternal {
  _initialize(auth: Auth): Promise<unknown>;
}

// Matches getAuth(), except for its popupRedirectResolver. That resolver loads
// gapi and the firebaseapp.com auth iframe during startup on mobile and Safari,
// which only popup sign-in needs. The SDK compares these options by value, so
// repeated calls return the same instance.
const AUTH_OPTIONS = {
  persistence: [
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
  ],
};

/** Returns the app's Auth instance without loading the popup sign-in iframe. */
export function getFirebaseAuth(app: FirebaseApp): Auth {
  // The server build has no browser persistence to initialize with.
  if (typeof window === "undefined") return getAuth(app);
  try {
    return initializeAuth(app, AUTH_OPTIONS);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/already-initialized") {
      return getAuth(app);
    }
    throw error;
  }
}

/**
 * Loads the popup helper while a sign-in control is visible. Browsers can block
 * a popup when this loading happens between the user's tap and window.open(),
 * which is why the SDK normally does it at startup on mobile and Safari.
 */
export async function preloadPopupSignIn(auth: Auth): Promise<void> {
  const resolver = _getInstance<PopupRedirectResolverInternal>(
    browserPopupRedirectResolver,
  );
  await resolver._initialize(auth);
}
