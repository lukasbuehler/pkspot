import { DOCUMENT } from "@angular/common";
import { LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Meta, Title } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetaTagService } from "./meta-tag.service";
import { User } from "../../db/models/User";

const createDocumentMetaMock = (doc: Document) => ({
  updateTag: vi.fn(
    (definition: {
      name?: string;
      property?: string;
      content?: string;
    }): HTMLMetaElement => {
      const selector = definition.name
        ? `meta[name="${definition.name}"]`
        : `meta[property="${definition.property}"]`;
      let element = doc.head.querySelector(selector) as HTMLMetaElement | null;

      if (!element) {
        element = doc.createElement("meta");
        if (definition.name) element.setAttribute("name", definition.name);
        if (definition.property) {
          element.setAttribute("property", definition.property);
        }
        doc.head.appendChild(element);
      }

      element.setAttribute("content", definition.content ?? "");
      return element;
    },
  ),
});

const metaContent = (doc: Document, selector: string): string | null =>
  doc.head.querySelector(selector)?.getAttribute("content") ?? null;

const linkHref = (doc: Document, selector: string): string | null =>
  doc.head.querySelector(selector)?.getAttribute("href") ?? null;

describe("MetaTagService", () => {
  let doc: Document;
  let title: { setTitle: ReturnType<typeof vi.fn> };
  let service: MetaTagService;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument("PK Spot");
    title = { setTitle: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        MetaTagService,
        { provide: DOCUMENT, useValue: doc },
        { provide: Meta, useValue: createDocumentMetaMock(doc) },
        { provide: Title, useValue: title },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    service = TestBed.inject(MetaTagService);
  });

  it("sets complete crawler metadata for event detail pages", () => {
    service.setEventMetaTags(
      {
        name: "Swiss Jam 2026",
        image: "assets/swissjam/swissjam0.jpg",
        description: "Event in Zurich, Switzerland.",
      },
      "/events/swissjam26",
    );

    expect(title.setTitle).toHaveBeenCalledWith("Swiss Jam 2026 | PK Spot");
    expect(metaContent(doc, 'meta[property="og:title"]')).toBe(
      "Swiss Jam 2026 | PK Spot",
    );
    expect(metaContent(doc, 'meta[name="twitter:title"]')).toBe(
      "Swiss Jam 2026 | PK Spot",
    );
    expect(metaContent(doc, 'meta[name="description"]')).toBe(
      "Event in Zurich, Switzerland.",
    );
    expect(metaContent(doc, 'meta[property="og:description"]')).toBe(
      "Event in Zurich, Switzerland.",
    );
    expect(metaContent(doc, 'meta[property="og:image"]')).toBe(
      "https://pkspot.app/assets/swissjam/swissjam0.jpg",
    );
    expect(metaContent(doc, 'meta[name="twitter:image"]')).toBe(
      "https://pkspot.app/assets/swissjam/swissjam0.jpg",
    );
    expect(metaContent(doc, 'meta[property="og:url"]')).toBe(
      "https://pkspot.app/en/events/swissjam26",
    );
    expect(linkHref(doc, 'link[rel="canonical"]')).toBe(
      "https://pkspot.app/en/events/swissjam26",
    );
    expect(linkHref(doc, 'link[rel="alternate"][hreflang="de-CH"]')).toBe(
      "https://pkspot.app/de-CH/events/swissjam26",
    );
    expect(linkHref(doc, 'link[rel="alternate"][hreflang="x-default"]')).toBe(
      "https://pkspot.app/en/events/swissjam26",
    );
  });

  it("replaces stale canonical and hreflang tags when reused components change pages", () => {
    service.setEventMetaTags(
      { name: "Swiss Jam 2025" },
      "/events/swissjam25",
    );
    service.setEventMetaTags(
      { name: "Swiss Jam 2026" },
      "/events/swissjam26",
    );

    expect(doc.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(doc.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(8);
    expect(metaContent(doc, 'meta[property="og:url"]')).toBe(
      "https://pkspot.app/en/events/swissjam26",
    );
    expect(linkHref(doc, 'link[rel="canonical"]')).toBe(
      "https://pkspot.app/en/events/swissjam26",
    );
  });

  it("marks user profile pages as noindex", () => {
    service.setUserMetaTags(
      new User("user-1", { display_name: "Avery" }),
      "/u/user-1",
    );

    expect(metaContent(doc, 'meta[name="robots"]')).toBe("noindex,follow");
    expect(linkHref(doc, 'link[rel="canonical"]')).toBe(
      "https://pkspot.app/en/u/user-1",
    );
  });
});
