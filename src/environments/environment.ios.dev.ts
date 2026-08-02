import { environment as iosEnvironment } from "./environment.ios";

export const environment = {
  ...iosEnvironment,
  name: "iOS Development",
  production: false,
  features: {
    ...iosEnvironment.features,
  },
  appCheck: {
    ...iosEnvironment.appCheck,
    debugToken: true,
  },
};
