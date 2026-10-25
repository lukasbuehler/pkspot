/**
 * True only for a local screenshot run: the screenshot flag is set and the
 * page is served from localhost. Fixtures behind this check can never affect
 * a deployed app.
 */
export function isLocalScreenshotRun(): boolean {
  const flag = (globalThis as typeof globalThis & { __PKSPOT_STORE_SCREENSHOT__?: unknown })
    .__PKSPOT_STORE_SCREENSHOT__;
  return (
    flag === true &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
  );
}
