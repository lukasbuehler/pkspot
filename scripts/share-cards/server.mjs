import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fixtures } from './fixtures.mjs';
const require = createRequire(import.meta.url);
const { renderShareCard, shareCardFingerprint } = require('../../functions/lib/functions/src/shareCards/render.js');
const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = {
  fontFile: resolve(root, 'src/assets/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf'),
  logo: await readFile(resolve(root, 'src/assets/brand/pkspot/pkspot_logo_oneline_dark.png')),
};
const loaded = await Promise.all(fixtures.map(async fixture => ({ ...fixture, audience: 'public',
  photos: await Promise.all(fixture.photos.map(path => readFile(resolve(root, path)))) })));
const staticFiles = { '/': ['index.html', 'text/html'], '/lab.js': ['lab.js', 'text/javascript'], '/lab.css': ['lab.css', 'text/css'] };
const port = Number(process.env.SHARE_CARD_PORT || 4318);
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (request.method === 'GET' && staticFiles[url.pathname]) {
      const [file, type] = staticFiles[url.pathname];
      response.setHeader('Content-Type', `${type}; charset=utf-8`);
      return response.end(await readFile(new URL(file, import.meta.url)));
    }
    if (request.method === 'GET' && url.pathname === '/fixtures') {
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify(fixtures.map(({ photos, ...fixture }) => ({ ...fixture, photoCount: photos.length }))));
    }
    if (request.method === 'POST' && url.pathname === '/render') {
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
        response.writeHead(403); return response.end('Local origin required');
      }
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) { response.writeHead(413); return response.end('Input too large'); }
      }
      const data = JSON.parse(body);
      const fixture = loaded.find(item => item.id === data.fixture);
      if (!fixture) throw new Error('Choose a fixture');
      const input = { ...fixture, photos: fixture.photos.slice(0, Math.max(0, Math.min(3, Number(data.photoCount) || 0))) };
      for (const field of ['title', 'subtitle', 'detail']) {
        if (typeof data[field] !== 'string') throw new Error('Text fields must be strings');
        input[field] = data[field];
      }
      const png = await renderShareCard(input, assets);
      response.setHeader('Content-Type', 'image/png');
      response.setHeader('X-Card-Fingerprint', shareCardFingerprint(input));
      return response.end(png);
    }
    response.writeHead(404); response.end('Not found');
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'text/plain' });
    response.end(error instanceof Error ? error.message : 'Unable to render card');
  }
}).listen(port, '127.0.0.1', () => console.log(`Share card lab: http://127.0.0.1:${port}`));
