import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fallbackCard } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const { renderShareCard } = require('../../functions/lib/functions/src/shareCards/render.js');
const asset = path => new URL(`../../src/assets/${path}`, import.meta.url);
// Generate explicitly during design work, never on a page/image request.
// Keep the existing URL so all current metadata and backend bundles use it.
const image = await renderShareCard({ ...fallbackCard, audience: 'public' }, {
  fontFile: fileURLToPath(asset('fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf')),
  icon: await readFile(asset('icons/android-chrome-512x512.png')),
  logo: await readFile(asset('brand/pkspot/pkspot_logo_oneline_dark.png')),
});
await writeFile(asset('banner_1200x630.png'), image);
console.log('Generated src/assets/banner_1200x630.png (1200 × 630)');
