const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {readFile} = require('node:fs/promises');
const requireFunctions = createRequire(resolve('functions/package.json'));
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) throw Error('Demo Firestore and Storage emulators required');
const admin = requireFunctions('firebase-admin');
admin.initializeApp({projectId:process.env.GCLOUD_PROJECT,storageBucket:`${process.env.GCLOUD_PROJECT}.appspot.com`});
const db=admin.firestore(), bucket=admin.storage().bucket();
const {prepareShareCard,shareCardImage,invalidateSpotShareCard,cleanupShareCards}=require('../../functions/lib/functions/src/shareCards/functions.js');
const renderer=require('../../functions/lib/functions/src/shareCards/render.js');
const express=require('express');
const app=express(); app.all('/image',shareCardImage);
const server=app.listen(0,'127.0.0.1');
const call = id => prepareShareCard.run({data:{kind:'spot',id},rawRequest:{ip:'127.0.0.1'}});
const image = async id => fetch(`http://127.0.0.1:${server.address().port}/image?kind=spot&id=${id}`);
async function run(){
  const id='share-test', ref=db.doc(`spots/${id}`);
  await ref.set({name:{en:{text:'Fixture Spot'}},rating:0,address:{locality:'Test town'}});
  const endpoint=`http://127.0.0.1:${server.address().port}/image`;
  const fallback=await readFile('src/assets/banner_1200x630.png');
  // Crawlers are read-only, even when no prepared card exists.
  const unprepared=await image(id);
  assert.equal(unprepared.status,200);
  assert.deepEqual(Buffer.from(await unprepared.arrayBuffer()),fallback);
  assert.equal((await db.collection('share_cards').get()).size,0);
  assert.equal((await bucket.getFiles({prefix:'share_cards/'}))[0].length,0);
  for (const query of ['kind=users&id=test','kind=spot&id=..','kind=spot&id=a/b','kind[]=spot&id=test','kind=spot&id[]=test']) {
    assert.equal((await fetch(`${endpoint}?${query}`)).status,400,query);
  }
  for (const method of ['POST','PUT','DELETE']) {
    assert.equal((await fetch(`${endpoint}?kind=spot&id=${id}`,{method})).status,405);
  }
  // A delayed creation trigger can arrive while the first card renders. It
  // must preserve a lease for the current source, even before a card exists.
  const initial=await ref.get(), originalRender=renderer.renderShareCard;
  renderer.renderShareCard=async (...args)=>{
    await invalidateSpotShareCard.run({params:{id},data:{before:{data:()=>undefined},after:initial}});
    return originalRender(...args);
  };
  let first;
  try { first=await call(id); } finally { renderer.renderShareCard=originalRender; }
  assert.equal(first.reused,false);
  const cards=await db.collection('share_cards').get(); assert.equal(cards.size,1);
  let card=cards.docs[0].data(); assert.ok(card.path.startsWith('share_cards/spots/'));
  const [metadata]=await bucket.file(card.path).getMetadata();
  assert.equal(metadata.metadata?.firebaseStorageDownloadTokens,undefined);
  const publicImage=await image(id);
  assert.equal(publicImage.status,200);
  assert.equal(publicImage.headers.get('cache-control'),'private, no-store');
  assert.equal(publicImage.headers.get('x-content-type-options'),'nosniff');
  assert.ok(publicImage.headers.get('content-type').startsWith('image/png'));
  const head=await fetch(`${endpoint}?kind=spot&id=${id}`,{method:'HEAD'});
  assert.equal(head.status,200); assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await call(id)).reused,true);
  const direct=await fetch(`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(card.path)}?alt=media`);
  assert.ok([401,403].includes(direct.status),'Anonymous Storage reads must be denied');
  const firestoreRead=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents/share_cards/${cards.docs[0].id}`);
  assert.equal(firestoreRead.status,403,'Card records are server-owned');
  const photo=await readFile('src/assets/banner_1200x630.png');
  const photoPath='spot_pictures/share-test_800x800.png';
  await bucket.file(photoPath).save(photo,{resumable:false,metadata:{contentType:'image/png'}});
  await ref.update({media:[{type:'image',src:'spot_pictures/share-test.png',isInStorage:true}]});
  assert.equal((await call(id)).reused,false);
  assert.equal((await bucket.file(card.path).exists())[0],false,'Replaced card removed');
  card=(await cards.docs[0].ref.get()).data();
  assert.equal(card.media[0].path,photoPath,'Use published resize even when original is archived');
  await bucket.file(photoPath).delete();
  assert.deepEqual(Buffer.from(await (await image(id)).arrayBuffer()),photo,'Removed media is not served from the old card');
  assert.equal((await call(id)).reused,false);
  card=(await cards.docs[0].ref.get()).data();
  await bucket.file(card.path).delete();
  const missingImage=await image(id);
  assert.equal(missingImage.status,200,'Missing generated image uses a safe fallback without rendering');
  assert.deepEqual(Buffer.from(await missingImage.arrayBuffer()),fallback);
  assert.equal((await bucket.file(card.path).exists())[0],false);
  assert.equal((await call(id)).reused,false,'Missing generated image is repaired');
  card=(await cards.docs[0].ref.get()).data();
  const before=await ref.get(); await ref.update({visibility:'private'}); const after=await ref.get();
  assert.equal((await image(id)).status,404,'Privacy blocks reads before cleanup runs');
  await assert.rejects(call(id),error=>error.code==='permission-denied');
  await invalidateSpotShareCard.run({params:{id},data:{before,after}});
  assert.equal((await bucket.file(card.path).exists())[0],false);
  assert.equal((await cards.docs[0].ref.get()).exists,false);
  // Change privacy while rendering: publication must re-read source atomically.
  await ref.update({visibility:'public'});
  const original=renderer.renderShareCard;
  renderer.renderShareCard=async (...args)=>{ await ref.update({visibility:'private'}); return original(...args); };
  await assert.rejects(call(id),error=>error.code==='aborted');
  renderer.renderShareCard=original;
  assert.equal((await bucket.getFiles({prefix:'share_cards/'}))[0].length,0,'Aborted uploads are removed');
  const adult={display_name:'Public athlete',public_profile_enabled:true,public_search:true,
    age_policy:{adult_eligibility:'verified',age_range:{lower:18},assurance:{status:'active',client_integrity:'apple_app_attest_request_bound'}}};
  // The public HTTP image gate rechecks every entity even before invalidation runs.
  for (const [kind,collection,publicData,restrictions] of [
    ['event','events',{name:'Public event',published:true},[{visibility:'private'},{discoverability:{audience:'followers'}},{viewer_policy:{min_age:18}},{published:false}]],
    ['community','community_pages',{displayName:'Town',published:true},[{published:false},{redirect_to_community_key:'elsewhere'}]],
    ['profile','users',adult,[{public_search:false},{account_privacy:'private'},{profile_visibility:'followers'},{age_policy:{age_range:{upper:17}}},{moderation_state:{status:'suspended'}}]],
  ]) {
    const entityId=`privacy-${kind}`, entity=db.doc(`${collection}/${entityId}`);
    const query=`${endpoint}?kind=${kind}&id=${entityId}`;
    const prepare=()=>prepareShareCard.run({data:{kind,id:entityId},rawRequest:{ip:`fixture-${kind}`}});
    await entity.set(publicData); await prepare();
    assert.equal((await fetch(query)).status,200,kind);
    for (const restriction of restrictions) {
      await entity.set({...publicData,...restriction});
      assert.equal((await fetch(query)).status,404,JSON.stringify(restriction));
      await assert.rejects(prepare(),error=>error.code==='permission-denied');
    }
    await entity.delete();
    assert.equal((await fetch(query)).status,404,'Deleted entity never serves its cached image');
  }
  // Advancing only the application clock exercises retention without waiting a day.
  await db.doc('spots/retained-card').set({name:'Still public'});
  await prepareShareCard.run({data:{kind:'spot',id:'retained-card'},rawRequest:{ip:'retention-fixture'}});
  const retained=(await db.collection('share_cards').where('id','==','retained-card').get()).docs[0].data();
  const orphan=`share_cards/spots/${'a'.repeat(64)}/orphan.png`;
  await bucket.file(orphan).save(fallback,{resumable:false,metadata:{contentType:'image/png'}});
  const realNow=Date.now, future=realNow()+2*86400_000;
  Date.now=()=>future;
  try { await cleanupShareCards.run({}); } finally { Date.now=realNow; }
  assert.equal((await bucket.file(orphan).exists())[0],false,'Old orphan upload is removed');
  assert.equal((await bucket.file(retained.path).exists())[0],true,'Still-public current image survives cleanup');
  assert.equal((await bucket.getFiles({prefix:'share_cards/'}))[0].length,1,'Deleted/restricted entity images are removed');
  assert.equal((await db.collection('share_card_limits').get()).empty,true,'Expired rate-limit records are removed');
  console.log('Share-card emulator checks passed: prepare, reuse, private storage, privacy gate, deletion, publication race.');
}
run().finally(async()=>{server.close();await admin.app().delete();}).catch(error=>{console.error(error);process.exitCode=1;});
