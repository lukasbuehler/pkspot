const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {readFile} = require('node:fs/promises');
const {createHash} = require('node:crypto');
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
  // A future renderer version must never create a gap in the public preview.
  const oldVersion=renderer.SHARE_CARD_VERSION;
  const oldBytes=Buffer.from(await (await image(id)).arrayBuffer());
  const oldPath=card.path;
  const priorRenderer=renderer.renderShareCard;
  renderer.SHARE_CARD_VERSION='future-renderer-test';
  try {
    assert.deepEqual(Buffer.from(await (await image(id)).arrayBuffer()),oldBytes);
    await invalidateSpotShareCard.run({params:{id},data:{before:{data:()=>undefined},after:await ref.get()}});
    assert.equal((await cards.docs[0].ref.get()).data().path,oldPath,'Delayed invalidation preserves a safe older design');
    renderer.renderShareCard=async()=>{
      assert.deepEqual(Buffer.from(await (await image(id)).arrayBuffer()),oldBytes,'Old preview remains readable during replacement');
      throw Error('Simulated render failure');
    };
    await assert.rejects(call(id),error=>error.code==='internal');
    assert.deepEqual(Buffer.from(await (await image(id)).arrayBuffer()),oldBytes,'A failed refresh retains the previous image');
    renderer.renderShareCard=priorRenderer;
    assert.equal((await call(id)).reused,false,'An explicit Share upgrades to the current design');
    assert.equal((await bucket.file(oldPath).exists())[0],false,'Successful replacement removes the old object');
    card=(await cards.docs[0].ref.get()).data();
    assert.equal(card.content_version,2);
  } finally {renderer.SHARE_CARD_VERSION=oldVersion;renderer.renderShareCard=priorRenderer;}
  assert.ok((await image(id)).ok,'Rolling back a renderer also preserves a safe preview');
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
  const originalMedia={type:'image',src:'spot_pictures/share-test.png',isInStorage:true};
  const morePhotos=Array.from({length:3},(_,i)=>({type:'image',src:`spot_pictures/added-${i}.png`,isInStorage:true}));
  for(let i=0;i<3;i++) await bucket.file(`spot_pictures/added-${i}_800x800.png`).save(photo,{resumable:false,metadata:{contentType:'image/png'}});
  const savedPhotoCard=Buffer.from(await (await image(id)).arrayBuffer());
  await ref.update({media:[...morePhotos,originalMedia]});
  assert.deepEqual(Buffer.from(await (await image(id)).arrayBuffer()),savedPhotoCard,'An older approved photo remains usable after a new selection becomes preferred');
  await ref.update({media:morePhotos});
  assert.deepEqual(Buffer.from(await (await image(id)).arrayBuffer()),fallback,'Removing the embedded photo reference blocks its cached card');
  await ref.update({media:[originalMedia]});
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
  // Newly rendered ranges must stop serving when only the ending changes.
  const rangeEvent=db.doc('events/range-event');
  await rangeEvent.set({name:'Multi day camp',published:true,time_zone:'Europe/Zurich',
    start:admin.firestore.Timestamp.fromDate(new Date('2026-12-11T12:00:00Z')),
    end:admin.firestore.Timestamp.fromDate(new Date('2026-12-13T12:00:00Z'))});
  const prepareRange=()=>prepareShareCard.run({data:{kind:'event',id:'range-event'},rawRequest:{ip:'range-fixture'}});
  const rangeImage=()=>fetch(`${endpoint}?kind=event&id=range-event`);
  await prepareRange();
  assert.notDeepEqual(Buffer.from(await (await rangeImage()).arrayBuffer()),fallback);
  await rangeEvent.update({end:admin.firestore.Timestamp.fromDate(new Date('2026-12-14T12:00:00Z'))});
  assert.deepEqual(Buffer.from(await (await rangeImage()).arrayBuffer()),fallback,'End-only edits invalidate corrected cards');
  await prepareRange();
  assert.notDeepEqual(Buffer.from(await (await rangeImage()).arrayBuffer()),fallback);
  await rangeEvent.delete();
  // Seed the exact deployed cache format, without the new content snapshot.
  const legacyBytes=await requireFunctions('sharp')({create:{width:1200,height:630,channels:4,background:'#304578'}}).png().toBuffer();
  const legacyPhotoPath='spot_pictures/legacy_800x800.png';
  await bucket.file(legacyPhotoPath).save(photo,{resumable:false,metadata:{contentType:'image/png'}});
  const legacyPhotoMetadata=(await bucket.file(legacyPhotoPath).getMetadata())[0];
  const legacyFixtures=[
    ['spot','spots',{name:'Legacy Spot',rating:4,locality_string:'Town',media:[{type:'image',src:'spot_pictures/legacy.png',isInStorage:true}]},
      {kind:'spot',audience:'public',title:'Legacy Spot',subtitle:'Town',detail:'Explore on PK Spot',rating:4},['spot_pictures/legacy.png']],
    ['event','events',{name:'Legacy event',published:true,venue_string:'Hall',locality_string:'Town'},
      {kind:'event',audience:'public',title:'Legacy event',subtitle:'Hall',detail:'Discover the event on PK Spot'},[]],
    ['community','community_pages',{displayName:'Legacy town',published:true,scope:'locality',geography:{countryCode:'CH'},counts:{totalSpots:1},communityPicks:[{category:'standout',spots:[{id:'compat-spot'}]}]},
      {kind:'community',audience:'public',title:'Legacy town',subtitle:'1 Spots',detail:'Find your community on PK Spot'},[]],
    ['profile','users',adult,
      {kind:'profile',audience:'public',title:'Public athlete',subtitle:'Part of the parkour community',detail:'Find your community on PK Spot'},[]],
  ];
  const legacyPaths=[];
  for(const [kind,collection,data,input,media] of legacyFixtures) {
    const entityId=`compat-${kind}`, entity=db.doc(`${collection}/${entityId}`);
    await entity.set(data);
    const key=createHash('sha256').update(`${kind}/${entityId}`).digest('hex');
    const path=`share_cards/${collection}/${key}/legacy.png`;
    legacyPaths.push(path);
    await bucket.file(path).save(legacyBytes,{resumable:false,metadata:{contentType:'image/png',cacheControl:'private, no-store'}});
    const revision=createHash('sha256').update('prototype-10').update(JSON.stringify({input,media})).digest('hex').slice(0,24);
    const cardRef=db.doc(`share_cards/${key}`);
    await cardRef.set({kind,id:entityId,path,revision,media:kind==='spot'?[{path:legacyPhotoPath,generation:String(legacyPhotoMetadata.generation)}]:[]});
    const before=(await cardRef.get()).updateTime.toMillis();
    const query=`${endpoint}?kind=${kind}&id=${entityId}`;
    assert.deepEqual(Buffer.from(await (await fetch(query)).arrayBuffer()),legacyBytes,`${kind}: legacy card survives renderer/projection changes`);
    assert.equal((await cardRef.get()).updateTime.toMillis(),before,'GET never migrates or rewrites cache records');
    const invalidate=require('../../functions/lib/functions/src/shareCards/functions.js')[`invalidate${kind[0].toUpperCase()+kind.slice(1)}ShareCard`];
    await invalidate.run({params:{id:entityId},data:{before:{data:()=>undefined},after:await entity.get()}});
    assert.equal((await cardRef.get()).data().path,path,'Legacy image survives delayed invalidation');
    if(kind==='event') {
      await entity.update({name:'Edited legacy event'});
      assert.deepEqual(Buffer.from(await (await fetch(query)).arrayBuffer()),fallback,'Real content edits still invalidate legacy cards');
      await entity.update({name:data.name});
    }
  }
  // Community cards resolve current Spot media instead of trusting preview URLs.
  const communityId='collage-community', communityRef=db.doc(`community_pages/${communityId}`);
  const communitySpot=db.doc('spots/collage-spot');
  await bucket.file('spot_pictures/collage_800x800.png').save(photo,{resumable:false,metadata:{contentType:'image/png'}});
  const communityPhoto={type:'image',src:'spot_pictures/collage.png',isInStorage:true};
  await communitySpot.set({name:'Community standout',media:[communityPhoto]});
  await communityRef.set({published:true,displayName:'Collage town',counts:{totalSpots:1},
    communityPicks:[{category:'standout',spots:[{id:'collage-spot',imageSrc:'untrusted-preview'}]}]});
  const prepareCommunity=()=>prepareShareCard.run({data:{kind:'community',id:communityId},rawRequest:{ip:'collage-fixture'}});
  const communityImage=()=>fetch(`${endpoint}?kind=community&id=${communityId}`);
  await prepareCommunity();
  assert.notDeepEqual(Buffer.from(await (await communityImage()).arrayBuffer()),fallback);
  assert.equal((await prepareCommunity()).reused,true);
  // No community trigger is needed for this privacy check.
  await communitySpot.update({visibility:'private'});
  assert.deepEqual(Buffer.from(await (await communityImage()).arrayBuffer()),fallback,'A private source Spot stops contributing immediately');
  await communitySpot.update({visibility:'public',media:[{...communityPhoto,isReported:true}]});
  assert.deepEqual(Buffer.from(await (await communityImage()).arrayBuffer()),fallback,'Reported photos never remain in a cached community card');
  await communitySpot.update({media:[communityPhoto]});
  const communityBefore=await communityRef.get();
  const renderCommunity=renderer.renderShareCard;
  renderer.renderShareCard=async (...args)=>{
    // A delayed community creation event must preserve the current render lease.
    await require('../../functions/lib/functions/src/shareCards/functions.js').invalidateCommunityShareCard.run({params:{id:communityId},data:{before:{data:()=>undefined},after:communityBefore}});
    await communitySpot.update({visibility:'private'});
    return renderCommunity(...args);
  };
  // Force a new render without changing the selected candidate IDs.
  await communityRef.update({displayName:'Renamed collage town'});
  try { await assert.rejects(prepareCommunity(),error=>error.code==='aborted'); }
  finally { renderer.renderShareCard=renderCommunity; }
  assert.deepEqual(Buffer.from(await (await communityImage()).arrayBuffer()),fallback,'A photo privacy change during rendering prevents publication');
  await communityRef.delete();
  await communitySpot.delete();
  // Advancing only the application clock exercises retention without waiting a day.
  await db.doc('spots/retained-card').set({name:'Still public'});
  await prepareShareCard.run({data:{kind:'spot',id:'retained-card'},rawRequest:{ip:'retention-fixture'}});
  const retainedRef=(await db.collection('share_cards').where('id','==','retained-card').get()).docs[0].ref;
  await retainedRef.update({revision:'an-older-renderer-version'});
  const retained=(await retainedRef.get()).data();
  const orphan=`share_cards/spots/${'a'.repeat(64)}/orphan.png`;
  await bucket.file(orphan).save(fallback,{resumable:false,metadata:{contentType:'image/png'}});
  const realNow=Date.now, future=realNow()+2*86400_000;
  Date.now=()=>future;
  try { await cleanupShareCards.run({}); } finally { Date.now=realNow; }
  assert.equal((await bucket.file(orphan).exists())[0],false,'Old orphan upload is removed');
  assert.equal((await bucket.file(retained.path).exists())[0],true,'Still-public current image survives cleanup');
  for(const path of legacyPaths) assert.equal((await bucket.file(path).exists())[0],true,'Safe legacy images survive scheduled cleanup without migration');
  assert.equal((await bucket.getFiles({prefix:'share_cards/'}))[0].length,1+legacyPaths.length,'Only valid current and legacy images survive cleanup');
  assert.equal((await db.collection('share_card_limits').get()).empty,true,'Expired rate-limit records are removed');
  console.log('Share-card emulator checks passed: renderer upgrades/rollback, legacy compatibility, failed refresh retention, read-only GET, safe cleanup, privacy gates and publication races.');
}
run().finally(async()=>{server.close();await admin.app().delete();}).catch(error=>{console.error(error);process.exitCode=1;});
