import { ageVerificationProviders } from "./age-verification";
import { environment as iosEnvironment } from "./environment.ios";

export const environment = {
  ...iosEnvironment,
  name: "iOS Development",
  production: false,
  features: {
    ...iosEnvironment.features,
    finances: false,
    ageVerification: { ...ageVerificationProviders, oneid: true },
    supportShop: false,
    mapPerformanceProfiling: true,
  },
  appCheck: {
    ...iosEnvironment.appCheck,
    debugToken: true,
  },
};
