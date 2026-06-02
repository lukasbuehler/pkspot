import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app link rules", () => {
  it("excludes QR sticker paths from iOS Universal Links before the wildcard fallback", () => {
    const aasa = JSON.parse(
      readFileSync(
        resolve("src/assets/.well-known/apple-app-site-association"),
        "utf8"
      )
    );

    const components = aasa.applinks.details[0].components;

    expect(components[0]).toMatchObject({
      "/": "/qr/*",
      exclude: true,
    });
    expect(components[1]).toMatchObject({
      "/": "/",
    });
    expect(components[2]).toMatchObject({
      "/": "/*",
    });
  });

  it("keeps Android App Links scoped away from QR sticker paths", () => {
    const manifest = readFileSync(
      resolve("android/app/src/main/AndroidManifest.xml"),
      "utf8"
    );

    expect(manifest).not.toContain(
      '<data android:scheme="https" android:host="pkspot.app" />'
    );
    expect(manifest).not.toMatch(/android:pathPrefix="\/qr(?:\/|")/u);
    expect(manifest).toContain('android:path="/"');
    expect(manifest).toContain('android:pathPrefix="/map"');
    expect(manifest).toContain('android:pathPrefix="/organizations"');
    expect(manifest).toContain('android:pathPrefix="/contact"');
  });
});
