import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { once } from "node:events";
import type { Writable } from "node:stream";

const BASE_URL = "https://pkspot.app";
const BUCKET_NAME = "parkour-base-project.appspot.com";
const XML_BUFFER_TARGET_BYTES = 64 * 1024;

// Supported languages - must match your Angular i18n setup
const SUPPORTED_LOCALES = ["en", "de", "de-CH", "fr", "it", "es", "nl"];
const DEFAULT_LOCALE = "en";

// Static pages from app.routes.ts (excluding redirects, auth-required, and embedded pages)
const STATIC_PAGES = [
  { path: "/map", priority: "1.0", changefreq: "daily" },
  { path: "/events", priority: "0.8", changefreq: "weekly" },
  { path: "/events/swissjam25", priority: "0.7", changefreq: "weekly" },
  { path: "/about", priority: "0.7", changefreq: "monthly" },
  { path: "/support", priority: "0.5", changefreq: "monthly" },
  { path: "/sign-in", priority: "0.5", changefreq: "monthly" },
  { path: "/sign-up", priority: "0.5", changefreq: "monthly" },
  { path: "/forgot-password", priority: "0.3", changefreq: "monthly" },
  { path: "/terms-of-service", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy-policy", priority: "0.3", changefreq: "yearly" },
  { path: "/impressum", priority: "0.3", changefreq: "yearly" },
  { path: "/embed", priority: "0.4", changefreq: "monthly" },
];

interface UserData {
  display_name?: string;
}

interface SpotSitemapData {
  slug?: string;
  time_updated?: { seconds: number; nanoseconds: number };
}

interface CommunitySitemapData {
  canonicalPath?: string;
  preferredSlug?: string;
  published?: boolean;
  scope?: "country" | "region" | "locality";
  generatedAt?: { seconds: number; nanoseconds: number };
  sourceMaxUpdatedAt?: { seconds: number; nanoseconds: number };
}

interface SitemapGenerationStats {
  spotCount: number;
  userCount: number;
  communityCount: number;
  slugCount: number;
  staticPageCount: number;
  totalUrls: number;
}

class BufferedXmlWriter {
  private buffer = "";

  constructor(private readonly writeStream: Writable) {}

  async append(chunk: string): Promise<void> {
    this.buffer += chunk;
    if (this.buffer.length >= XML_BUFFER_TARGET_BYTES) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.buffer) {
      return;
    }

    if (!this.writeStream.write(this.buffer)) {
      await once(this.writeStream, "drain");
    }
    this.buffer = "";
  }
}

function buildSitemapHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;
}

/**
 * Generates a URL entry with hreflang annotations for all supported locales
 */
function generateUrlWithHreflang(
  path: string,
  lastmod: string,
  changefreq: string,
  priority: string
): string {
  let xml = "";

  // Generate one <url> entry per locale
  for (const locale of SUPPORTED_LOCALES) {
    const fullUrl = `${BASE_URL}/${locale}${path}`;

    xml += `  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
`;

    // Add hreflang links to all alternate language versions
    for (const altLocale of SUPPORTED_LOCALES) {
      const altUrl = `${BASE_URL}/${altLocale}${path}`;
      const hreflangCode = getHreflangCode(altLocale);
      xml += `    <xhtml:link rel="alternate" hreflang="${hreflangCode}" href="${altUrl}"/>
`;
    }

    // Add x-default pointing to the default locale
    xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}/${DEFAULT_LOCALE}${path}"/>
`;

    xml += `  </url>
`;
  }

  return xml;
}

/**
 * Converts locale code to hreflang format
 * e.g., "de-CH" stays "de-CH", "en" stays "en"
 */
function getHreflangCode(locale: string): string {
  // hreflang uses lowercase language, uppercase region
  // e.g., "de-CH" is correct, "de-ch" is not
  return locale;
}

function getNowDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function getLastModDate(
  timeUpdated:
    | SpotSitemapData["time_updated"]
    | CommunitySitemapData["generatedAt"]
    | CommunitySitemapData["sourceMaxUpdatedAt"],
  fallbackDate: string
): string {
  if (!timeUpdated?.seconds) {
    return fallbackDate;
  }

  return new Date(timeUpdated.seconds * 1000).toISOString().split("T")[0];
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Streams spots and users from Firestore and streams sitemap XML to Storage.
 */
async function _generateAndUploadSitemap(): Promise<{
  success: boolean;
  spotCount: number;
  userCount: number;
  communityCount: number;
  staticPageCount: number;
  totalUrls: number;
  slugCount: number;
  url: string;
}> {
  const db = admin.firestore();
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file("sitemap.xml");
  const now = getNowDateString();

  const writeStream = file.createWriteStream({
    resumable: false,
    metadata: {
      contentType: "application/xml",
      cacheControl: "public, max-age=86400", // Cache for 24 hours
    },
  });
  const writer = new BufferedXmlWriter(writeStream);

  const uploadCompletePromise = new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  let spotCount = 0;
  let userCount = 0;
  let communityCount = 0;
  let slugCount = 0;

  try {
    await writer.append(buildSitemapHeader());

    for (const page of STATIC_PAGES) {
      await writer.append(
        generateUrlWithHreflang(page.path, now, page.changefreq, page.priority)
      );
    }

    console.log("Streaming spots from Firestore...");
    const spotsStream = db
      .collection("spots")
      .select("slug", "time_updated")
      .stream();

    for await (const doc of spotsStream as AsyncIterable<FirebaseFirestore.QueryDocumentSnapshot>) {
      const data = doc.data() as SpotSitemapData;
      const slug = data.slug?.trim();
      const path = slug
        ? `/map/${encodeURIComponent(slug)}`
        : `/map/${encodeURIComponent(doc.id)}`;

      if (slug) {
        slugCount += 1;
      }

      spotCount += 1;
      const lastmod = getLastModDate(data.time_updated, now);
      const priority = slug ? "0.9" : "0.8";
      await writer.append(generateUrlWithHreflang(path, lastmod, "weekly", priority));
    }

    console.log(`Streamed ${spotCount} spots`);

    console.log("Streaming users from Firestore...");
    const usersStream = db.collection("users").select("display_name").stream();
    for await (const doc of usersStream as AsyncIterable<FirebaseFirestore.QueryDocumentSnapshot>) {
      const data = doc.data() as UserData;
      if (!data.display_name) {
        continue;
      }

      userCount += 1;
      await writer.append(
        generateUrlWithHreflang(`/u/${encodeURIComponent(doc.id)}`, now, "weekly", "0.6")
      );
    }
    console.log(`Streamed ${userCount} users with public profiles`);

    console.log("Streaming communities from Firestore...");
    const communitiesStream = db
      .collection("community_pages")
      .select(
        "canonicalPath",
        "preferredSlug",
        "published",
        "scope",
        "generatedAt",
        "sourceMaxUpdatedAt"
      )
      .stream();

    for await (const doc of communitiesStream as AsyncIterable<FirebaseFirestore.QueryDocumentSnapshot>) {
      const data = doc.data() as CommunitySitemapData;
      if (data.published === false) {
        continue;
      }

      const path =
        data.canonicalPath?.trim() ||
        (data.preferredSlug
          ? `/map/community/${encodeURIComponent(data.preferredSlug)}`
          : "");

      if (!path) {
        continue;
      }

      communityCount += 1;
      const lastmod = getLastModDate(
        data.sourceMaxUpdatedAt ?? data.generatedAt,
        now
      );
      const priority =
        data.scope === "country"
          ? "0.8"
          : data.scope === "region"
          ? "0.75"
          : "0.7";
      await writer.append(
        generateUrlWithHreflang(path, lastmod, "weekly", priority)
      );
    }
    console.log(`Streamed ${communityCount} published communities`);

    await writer.append("</urlset>");
    await writer.flush();
    writeStream.end();
    await uploadCompletePromise;
  } catch (error) {
    writeStream.destroy(toError(error));
    await uploadCompletePromise.catch(() => undefined);
    throw error;
  }

  // Make the file publicly accessible
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/sitemap.xml`;
  const stats: SitemapGenerationStats = {
    spotCount,
    userCount,
    communityCount,
    slugCount,
    staticPageCount: STATIC_PAGES.length,
    totalUrls:
      (STATIC_PAGES.length + spotCount + userCount + communityCount) *
      SUPPORTED_LOCALES.length,
  };

  console.log(`Sitemap uploaded successfully to ${publicUrl}`);
  console.log(
    `Total URLs in sitemap: ${stats.totalUrls} (${stats.staticPageCount} static + ` +
      `${stats.spotCount} spots (${stats.slugCount} with slugs) + ${stats.userCount} users + ` +
      `${stats.communityCount} communities) × ` +
      `${SUPPORTED_LOCALES.length} locales`
  );

  return {
    success: true,
    spotCount: stats.spotCount,
    userCount: stats.userCount,
    communityCount: stats.communityCount,
    staticPageCount: stats.staticPageCount,
    slugCount: stats.slugCount,
    totalUrls: stats.totalUrls,
    url: publicUrl,
  };
}

/**
 * Scheduled function to regenerate sitemap nightly at 3 AM UTC
 */
export const generateSitemapOnSchedule = onSchedule(
  {
    schedule: "0 3 * * *", // Every day at 3:00 AM UTC
    timeZone: "UTC",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    console.log("Starting scheduled sitemap generation...");
    const result = await _generateAndUploadSitemap();
    console.log(
      `Sitemap generation complete. ${result.totalUrls} URLs indexed ` +
        `(${result.staticPageCount} static pages, ${result.spotCount} spots, ${result.userCount} users, ` +
        `${result.communityCount} communities).`
    );
  }
);

/**
 * HTTP endpoint to manually trigger sitemap generation (for testing/debugging)
 * Call: https://europe-west1-parkour-base-project.cloudfunctions.net/generateSitemapManual
 */
export const generateSitemapManual = onRequest(
  {
    region: "europe-west1",
    cors: false,
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async (_req, res) => {
    try {
      console.log("Manual sitemap generation triggered...");
      const result = await _generateAndUploadSitemap();
      res.json(result);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).json({ error: "Failed to generate sitemap" });
    }
  }
);
