export const environment = {
  name: "Default",
  production: false,
  baseUrl: "https://pkspot.app",
  mapId: "",
  features: {
    checkIns: false,
    activity: false,
    streetView: {
      preview: true,
      detail: true,
    },
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
