import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { installSceneFixtures } from './fixtures.mjs';

const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));

test('all scenes have localized copy and a configured capture', async () => {
  assert.equal(new Set(config.scenes.map(scene => scene.index)).size, config.scenes.length);
  assert.equal(config.scenes.at(-1).id, 'training');
  for (const locale of config.locales) {
    const copy = JSON.parse(await readFile(new URL(`./locales/${locale.id}.json`, import.meta.url), 'utf8'));
    for (const scene of config.scenes) {
      assert.ok(copy[scene.copyKey]?.title.trim(), `${locale.id}/${scene.id} title`);
      assert.ok(copy[scene.copyKey]?.subtitle.trim(), `${locale.id}/${scene.id} subtitle`);
      assert.ok(config.captures.some(capture => capture.id === scene.capture));
    }
    assert.equal(copy.trainingNotes.length, 3);
  }
});

test('training fixtures stay private, localized and relative to the fixed clock', async () => {
  let globals;
  const page = { addInitScript: async (_callback, seeds) => { globals = seeds; } };
  const fixedTime = '2026-10-01T11:37:00.000Z';
  const copy = { trainingNotes: ['First note', 'Second note', 'Third note'] };
  await installSceneFixtures(page, { fixture: 'training' }, copy, { ...config, fixedTime });
  const sessions = globals.__PKSPOT_SCREENSHOT_TRAINING_SESSIONS__;
  const entries = globals.__PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__;
  assert.equal(sessions.length, 7);
  assert.equal(entries.length, sessions.length);
  assert.equal(new Date(sessions[0].started_at_raw_ms).toISOString(), '2026-09-29T15:00:00.000Z');
  entries.forEach((entry, index) => {
    assert.equal(entry.owner_id, config.mockAuthUser.uid);
    assert.equal(entry.visibility, 'private');
    assert.equal(entry.note, copy.trainingNotes[index % 3]);
    assert.deepEqual(entry.session_record_ids, [sessions[index].id]);
    assert.ok(entry.activity_at_raw_ms < Date.parse(fixedTime));
  });
});

test('ordinary scenes do not seed training history', async () => {
  let globals;
  const page = { addInitScript: async (_callback, seeds) => { globals = seeds; } };
  await installSceneFixtures(page, {}, {}, config);
  assert.equal(globals.__PKSPOT_SCREENSHOT_TRAINING_SESSIONS__, undefined);
  assert.equal(globals.__PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__, true);
});
