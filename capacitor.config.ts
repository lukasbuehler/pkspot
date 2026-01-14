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
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com", "apple.com"],
    },
  },
};

export default config;
