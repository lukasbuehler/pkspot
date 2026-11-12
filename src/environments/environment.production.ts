import firebaseConfig from "./firebase.production.json";
import { ageVerificationProviders } from "./age-verification";
export const environment = {
  name: "Production",
  production: true,
  baseUrl: "https://pkspot.app",
  mapId: "e2926e5bfb22860c",
  features: {
    finances: false,
    ageVerification: { ...ageVerificationProviders },
    shareCards: true,
    plannedSessions: false,
    training: true,
    googlePlacePhotoInGallery: false,
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
      apiKey: "phc_CfGR4HBeaYxkP53Gl4w2wmA2dipZtjFX1FkupF8FNo6",
      host: "https://eu.i.posthog.com",
    },
  },
};
