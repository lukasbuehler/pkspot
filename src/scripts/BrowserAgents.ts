/** Shared by the app and its small browser entry, without importing data models. */
export function isBot(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /bot|googlebot|crawler|spider|robot|crawling/i.test(userAgent);
}
