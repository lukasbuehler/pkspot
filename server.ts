import { APP_BASE_HREF } from "@angular/common";
import { CommonEngine } from "@angular/ssr/node";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import bootstrap from "./src/main.server";
import { LOCALE_ID } from "@angular/core";
import { REQUEST, RESPONSE } from "./src/express.token";
import { getLegacySsrRedirectTarget } from "./src/server-redirects";

function getAllowedHosts(): string[] {
  const defaultHosts = ["localhost", "127.0.0.1", "[::1]"];
  const configuredHosts = (process.env["NG_ALLOWED_HOSTS"] ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);

  return [...new Set([...defaultHosts, ...configuredHosts])];
}

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  server.set("trust proxy", 1);
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));

  // i18n with SSR: https://github.com/lostium/ssr-i18n-angular17
  const lang = basename(serverDistFolder);
  const langPath = `/${lang}/`;

  const browserDistFolder = resolve(serverDistFolder, `../../browser/${lang}`);
  const indexHtml = join(serverDistFolder, "index.server.html");

  const commonEngine = new CommonEngine({
    allowedHosts: getAllowedHosts(),
  });

  server.set("view engine", "html");
  server.set("views", browserDistFolder);

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });

  // SEO: server-side 301s for legacy content URLs. Angular route redirects
  // clean up client navigation, but crawlers need real HTTP 301 responses.
  server.get("*", (req, res, next) => {
    const target = getLegacySsrRedirectTarget(req.originalUrl);
    if (target) {
      res.redirect(301, target);
      return;
    }
    next();
  });

  // Serve static files from /browser
  server.get(
    "*.*",
    express.static(browserDistFolder, {
      maxAge: "1y",
    })
  );

  // All regular routes use the Angular engine
  server.get("*", (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${req.hostname}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [
          { provide: APP_BASE_HREF, useValue: langPath },
          { provide: LOCALE_ID, useValue: lang },
          { provide: RESPONSE, useValue: res },
          { provide: REQUEST, useValue: req },
        ],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
  });

  return server;
}
