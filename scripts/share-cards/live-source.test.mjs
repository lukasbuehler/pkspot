import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveSource, decodeValue } from './live-source.mjs';
test('loads a Spot with production projection and eligible photos', async () => {
  const source = await loadLiveSource('spot', 'example', {
    readDocument: async (collection, id) => {
      assert.equal(collection, 'spots'); assert.equal(id, 'example');
      return { name: { en: { text: 'Polyterrasse' } }, rating: 4,
        media: [{ type: 'image', src: 'photo' }, { type: 'image', src: 'reported', isReported: true }] };
    }, readPhoto: async src => { assert.equal(src, 'photo'); return Buffer.from('image'); },
  });
  assert.equal(source.title, 'Polyterrasse'); assert.equal(source.photos.length, 1);
});
test('rejects invalid references before reading', async () => {
  const access = { readDocument: () => { throw new Error('unexpected read'); } };
  for (const [kind, id] of [['spot', '../secret'], ['profile', 'user'], ['event', '..']]) {
    await assert.rejects(loadLiveSource(kind, id, access), /valid entity ID/);
  }
});
test('excludes private events and unpublished communities', async () => {
  for (const kind of ['event', 'community']) {
    await assert.rejects(loadLiveSource(kind, 'example', {
      readDocument: async () => ({ name: 'Private', published: false }),
      readPhoto: () => { throw new Error('unexpected photo'); },
    }), /not eligible/);
  }
});
test('loads published communities without inventing photos', async () => {
  const source = await loadLiveSource('community', 'ch:zurich', {
    readDocument: async collection => {
      assert.equal(collection, 'community_pages');
      return { published: true, displayName: 'Zürich', counts: { totalSpots: 142 } };
    }, readPhoto: () => { throw new Error('unexpected photo'); },
  });
  assert.equal(source.subtitle, '142 Spots'); assert.deepEqual(source.photos, []);
});

test('decodes Firestore timestamps and nested public presentation fields', () => {
  assert.deepEqual(decodeValue({ mapValue: { fields: {
    start: { timestampValue: '2026-09-29T10:00:00Z' },
    rating: { doubleValue: 4.5 },
    media: { arrayValue: { values: [{ stringValue: 'photo' }] } },
  } } }), { start: { seconds: 1790676000 }, rating: 4.5, media: ['photo'] });
});
