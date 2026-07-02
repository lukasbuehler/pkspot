import compression from "compression";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const port = Number(process.env["PORT"] ?? process.env["STORE_SCREENSHOT_SSR_PORT"] ?? 4300);
const locales = (process.env["STORE_SCREENSHOT_SSR_LOCALES"] ?? "en,de,de-CH,it,fr,es,nl")
  .split(",")
  .map((locale) => locale.trim())
  .filter(Boolean);

const server = express();
server.use(compression());

const defaultBrowserDistFolder = findFirstExistingBrowserDistFolder();
server.use(
  "/assets",
  express.static(path.join(defaultBrowserDistFolder, "assets"), {
    index: false,
    maxAge: "1y",
  }),
);
server.use(
  "/media",
  express.static(path.join(defaultBrowserDistFolder, "media"), {
    index: false,
    maxAge: "1y",
  }),
);

for (const locale of locales) {
  const browserDistFolder = path.join(repoRoot, "dist/pkspot/browser", locale);
  const serverBundlePath = path.join(repoRoot, "dist/pkspot/server", locale, "server.mjs");

  if (!existsSync(browserDistFolder) || !existsSync(serverBundlePath)) {
    throw new Error(
      `Missing built locale "${locale}". Run "npm run build:store-screenshots" first.`,
    );
  }

  const { app } = await import(pathToFileURL(serverBundlePath).href);
  server.use(
    `/${locale}`,
    express.static(browserDistFolder, {
      index: false,
      maxAge: "1y",
    }),
  );
  server.use(`/${locale}`, app());
}

server.get("/", (_req, res) => {
  res.redirect(302, "/en/");
});

server.use((error, _req, res, _next) => {
  console.error("[store-screenshots:ssr]", error);
  res.status(500).send("Store screenshot SSR server error");
});

const instance = server.listen(port, "127.0.0.1", () => {
  console.log(`[store-screenshots:ssr] listening on http://127.0.0.1:${port}`);
  console.log(`[store-screenshots:ssr] locales: ${locales.join(", ")}`);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  instance.close(() => process.exit(0));
}

function findFirstExistingBrowserDistFolder() {
  for (const locale of locales) {
    const browserDistFolder = path.join(repoRoot, "dist/pkspot/browser", locale);
    if (existsSync(browserDistFolder)) {
      return browserDistFolder;
    }
  }

  throw new Error('Missing built browser output. Run "npm run build:store-screenshots" first.');
}
