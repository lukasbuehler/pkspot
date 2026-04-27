import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  DEFAULT_LOCALE,
  STATIC_PAGES,
  SUPPORTED_LOCALES,
  buildCommunitySitemapEntry,
  buildSitemapXml,
  buildSpotSitemapEntry,
  buildUserSitemapEntry,
} from "../../functions/src/sitemapXml";

describe("sitemapXml", () => {
  it("prefers spot slugs and falls back to the document id", () => {
    expect(
      buildSpotSitemapEntry(
        "spot-imax",
        {
          slug: "imax",
          time_updated: { seconds: 1704067200, nanoseconds: 0 },
        },
        "2026-04-17"
      )
    ).toEqual({
      path: "/map/imax",
      lastmod: "2024-01-01",
      changefreq: "weekly",
      priority: "0.9",
    });

    expect(
      buildSpotSitemapEntry("spot-dame-du-lac", {}, "2026-04-17")
    ).toEqual({
      path: "/map/spot-dame-du-lac",
      lastmod: "2026-04-17",
      changefreq: "weekly",
      priority: "0.8",
    });
  });

  it("uses the canonical community path ahead of the preferred slug fallback", () => {
    expect(
      buildCommunitySitemapEntry(
        {
          canonicalPath: "/map/community/lausanne",
          preferredSlug: "lausanne-old",
          scope: "locality",
          sourceMaxUpdatedAt: { seconds: 1706745600, nanoseconds: 0 },
        },
        "2026-04-17"
      )
    ).toEqual({
      path: "/map/community/lausanne",
      lastmod: "2024-02-01",
      changefreq: "weekly",
      priority: "0.7",
    });

    expect(
      buildCommunitySitemapEntry(
        {
          preferredSlug: "switzerland",
          scope: "country",
        },
        "2026-04-17"
      )
    ).toEqual({
      path: "/map/community/switzerland",
      lastmod: "2026-04-17",
      changefreq: "weekly",
      priority: "0.8",
    });

    expect(
      buildCommunitySitemapEntry(
        {
          canonicalPath: "/map/community/draft-page",
          published: false,
        },
        "2026-04-17"
      )
    ).toBeNull();
  });

  it("only includes public user profiles in sitemap entries", () => {
    expect(
      buildUserSitemapEntry(
        "lukas",
        { display_name: "Lukas" },
        "2026-04-17"
      )
    ).toEqual({
      path: "/u/lukas",
      lastmod: "2026-04-17",
      changefreq: "weekly",
      priority: "0.6",
    });

    expect(
      buildUserSitemapEntry(
        "private-user",
        { display_name: "   " },
        "2026-04-17"
      )
    ).toBeNull();
  });

  it("builds sitemap XML with spot, profile, and community URLs using preferred paths", () => {
    const { xml, stats } = buildSitemapXml({
      now: "2026-04-17",
      spots: [
        {
          id: "spot-imax",
          data: {
            slug: "imax",
            time_updated: { seconds: 1704067200, nanoseconds: 0 },
          },
        },
        {
          id: "spot-dame-du-lac",
          data: {
            slug: "dame-du-lac",
          },
        },
      ],
      users: [
        {
          id: "lukas",
          data: { display_name: "Lukas" },
        },
        {
          id: "private-user",
          data: { display_name: "" },
        },
      ],
      communities: [
        {
          id: "lausanne",
          data: {
            canonicalPath: "/map/community/lausanne",
            preferredSlug: "lausanne-old",
            scope: "locality",
            sourceMaxUpdatedAt: { seconds: 1706745600, nanoseconds: 0 },
          },
        },
        {
          id: "switzerland",
          data: {
            preferredSlug: "switzerland",
            scope: "country",
          },
        },
      ],
    });

    expect(xml).toContain(`${BASE_URL}/en/map/imax`);
    expect(xml).toContain(`${BASE_URL}/de-CH/map/dame-du-lac`);
    expect(xml).toContain(`${BASE_URL}/en/u/lukas`);
    expect(xml).not.toContain(`${BASE_URL}/en/u/private-user`);
    expect(xml).toContain(`${BASE_URL}/en/map/community/lausanne`);
    expect(xml).not.toContain(`${BASE_URL}/en/map/community/lausanne-old`);
    expect(xml).toContain(`${BASE_URL}/en/map/community/switzerland`);

    expect(xml).toContain(
      `<loc>${BASE_URL}/${DEFAULT_LOCALE}/map/imax</loc>\n    <lastmod>2024-01-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>`
    );
    expect(xml).toContain(
      `<loc>${BASE_URL}/${DEFAULT_LOCALE}/u/lukas</loc>\n    <lastmod>2026-04-17</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>`
    );
    expect(xml).toContain(
      `<loc>${BASE_URL}/${DEFAULT_LOCALE}/map/community/lausanne</loc>\n    <lastmod>2024-02-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>`
    );
    expect(xml).toContain(
      `hreflang="x-default" href="${BASE_URL}/${DEFAULT_LOCALE}/map/imax"`
    );

    expect(stats).toEqual({
      staticPageCount: STATIC_PAGES.length,
      spotCount: 2,
      userCount: 1,
      communityCount: 2,
      slugCount: 2,
      totalUrls: (STATIC_PAGES.length + 2 + 1 + 2) * SUPPORTED_LOCALES.length,
    });
  });
});
