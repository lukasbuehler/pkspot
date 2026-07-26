import { environment as androidEnvironment } from "./environment.android";

export const environment = {
  ...androidEnvironment,
  name: "Android Development",
  production: false,
  features: {
    ...androidEnvironment.features,
    training: true,
  },
  appCheck: {
    ...androidEnvironment.appCheck,
    debugToken: true,
  },
};
