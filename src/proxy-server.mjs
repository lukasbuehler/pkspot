import path from "node:path";
import express from "express";
import compression from "compression";
import {
  LAST_MODIFIED,
  SUPPORTED_LANGUAGE_CODES as supportedLanguageCodes,
} from "./build-info.mjs";

const defaultLanguage = "en";

const serverExpressApps = {};

for (const lang of supportedLanguageCodes) {
  serverExpressApps[lang] = (await import(`./${lang}/server.mjs`)).app;
  console.log("Loaded server for lang:", lang);
}

function detectLanguage(req, res, next) {
  console.log(JSON.stringify(req.path));

  // Extract the first segment of the path (e.g., "en" from "/en/map")
  const pathSegments = req.path.split("/").filter(Boolean);
  const firstSegment = pathSegments[0];

  // If the first segment is a valid language code, pass control to the next middleware
  if (supportedLanguageCodes.includes(firstSegment)) {
    return next(); // TODO is return needed here?
  }

  // Extract the preferred language from the Accept-Language header
  const acceptLanguage = req.headers["accept-language"];
  let preferredLanguage = defaultLanguage;

  // TODO remove
  // console.log("preferredLanguage is", preferredLanguage);
  // console.log("pathSegments is", pathSegments.join(","));
  // console.log("first segment is", firstSegment);
  // console.log("path is", `${req.path}`);

  if (acceptLanguage) {
    const browserLanguages = acceptLanguage
      .split(",")
      .map((lang) => lang.split(";")[0]);
    const uniqueLanguages = new Set();

    for (const lang of browserLanguages) {
      const baseLang = lang.split("-")[0];
      if (!uniqueLanguages.has(lang)) {
        uniqueLanguages.add(lang); // Add full language code
      }
      if (!uniqueLanguages.has(baseLang)) {
        uniqueLanguages.add(baseLang); // Add base language
      }
    }

    const languages = Array.from(uniqueLanguages);

    preferredLanguage =
      languages.find((lang) => supportedLanguageCodes.includes(lang)) ||
      defaultLanguage;
  }

  const targetUrl =
    req.originalUrl === "/"
      ? `/${preferredLanguage}`
      : `/${preferredLanguage}${req.originalUrl}`;
  return res.redirect(301, targetUrl);
}

function run() {
  const port = process.env.PORT || 8080;
  const server = express();

  server.use(compression());

  // Global caching middleware that sets Cache-Control and Last-Modified,
  // and checks for a conditional GET request.
  server.use((req, res, next) => {
    // Set cache header so browsers revalidate before using the cache.
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("Last-Modified", LAST_MODIFIED);

    // Only apply this logic to GET requests.
    if (req.method === "GET") {
      const ifModifiedSince = req.headers["if-modified-since"];
      if (
        ifModifiedSince &&
        new Date(ifModifiedSince) >= new Date(LAST_MODIFIED)
      ) {
        // Client has the latest version.
        return res.status(304).end();
      }
    }
    next();
  });

  server.get("/assets/*", (req, res) => {
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const assetPath = path.join(__dirname, "../browser/en", req.path);
    console.log(`Serving asset: ${req.path} from ${assetPath}`);

    // Send file with error handling
    res.sendFile(assetPath, (err) => {
      if (err) {
        console.error(`Failed to serve asset ${req.path}:`, err.message);
        res.status(404).send(`Asset not found: ${req.path}`);
      }
    });
  });

  // Handle language-specific asset requests (e.g., /en/assets/*)
  server.get("/:lang/assets/*", (req, res) => {
    const { lang } = req.params;
    if (supportedLanguageCodes.includes(lang)) {
      const __dirname = path.dirname(new URL(import.meta.url).pathname);
      const assetPath = path.join(
        __dirname,
        `../browser/${lang}`,
        req.path.substring(lang.length + 1)
      );
      console.log(
        `Serving language-specific asset: ${req.path} from ${assetPath}`
      );

      res.sendFile(assetPath, (err) => {
        if (err) {
          console.error(
            `Failed to serve language-specific asset ${req.path}:`,
            err.message
          );
          res.status(404).send(`Asset not found: ${req.path}`);
        }
      });
    } else {
      res.status(404).send("Language not supported");
    }
  });

  server.get("/robots.txt", (req, res) => {
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    res.sendFile(path.join(__dirname, "../browser/en/robots.txt"));
  });

  // Handle index.html requests at any path depth - redirect to SSR routes
  server.get("**/index.html", (req, res) => {
    // Remove /index.html from the path to get the directory path
    const pathWithoutIndex = req.path.replace(/\/index\.html$/, "");

    if (pathWithoutIndex === "") {
      // Root index.html -> redirect to root for language detection
      res.redirect(301, "/");
    } else {
      // Check if path starts with a supported language
      const pathSegments = pathWithoutIndex.split("/").filter(Boolean);
      const firstSegment = pathSegments[0];

      if (supportedLanguageCodes.includes(firstSegment)) {
        // Path like "/en/some/path/index.html" -> redirect to "/en/some/path"
        res.redirect(301, pathWithoutIndex);
      } else {
        // Path like "/some/path/index.html" -> redirect to "/some/path" for language detection
        res.redirect(301, pathWithoutIndex || "/");
      }
    }
  });

  // Redirect based on preffered language
  server.get("*", detectLanguage);

  // Mount language specific angular SSR server apps
  for (const lang of supportedLanguageCodes) {
    server.use(`/${lang}`, serverExpressApps[lang]());
  }

  // Catch-all route for unmatched requests
  server.use((req, res) => {
    res.status(404).send("Not Found");
  });

  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();
