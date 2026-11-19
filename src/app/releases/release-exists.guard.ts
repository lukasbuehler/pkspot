import { CanMatchFn } from "@angular/router";
import { findRelease } from "./release-notes";

/** Unknown versions fall through to the 404 page instead of an empty release page. */
export const releaseExistsGuard: CanMatchFn = (_route, segments) =>
  findRelease(segments[1]?.path ?? "") !== undefined;
