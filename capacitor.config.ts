/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pkspot.app",
  appName: "PK Spot",
  webDir: "dist/pkspot/browser",
  ios: {
    loggingBehavior: "debug", // Logs JS console to Xcode console
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
      resize: "native",
    },
  },
};

export default config;
