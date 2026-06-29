import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INTERNAL_DYNAMIC_HREF_EXPRESSIONS = [
  "getUnembeddedUrl",
  "publicContentUrl",
];

describe("app link rules", () => {
  it("excludes browser-first paths from iOS Universal Links before the wildcard fallback", () => {
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
      "/": "/embed",
      exclude: true,
    });
    expect(components[2]).toMatchObject({
      "/": "/embed/*",
      exclude: true,
    });
    expect(components[3]).toMatchObject({
      "/": "/embedded/*",
      exclude: true,
    });
    expect(components[4]).toMatchObject({
      "/": "/",
    });
    expect(components[5]).toMatchObject({
      "/": "/*",
    });
  });

  it("keeps Android App Links scoped away from browser-first paths", () => {
    const manifest = readFileSync(
      resolve("android/app/src/main/AndroidManifest.xml"),
      "utf8"
    );

    expect(manifest).not.toContain(
      '<data android:scheme="https" android:host="pkspot.app" />'
    );
    expect(manifest).not.toMatch(/android:pathPrefix="\/qr(?:\/|")/u);
    expect(manifest).not.toMatch(/android:pathPrefix="\/embed(?:\/|")/u);
    expect(manifest).not.toMatch(/android:pathPrefix="\/embedded(?:\/|")/u);
    expect(manifest).toContain('android:path="/"');
    expect(manifest).toContain('android:pathPrefix="/map"');
    expect(manifest).toContain('android:pathPrefix="/organizations"');
    expect(manifest).toContain('android:pathPrefix="/contact"');
  });

  it('does not open root-local or pkspot.app links with target="_blank"', () => {
    const violations = findSourceFiles(resolve("src/app"))
      .flatMap((file) => findBlankTargetInternalLinks(file));

    expect(violations).toEqual([]);
  });
});

function findSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return findSourceFiles(path);
    }

    if (!path.endsWith(".html") && !path.endsWith(".ts")) {
      return [];
    }

    if (path.endsWith(".spec.ts")) {
      return [];
    }

    return [path];
  });
}

function findBlankTargetInternalLinks(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const anchors = source.matchAll(/<a\b[^>]*>/gimu);
  const violations: string[] = [];

  for (const match of anchors) {
    const anchor = match[0];
    if (!hasBlankTarget(anchor)) {
      continue;
    }

    const href = getAttributeValue(anchor, "href");
    const boundHref =
      getAttributeValue(anchor, "[href]") ??
      getAttributeValue(anchor, "[attr.href]");

    if (
      hasRouterLink(anchor) ||
      isInternalHref(href) ||
      isKnownInternalBoundHref(boundHref)
    ) {
      violations.push(
        `${file}:${lineNumber(source, match.index ?? 0)} ${anchor}`
      );
    }
  }

  return violations;
}

function hasBlankTarget(anchor: string): boolean {
  return /(?:^|\s)(?:\[attr\.)?target\]?\s*=\s*(['"])(?:'_blank'|"_blank"|_blank)\1/iu.test(
    anchor
  );
}

function hasRouterLink(anchor: string): boolean {
  return /(?:^|\s)(?:\[routerLink\]|routerLink)(?:\s|=|>)/iu.test(anchor);
}

function getAttributeValue(anchor: string, attribute: string): string | null {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = anchor.match(
    new RegExp(`(?:^|\\s)${escapedAttribute}\\s*=\\s*(['"])(.*?)\\1`, "iu"),
  );

  return match?.[2] ?? null;
}

function isInternalHref(href: string | null): boolean {
  if (!href) {
    return false;
  }

  return (
    (href.startsWith("/") && !href.startsWith("//")) ||
    /^https?:\/\/(?:www\.)?pkspot\.app(?:[/?#:].*)?$/iu.test(href)
  );
}

function isKnownInternalBoundHref(boundHref: string | null): boolean {
  return !!boundHref && INTERNAL_DYNAMIC_HREF_EXPRESSIONS.some((expression) =>
    boundHref.includes(expression)
  );
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}
