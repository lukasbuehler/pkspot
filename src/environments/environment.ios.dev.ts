import { environment as iosEnvironment } from "./environment.ios";

export const environment = {
  ...iosEnvironment,
  name: "iOS Development",
  production: false,
  features: {
    ...iosEnvironment.features,
    supportShop: false,
  },
  appCheck: {
    ...iosEnvironment.appCheck,
    debugToken: true,
  },
};
