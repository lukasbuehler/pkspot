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
test('only public share clicks prepare cards, never content changes', () => {
  for(const kind of ['spot','event','community','profile','page']) {
    assert.equal(shouldPrepareShareCard({kind,publiclyDiscoverable:true,trigger:'share_dialog'}),true);
    assert.equal(shouldPrepareShareCard({kind,publiclyDiscoverable:true,trigger:'content_changed'}),false);
    assert.equal(shouldPrepareShareCard({kind,publiclyDiscoverable:false,trigger:'share_dialog'}),false);
  }
});
test('ratings appear only for rated Spots and reject invalid values', async () => {
  const plain = await renderShareCard(input, assets);
  assert.deepEqual(await renderShareCard({...input,rating:0},assets), plain);
  assert.notDeepEqual(await renderShareCard({...input,rating:4.2},assets), plain);
  const event = {...input,kind:'event'};
  assert.deepEqual(await renderShareCard({...event,rating:4.2},assets), await renderShareCard(event,assets));
  for(const rating of [-1,6,NaN,Infinity,'4.2']) await assert.rejects(renderShareCard({...input,rating},assets));
  assert.notEqual(shareCardFingerprint(input),shareCardFingerprint({...input,rating:4.2}));
});

const {projectCard, sourceFingerprint, storageMediaPath} = require('../../functions/lib/functions/src/shareCards/source.js');
test('source projection fails closed for restricted entities and excludes private fields', () => {
  assert.equal(projectCard('profile',{display_name:'Child',public_search:true}), null);
  assert.equal(projectCard('community',{displayName:'Town',published:false}), null);
  assert.equal(projectCard('event',{name:'Private',published:true,visibility:'private'}), null);
  const data={name:{en:{text:'Spot'}},rating:0,secret:'never',media:[{type:'image',src:'spot_pictures/a.png',isReported:true}]};
  const source=projectCard('spot',data);
  assert.equal(source.input.title,'Spot'); assert.deepEqual(source.media,[]);
  assert.ok(!JSON.stringify(source).includes('never'));
  assert.equal(sourceFingerprint(source),sourceFingerprint(projectCard('spot',{...data,secret:'changed'})));
  assert.notEqual(sourceFingerprint(source),sourceFingerprint(projectCard('spot',{...data,rating:4})));
});
test('media resolution cannot escape the published folders or fetch arbitrary hosts', () => {
  const bucket='test.appspot.com';
  assert.equal(storageMediaPath(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/spot_pictures%2Fphoto.jpg?alt=media`,bucket),'spot_pictures/photo.jpg');
  for(const url of ['https://127.0.0.1/private','media_intake/a.jpg','spot_pictures/../secret.jpg',`https://firebasestorage.googleapis.com/v0/b/other/o/spot_pictures%2Fa.jpg`]) assert.equal(storageMediaPath(url,bucket),null);
});

test('media candidates resolve extensionless legacy uploads and existing derivatives', () => {
  const { shareCardMediaCandidates } = require('../../functions/lib/functions/src/shareCards/source.js');
  for (const [path, resized] of [
    ['spot_pictures/photo', 'spot_pictures/photo_800x800'],
    ['spot_pictures/photo.jpg', 'spot_pictures/photo_800x800.jpg'],
    ['spot_pictures/photo_400x400', 'spot_pictures/photo_800x800'],
    ['event_media/photo_400x400.png', 'event_media/photo_800x800.png'],
  ]) assert.deepEqual(shareCardMediaCandidates(path), [resized, path]);
  assert.deepEqual(shareCardMediaCandidates('spot_pictures/photo_800x800'), ['spot_pictures/photo_800x800']);
});


test('collage tiles preserve the center of portrait photos', async () => {
  const photo = await sharp(Buffer.from(`<svg width="900" height="1200">
    <rect width="900" height="1200" fill="red"/>
    <rect y="500" width="900" height="200" fill="#00ff00"/>
  </svg>`)).png().toBuffer();
  for (const count of [1, 2, 3]) {
    const png = await renderShareCard({...input, photos: Array(count).fill(photo)}, assets);
    const {data, info} = await sharp(png).raw().toBuffer({resolveWithObject: true});
    const centers = count === 1 ? [[1100, 315]] : [[1100, 205], [1100, 523]];
    if (count === 3) centers.push([700, 523]);
    for (const [x, y] of centers) {
      const offset = (y * info.width + x) * info.channels;
      assert.ok(data[offset + 1] > data[offset] * 2, `${count}-photo tile at ${x},${y} must show the green center`);
    }
  }
});

test('logo shadow darkens its surroundings without darkening the lettering', async () => {
  const photo = await sharp({create:{width:900,height:630,channels:4,background:'white'}}).png().toBuffer();
  const logo = await sharp({create:{width:220,height:40,channels:4,background:'white'}}).png().toBuffer();
  const card = await renderShareCard({...input,photos:[photo]}, {...assets,logo});
  const {data,info} = await sharp(card).raw().toBuffer({resolveWithObject:true});
  const red = (x,y) => data[(y * info.width + x) * info.channels];
  assert.ok(red(921,585) < red(900,585) - 10, 'soft shadow extends outside the logo');
  assert.equal(red(930,585), 255, 'logo remains white');
});

test('photo-free cards use distinct entity-specific background artwork', async () => {
  const crops = [];
  for (const kind of ['spot','event','profile','community','page']) {
    const png = await renderShareCard({...input,kind,title:'Example',subtitle:''}, assets);
    crops.push(await sharp(png).extract({left:700,top:250,width:450,height:250}).png().toBuffer());
  }
  for(let i=0;i<crops.length;i++) for(let j=i+1;j<crops.length;j++) assert.notDeepEqual(crops[i],crops[j]);
});
