/// <reference types="@capacitor-firebase/app-check" />
/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "com.pkspot.app",
  appName: "PK Spot",
  webDir: "dist/pkspot/browser",
  ios: {
    loggingBehavior: "debug", // Logs JS console to Xcode console
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          "@capacitor-firebase/app-check": {
            symlink: true,
          },
        },
      },
    },
  },
  server: {
    hostname: "pkspot.app",
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: "#1f1f23",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com", "apple.com"],
    },
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: false,
    },
  },
};

export default config;
