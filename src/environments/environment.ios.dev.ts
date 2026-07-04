import { environment as iosEnvironment } from "./environment.ios";

export const environment = {
  ...iosEnvironment,
  name: "iOS Development",
  production: false,
  appCheck: {
    ...iosEnvironment.appCheck,
    debugToken: true,
  },
};
