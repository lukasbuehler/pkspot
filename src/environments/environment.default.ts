export const environment = {
  name: "Default",
  production: false,
  baseUrl: "https://pkspot.app",
  mapId: "e2926e5bfb22860c",
  features: {
    checkIns: true,
    mapPerformanceProfiling: false,
    streetView: {
      preview: false,
      detail: true,
      previewMinZoom: 13,
    },
  },
  appCheck: {
    enabled: false,
    recaptchaEnterpriseSiteKey: "",
    debugToken: false,
  },
  webPush: {
    vapidKey:
      "BLaMDzAC7VOiAKMfNmcEPXvAl7FOaANMFQhEHp9hPFQSvPw7yVTJvzDIY3hXfbVjodP-WMeqAgE4FD_u3etY1FQ",
  },
  keys: {
    firebaseConfig: {
      projectId: "",
      appId: "",
      databaseURL: "",
      storageBucket: "",
      locationId: "",
      authDomain: "",
      messagingSenderId: "",
      measurementId: "",
      apiKey: "",
    },
    typesense: {
      host: "",
      apiKey: "",
    },
    posthog: {
      apiKey: "",
      host: "",
    },
  },
};
