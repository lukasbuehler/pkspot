import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("index social meta tags", () => {
  const indexHtml = readFileSync(join(process.cwd(), "src/index.html"), "utf8");

  it("keeps crawler-visible share card tags as literal copy", () => {
    const document = new DOMParser().parseFromString(indexHtml, "text/html");
    const socialSelectors = [
      "title",
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
    ];

    for (const selector of socialSelectors) {
      const element = document.querySelector(selector);
      expect(element, selector).toBeTruthy();

      const visibleValue =
        element?.tagName.toLowerCase() === "title"
          ? element.textContent
          : element?.getAttribute("content");

      expect(visibleValue, selector).toBeTruthy();
      expect(visibleValue, selector).not.toContain("@@");
      expect(element?.hasAttribute("i18n"), selector).toBe(false);
      expect(element?.hasAttribute("i18n-content"), selector).toBe(false);
    }
  });
});
