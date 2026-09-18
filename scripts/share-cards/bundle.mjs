import { mkdir, copyFile } from 'node:fs/promises';
const target = new URL('../../functions/lib/share-card-assets/', import.meta.url);
await mkdir(target, {recursive:true});
for (const [source, name] of [
  ['src/assets/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf','font.ttf'],
  ['src/assets/brand/pkspot/pkspot_logo_oneline_dark.png','logo.png'],
  ['src/assets/banner_1200x630.png','fallback.png'],
]) await copyFile(new URL(`../../${source}`, import.meta.url), new URL(name,target));
