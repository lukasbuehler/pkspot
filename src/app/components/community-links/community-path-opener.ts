import { InjectionToken } from "@angular/core";

/**
 * Opens a community page from inside a host surface. The map page provides
 * this so community links in its panels open the community panel without a
 * router navigation (which would remount the map) and with a "back" target.
 * Without a provider, community links navigate with the router.
 */
export interface CommunityPathOpener {
  openCommunityPath(path: string): void;
}

export const COMMUNITY_PATH_OPENER = new InjectionToken<CommunityPathOpener>(
  "COMMUNITY_PATH_OPENER",
);
