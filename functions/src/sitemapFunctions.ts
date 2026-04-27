import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { once } from "node:events";
import type { Writable } from "node:stream";
import {
  STATIC_PAGES,
  SUPPORTED_LOCALES,
  buildCommunitySitemapEntry,
  buildSitemapHeader,
  buildSpotSitemapEntry,
  buildUserSitemapEntry,
  generateUrlWithHreflang,
  getNowDateString,
  type CommunitySitemapData,
  type SitemapGenerationStats,
  type SpotSitemapData,
  type UserSitemapData,
} from "./sitemapXml";

const BUCKET_NAME = "parkour-base-project.appspot.com";
const XML_BUFFER_TARGET_BYTES = 64 * 1024;

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
      const entry = buildSpotSitemapEntry(doc.id, data, now);
      const slug = data.slug?.trim();

      if (slug) {
        slugCount += 1;
      }

      spotCount += 1;
      await writer.append(
        generateUrlWithHreflang(
          entry.path,
          entry.lastmod,
          entry.changefreq,
          entry.priority
        )
      );
    }

    console.log(`Streamed ${spotCount} spots`);

    console.log("Streaming users from Firestore...");
    const usersStream = db.collection("users").select("display_name").stream();
    for await (const doc of usersStream as AsyncIterable<FirebaseFirestore.QueryDocumentSnapshot>) {
      const data = doc.data() as UserSitemapData;
      const entry = buildUserSitemapEntry(doc.id, data, now);
      if (!entry) {
        continue;
      }

      userCount += 1;
      await writer.append(
        generateUrlWithHreflang(
          entry.path,
          entry.lastmod,
          entry.changefreq,
          entry.priority
        )
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
      const entry = buildCommunitySitemapEntry(data, now);
      if (!entry) {
        continue;
      }

      communityCount += 1;
      await writer.append(
        generateUrlWithHreflang(
          entry.path,
          entry.lastmod,
          entry.changefreq,
          entry.priority
        )
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
