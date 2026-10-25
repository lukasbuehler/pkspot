import { environment } from "../../environments/environment.default";

export const financesFeatureEnabled =
  (environment.features as Record<string, unknown>)["finances"] === true;
