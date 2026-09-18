export const environment = {
  name: "Production",
  production: true,
  baseUrl: "https://pkspot.app",
  mapId: "e2926e5bfb22860c",
  features: {
    // Enable after the share-card backend and native bridges are verified.
    shareCards: false,
    plannedSessions: false,
    training: true,
    checkIns: true,
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
    enabled: true,
    recaptchaEnterpriseSiteKey: "6LcxpBMtAAAAAMJs-idyJ6QVbkJYx82Fi0pUUNn5",
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
      apiKey: "AIzaSyBweX0jjdbdrIy2slKPf6ZAhvl6XHz4AlI",
    },
    typesense: {
      host: "search.pkspot.app",
      apiKey: "7yxCDDLoGisH1vDtl2ZBfIglrr3OXsVk",
    },
    posthog: {
      apiKey: "phc_CfGR4HBeaYxkP53Gl4w2wmA2dipZtjFX1FkupF8FNo6",
      host: "https://eu.i.posthog.com",
    },
  },
};
