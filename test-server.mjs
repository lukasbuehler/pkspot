/**
 * Simple SSR server for E2E testing.
 * Only serves the 'de' locale (what's built in dev configuration).
 *
 * Usage: node test-server.mjs
 */

import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PORT = 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths to static assets
const browserDistFolder = resolve(__dirname, "./dist/pkspot/browser/de");
const serverDistFolder = resolve(__dirname, "./dist/pkspot/server/de");
const indexServerHtmlPath = join(serverDistFolder, "index.server.html");

// FIX: The build process seems to generate <base href="/de/de/"/> which breaks relative asset loading
// We patch it back to <base href="/de/"/> if confirmed incorrect
if (existsSync(indexServerHtmlPath)) {
  let content = readFileSync(indexServerHtmlPath, "utf-8");
  if (content.includes('<base href="/de/de/"/>')) {
    console.log("Fixing incorrect double base href in index.server.html");
    content = content.replace('<base href="/de/de/"/>', '<base href="/de/"/>');
    writeFileSync(indexServerHtmlPath, content);
  }
}

// Import the de locale server app
const { app: deApp } = await import("./dist/pkspot/server/de/server.mjs");

const server = express();

// Add request logging for debugging
server.use((req, res, next) => {
  if (process.env.DEBUG) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Serve static files for /de (browser assets) BEFORE SSR app
// This ensures fonts, CSS, JS files are served directly
server.use(
  "/de",
  express.static(browserDistFolder, {
    maxAge: "1y",
    index: false, // Don't serve index.html for directory requests
    setHeaders: (res, path) => {
      if (path.endsWith(".woff2")) {
        res.setHeader("Content-Type", "font/woff2");
      } else if (path.endsWith(".woff")) {
        res.setHeader("Content-Type", "font/woff");
      } else if (path.endsWith(".ttf")) {
        res.setHeader("Content-Type", "font/ttf");
      } else if (path.endsWith(".svg")) {
        res.setHeader("Content-Type", "image/svg+xml");
      }
    },
  })
);

// Mount the Angular SSR app at root - it handles /de prefix internally
// The SSR app sets APP_BASE_HREF to /de/ based on its folder name
server.use(deApp());

// Redirect root to /de
server.get("/", (req, res) => {
  res.redirect(302, "/de/");
});

// Error handling
server.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).send("Internal Server Error");
});

const serverInstance = server.listen(PORT, () => {
  console.log(`Test SSR server running at http://localhost:${PORT}`);
  console.log(`Serving 'de' locale only (dev build)`);
  console.log(`Browser assets: ${browserDistFolder}`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  serverInstance.close(() => {
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  serverInstance.close(() => {
    process.exit(0);
  });
});
