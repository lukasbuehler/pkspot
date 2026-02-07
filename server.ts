import { APP_BASE_HREF } from "@angular/common";
import { CommonEngine } from "@angular/ssr/node";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import bootstrap from "./src/main.server";
import { LOCALE_ID } from "@angular/core";
import { REQUEST, RESPONSE } from "./src/express.token";

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));

  // i18n with SSR: https://github.com/lostium/ssr-i18n-angular17
  const lang = basename(serverDistFolder);
  const langPath = `/${lang}/`;

  const browserDistFolder = resolve(serverDistFolder, `../../browser/${lang}`);
  const indexHtml = join(serverDistFolder, "index.server.html");

  const commonEngine = new CommonEngine();

  server.set("view engine", "html");
  server.set("views", browserDistFolder);

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });

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
        url: `${protocol}://${headers.host}${originalUrl}`,
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
