import { describe, expect, it } from "vitest";
import { buildUnembeddedUrlFromHref } from "./embedded-url";

describe("buildUnembeddedUrlFromHref", () => {
  it("removes embedded path segment and embed-only header query", () => {
    expect(
      buildUnembeddedUrlFromHref(
        "https://pkspot.app/en/embedded/events/swissjam26?showHeader=false"
      )
    ).toBe(
      "https://pkspot.app/en/events/swissjam26?utm_source=pkspot_embed&utm_medium=embed_cta&utm_campaign=open_on_pkspot&utm_content=bottom_banner"
    );
  });

  it("preserves existing event parameters while replacing CTA attribution", () => {
    expect(
      buildUnembeddedUrlFromHref(
        "https://pkspot.app/embedded/events/wpf-camp/map?foo=bar&utm_source=old#spots"
      )
    ).toBe(
      "https://pkspot.app/events/wpf-camp/map?foo=bar&utm_source=pkspot_embed&utm_medium=embed_cta&utm_campaign=open_on_pkspot&utm_content=bottom_banner#spots"
    );
  });

  it("matches showHeader case-insensitively", () => {
    expect(
      buildUnembeddedUrlFromHref(
        "https://pkspot.app/embedded/events/wpf-camp?ShowHeader=true"
      )
    ).toBe(
      "https://pkspot.app/events/wpf-camp?utm_source=pkspot_embed&utm_medium=embed_cta&utm_campaign=open_on_pkspot&utm_content=bottom_banner"
    );
  });

  it("can build a clean attribution link without CTA tracking", () => {
    expect(
      buildUnembeddedUrlFromHref(
        "https://pkspot.app/embedded/events/wpf-camp?showHeader=false",
        { includeEmbedCtaUtm: false },
      ),
    ).toBe("https://pkspot.app/events/wpf-camp");
  });
});
