export const environment = {
  name: "CI",
  production: false,
  baseUrl: "https://pkspot.app",
  mapId: "e2926e5bfb22860c",
  features: {
    // Training is live in the shipped environments. Keep it enabled in CI so
    // route builds and visual coverage exercise the same route table.
    plannedSessions: false,
    training: true,
    checkIns: false,
    supportShop: false,
    continuousEventCalendar: true,
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
      projectId: "parkour-base-project",
      appId: "1:294969617102:web:f9a2fcf843e8b288313e9f",
      databaseURL: "https://parkour-base-project.firebaseio.com",
      storageBucket: "parkour-base-project.appspot.com",
      locationId: "us-central1",
      authDomain: "parkour-base-project.firebaseapp.com",
      messagingSenderId: "294969617102",
      measurementId: "G-K7E4HFP8NM",
      apiKey: "set by CI/CD runner in prepare-ci-environment.mjs",
    },
    typesense: {
      host: "search.pkspot.app",
      apiKey: "7yxCDDLoGisH1vDtl2ZBfIglrr3OXsVk",
    },
    posthog: {
      apiKey: "",
      host: "",
    },
  },
};
