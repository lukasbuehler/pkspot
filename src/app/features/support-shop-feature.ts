import { environment } from "../../environments/environment.default";

export const supportShopFeatureEnabled =
  (environment.features as Record<string, unknown>)["supportShop"] === true;
