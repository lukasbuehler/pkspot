import { ageVerificationProviders } from "./age-verification";
import { environment as androidEnvironment } from "./environment.android";

export const environment = {
  ...androidEnvironment,
  name: "Android Development",
  production: false,
  features: {
    ...androidEnvironment.features,
    ageVerification: { ...ageVerificationProviders, oneid: true },
    supportShop: false,
  },
  appCheck: {
    ...androidEnvironment.appCheck,
    debugToken: true,
  },
};
