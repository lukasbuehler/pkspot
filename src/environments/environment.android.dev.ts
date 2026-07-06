import { environment as androidEnvironment } from "./environment.android";

export const environment = {
  ...androidEnvironment,
  name: "Android Development",
  production: false,
  appCheck: {
    ...androidEnvironment.appCheck,
    debugToken: true,
  },
};
