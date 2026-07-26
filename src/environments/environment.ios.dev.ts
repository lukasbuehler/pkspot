import { environment as iosEnvironment } from "./environment.ios";

export const environment = {
  ...iosEnvironment,
  name: "iOS Development",
  production: false,
  features: {
    ...iosEnvironment.features,
    training: true,
  },
  appCheck: {
    ...iosEnvironment.appCheck,
    debugToken: true,
  },
};
