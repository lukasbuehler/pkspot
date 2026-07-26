import { environment } from "../../environments/environment.default";

export const trainingFeatureEnabled =
  (environment.features as Record<string, unknown>)["training"] === true;
