const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { readFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const sharp = createRequire(resolve('functions/package.json'))('sharp');
const { renderShareCard, shareCardFingerprint } = require('../../functions/lib/functions/src/shareCards/render.js');
const { shouldPrepareShareCard } = require('../../functions/lib/functions/src/shareCards/policy.js');
const assets = { fontFile: resolve('src/assets/fonts/Roboto/Roboto-VariableFont_wdth,wght.ttf') };
const input = { kind:'spot', audience:'public', title:'A <Spot> & friends', subtitle:'Zürich, Switzerland' };
test('all local fixtures produce a real 1200x630 PNG, including long titles', async () => {
  const { fixtures } = await import('./fixtures.mjs');
  for (const fixture of fixtures) {
    const photos = await Promise.all(fixture.photos.map(path => readFile(path)));
    const png = await renderShareCard({...fixture, audience:'public', photos}, assets);
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.format,'png'); assert.equal(metadata.width,1200); assert.equal(metadata.height,630);
  }
});
test('unreadable photos use the designed fallback; restricted data is rejected', async () => {
  const plain = await renderShareCard(input,assets);
  const broken = await renderShareCard({...input,photos:[Buffer.from('broken')]},assets);
  assert.ok(plain.length > 1000); assert.ok(broken.length > 1000);
  await assert.rejects(renderShareCard({...input,audience:'restricted'},assets));
});
test('fingerprints change with text and photo content', () => {
  assert.equal(shareCardFingerprint(input),shareCardFingerprint({...input}));
  assert.notEqual(shareCardFingerprint(input),shareCardFingerprint({...input,title:'Updated'}));
  assert.notEqual(shareCardFingerprint({...input,photos:[Buffer.from('a')]}),shareCardFingerprint({...input,photos:[Buffer.from('b')]}));
});
test('preparation policy gates public eligibility and the two-star boundary', () => {
  const base={kind:'spot',publiclyDiscoverable:true,trigger:'content_changed'};
  for (const rating of [undefined,0,1.99,NaN,Infinity,6]) assert.equal(shouldPrepareShareCard({...base,rating}),false);
  for (const rating of [2,3,5]) assert.equal(shouldPrepareShareCard({...base,rating}),true);
  assert.equal(shouldPrepareShareCard({...base,featured:true}),true);
  assert.equal(shouldPrepareShareCard({...base,trigger:'share_dialog'}),true);
  assert.equal(shouldPrepareShareCard({...base,kind:'event'}),true);
  assert.equal(shouldPrepareShareCard({...base,kind:'page'}),true);
  for(const kind of ['community','profile']) assert.equal(shouldPrepareShareCard({...base,kind}),false);
  for(const kind of ['spot','event','community','profile','page']) assert.equal(shouldPrepareShareCard({...base,kind,publiclyDiscoverable:false,trigger:'share_dialog',rating:5}),false);
});
