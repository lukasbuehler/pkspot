import { ageVerificationProviders } from "./age-verification";
import { environment as iosEnvironment } from "./environment.ios";

export const environment = {
  ...iosEnvironment,
  name: "iOS Development",
  production: false,
  features: {
    ...iosEnvironment.features,
    ageVerification: { ...ageVerificationProviders, oneid: true },
    supportShop: false,
  },
  appCheck: {
    ...iosEnvironment.appCheck,
    debugToken: true,
  },
};
