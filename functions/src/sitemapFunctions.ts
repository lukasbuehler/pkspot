import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { PartialSpotSchema, getSpotName } from "./spotHelpers";

const BASE_URL = "https://pkspot.app";
const BUCKET_NAME = "parkour-base-project.appspot.com";

// Supported languages - must match your Angular i18n setup
const SUPPORTED_LOCALES = ["en", "de", "de-CH", "fr", "it", "es", "nl"];
const DEFAULT_LOCALE = "en";

// Static pages from app.routes.ts (excluding redirects, auth-required, and embedded pages)
const STATIC_PAGES = [
  { path: "/map", priority: "1.0", changefreq: "daily" },
  { path: "/events", priority: "0.8", changefreq: "weekly" },
  { path: "/events/swissjam25", priority: "0.7", changefreq: "weekly" },
  { path: "/about", priority: "0.7", changefreq: "monthly" },
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
  profile_picture?: string;
}

/**
 * Generates XML sitemap content with hreflang annotations for multilingual support
 */
function generateSitemapXml(
  spots: { id: string; slug?: string; data: PartialSpotSchema }[],
  users: { id: string; data: UserData }[]
): string {
  const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

  // Add static pages with hreflang
  for (const page of STATIC_PAGES) {
    xml += generateUrlWithHreflang(
      page.path,
      now,
      page.changefreq,
      page.priority
    );
  }

  // Add spot pages with hreflang
  for (const spot of spots) {
    const spotPath = spot.slug || spot.id;
    const path = `/map/${encodeURIComponent(spotPath)}`;

    // Get the spot's last update time if available, otherwise use now
    const lastmod = spot.data.time_updated
      ? new Date(spot.data.time_updated.seconds * 1000)
          .toISOString()
          .split("T")[0]
      : now;

    // Get image info for this spot
    let imageXml = "";
    if (spot.data.media && spot.data.media.length > 0) {
      const firstImage = spot.data.media[0];
      if (firstImage.type === "image" && firstImage.src) {
        const spotName = getSpotName(spot.data, "en");
        imageXml = `
    <image:image>
      <image:loc>${escapeXml(firstImage.src)}</image:loc>
      <image:title>${escapeXml(spotName)}</image:title>
    </image:image>`;
      }
    }

    xml += generateUrlWithHreflang(path, lastmod, "weekly", "0.8", imageXml);
  }

  // Add user profile pages with hreflang
  for (const user of users) {
    const path = `/u/${user.id}`;

    // Get image info for this user
    let imageXml = "";
    if (user.data.profile_picture) {
      const userName = user.data.display_name || "User";
      imageXml = `
    <image:image>
      <image:loc>${escapeXml(user.data.profile_picture)}</image:loc>
      <image:title>${escapeXml(userName)}</image:title>
    </image:image>`;
    }

    xml += generateUrlWithHreflang(path, now, "weekly", "0.6", imageXml);
  }

  xml += `</urlset>`;
  return xml;
}

/**
 * Generates a URL entry with hreflang annotations for all supported locales
 */
function generateUrlWithHreflang(
  path: string,
  lastmod: string,
  changefreq: string,
  priority: string,
  additionalXml: string = ""
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
      // Use language code only for hreflang (e.g., "de" not "de-CH")
      const hreflangCode = getHreflangCode(altLocale);
      xml += `    <xhtml:link rel="alternate" hreflang="${hreflangCode}" href="${altUrl}"/>
`;
    }

    // Add x-default pointing to the default locale
    xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}/${DEFAULT_LOCALE}${path}"/>
`;

    // Add any additional XML (like images)
    if (additionalXml) {
      xml += additionalXml;
    }

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

/**
 * Escapes special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Fetches all spots and users from Firestore and generates sitemap
 */
async function _generateAndUploadSitemap(): Promise<{
  success: boolean;
  spotCount: number;
  userCount: number;
  staticPageCount: number;
  totalUrls: number;
  url: string;
}> {
  const db = admin.firestore();
  const storage = getStorage();
  const bucket = storage.bucket(BUCKET_NAME);

  console.log("Fetching all spots from Firestore...");

  // Fetch all spots
  const spotsSnapshot = await db.collection("spots").get();
  const spots: { id: string; slug?: string; data: PartialSpotSchema }[] = [];

  spotsSnapshot.forEach((doc) => {
    const data = doc.data() as PartialSpotSchema;
    spots.push({
      id: doc.id,
      slug: data.slug,
      data: data,
    });
  });

  console.log(`Fetched ${spots.length} spots`);

  // Fetch all users (only public profiles with display names)
  console.log("Fetching all users from Firestore...");
  const usersSnapshot = await db.collection("users").get();
  const users: { id: string; data: UserData }[] = [];

  usersSnapshot.forEach((doc) => {
    const data = doc.data() as UserData;
    // Only include users with display names (public profiles)
    if (data.display_name) {
      users.push({
        id: doc.id,
        data: data,
      });
    }
  });

  console.log(`Fetched ${users.length} users with public profiles`);

  // Generate sitemap XML
  const sitemapXml = generateSitemapXml(spots, users);

  // Upload to Firebase Storage with public access
  const file = bucket.file("sitemap.xml");

  await file.save(sitemapXml, {
    metadata: {
      contentType: "application/xml",
      cacheControl: "public, max-age=86400", // Cache for 24 hours
    },
  });

  // Make the file publicly accessible
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/sitemap.xml`;

  // Calculate total URLs (each page × number of locales)
  const totalUrls =
    (STATIC_PAGES.length + spots.length + users.length) *
    SUPPORTED_LOCALES.length;

  console.log(`Sitemap uploaded successfully to ${publicUrl}`);
  console.log(
    `Total URLs in sitemap: ${totalUrls} (${STATIC_PAGES.length} static + ${spots.length} spots + ${users.length} users) × ${SUPPORTED_LOCALES.length} locales`
  );

  return {
    success: true,
    spotCount: spots.length,
    userCount: users.length,
    staticPageCount: STATIC_PAGES.length,
    totalUrls: totalUrls,
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
  },
  async () => {
    console.log("Starting scheduled sitemap generation...");
    const result = await _generateAndUploadSitemap();
    console.log(
      `Sitemap generation complete. ${result.totalUrls} URLs indexed ` +
        `(${result.staticPageCount} static pages, ${result.spotCount} spots, ${result.userCount} users).`
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
  },
  async (req, res) => {
    // Optional: Add authentication check here
    // if (req.headers.authorization !== 'your-secret-key') {
    //   res.status(403).send('Unauthorized');
    //   return;
    // }

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
