import { afterEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => platform.native } }));

import { lockNativePageZoom } from "./browser-startup";

describe("lockNativePageZoom", () => {
  const base = "width=device-width, initial-scale=1.0, viewport-fit=cover";
  const addViewport = () => {
    const meta = document.createElement("meta");
    meta.name = "viewport";
    meta.content = base;
    document.head.appendChild(meta);
    return meta;
  };
  afterEach(() => document.head.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove()));

  it("leaves pinch zoom on in browsers", () => {
    platform.native = false;
    const meta = addViewport();
    lockNativePageZoom();
    expect(meta.content).toBe(base);
  });

  it("locks page zoom once in the native app", () => {
    platform.native = true;
    const meta = addViewport();
    lockNativePageZoom();
    lockNativePageZoom();
    expect(meta.content).toBe(`${base}, maximum-scale=1.0, user-scalable=no`);
  });
});
