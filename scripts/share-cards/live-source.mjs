import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(import.meta.url);
const { projectCard, collections, storageMediaPath } = require('../../functions/lib/functions/src/shareCards/source.js');
const { DEFAULT_STORAGE_BUCKET } = require('../../functions/lib/functions/src/storageBucket.js');
const execute = promisify(execFile);
let token, tokenExpires = 0;
async function cloudRead(url) {
  if (!token || Date.now() >= tokenExpires) {
    try {
      const { stdout } = await execute('gcloud', ['auth', 'print-access-token'], { timeout: 15000 });
      token = stdout.trim(); tokenExpires = Date.now() + 240000;
    } catch { throw new Error('Google Cloud login unavailable. Run gcloud auth login and retry.'); }
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Google Cloud read failed (${response.status}). Check your gcloud login and project access.`);
  return response;
}
export function decodeValue(value) {
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('timestampValue' in value) return { seconds: Date.parse(value.timestampValue) / 1000 };
  if ('integerValue' in value) return Number(value.integerValue);
  return Object.values(value)[0];
}
const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
async function readDocument(collection, id) {
  const response = await cloudRead(`https://firestore.googleapis.com/v1/projects/parkour-base-project/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`);
  return response ? decodeFields((await response.json()).fields ?? {}) : undefined;
}
async function readPhoto(src) {
  const path = storageMediaPath(src, DEFAULT_STORAGE_BUCKET);
  if (!path) return null;
  const resized = path.replace(/(?:_\d+x\d+)?(\.[^.]+)$/, '_800x800$1');
  for (const candidate of new Set([resized, path])) {
    const url = `https://storage.googleapis.com/storage/v1/b/${DEFAULT_STORAGE_BUCKET}/o/${encodeURIComponent(candidate)}`;
    const response = await cloudRead(url);
    if (!response) continue;
    const metadata = await response.json();
    if (Number(metadata.size) > 12 * 1024 * 1024 || !metadata.contentType?.startsWith('image/')) continue;
    const photo = await cloudRead(`${url}?alt=media&generation=${encodeURIComponent(metadata.generation)}`);
    if (photo) return Buffer.from(await photo.arrayBuffer());
  }
  return null;
}
export async function loadLiveSource(kind, id, access = { readDocument, readPhoto }) {
  if (!['spot', 'event', 'community'].includes(kind) || typeof id !== 'string' ||
      !/^[\w:.-]{1,200}$/.test(id) || id === '.' || id === '..') {
    throw new Error('Choose a type and enter a valid entity ID.');
  }
  const source = projectCard(kind, await access.readDocument(collections[kind], id));
  if (!source) throw new Error('Not found or not eligible for a public share card.');
  const photos = (await Promise.all(source.media.map(access.readPhoto))).filter(Boolean);
  return { ...source.input, photos };
}
