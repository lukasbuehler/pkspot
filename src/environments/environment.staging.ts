import firebaseConfig from "./firebase.staging.json";

export const environment = {
  name: "Staging",
  production: true,
  // Keep canonical and social URLs on the production domain during the trial.
  baseUrl: "https://pkspot.app",
  mapId: "e2926e5bfb22860c",
  features: {
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
    firebaseConfig,
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
