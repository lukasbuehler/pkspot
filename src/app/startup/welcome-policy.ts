import { isKnownUiLocalePrefix } from "../config/ui-locales";

export const ACCEPTANCE_FREE_PREFIXES = [
  "/about", "/shop", "/support", "/contact", "/terms-of-service", "/tos",
  "/privacy-policy", "/pp", "/impressum",
];

export function withoutLocalePrefix(pathname: string): string {
  const segments = pathname.split("/");
  if (segments.length > 1 && isKnownUiLocalePrefix(segments[1])) segments.splice(1, 1);
  return segments.join("/") || "/";
}

export function isAcceptanceFreePath(pathname: string): boolean {
  const path = withoutLocalePrefix(pathname);
  return ACCEPTANCE_FREE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export function shouldShowEarlyWelcome(context: {
  pathname: string;
  acceptedVersion: string | null;
  native: boolean;
  bot: boolean;
  embedded: boolean;
  notFound: boolean;
}): boolean {
  const path = withoutLocalePrefix(context.pathname);
  return !context.acceptedVersion && !context.native && !context.bot && !context.embedded &&
    !context.notFound && !isAcceptanceFreePath(path) &&
    path !== "/embedded" && !path.startsWith("/embedded/") && !path.startsWith("/__visual/");
}
