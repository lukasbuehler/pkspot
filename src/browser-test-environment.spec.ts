import { afterEach, expect, it } from "vitest";

const key = "pkspot:test-browser-storage";
afterEach(() => {
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
});

it("uses jsdom browser storage rather than Node's server-side storage globals", () => {
  expect(globalThis.localStorage).toBe(window.localStorage);
  expect(globalThis.sessionStorage).toBe(window.sessionStorage);
  localStorage.setItem(key, "local");
  sessionStorage.setItem(key, "session");
  expect(window.localStorage.getItem(key)).toBe("local");
  expect(window.sessionStorage.getItem(key)).toBe("session");
});
