export const environment = {
  name: "Production",
  production: true,
  baseUrl: "https://pkspot.app",
  mapId: "e2926e5bfb22860c",
  features: {
    checkIns: false,
    activity: false,
    streetView: {
      preview: false,
      detail: true,
      previewMinZoom: 13,
    },
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
      host: "g5re3ouiqm0j8bc9p-1.a1.typesense.net",
      apiKey: "7yxCDDLoGisH1vDtl2ZBfIglrr3OXsVk",
    },
    posthog: {
      apiKey: "phc_CfGR4HBeaYxkP53Gl4w2wmA2dipZtjFX1FkupF8FNo6",
      host: "https://eu.i.posthog.com",
    },
  },
};
