const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const renderer=require('../../functions/lib/functions/src/shareCards/render.js');
const {projectCard,sourceFingerprint}=require('../../functions/lib/functions/src/shareCards/source.js');
const {contentFingerprint,legacyRevisions,cachedContentMatches,cachedMediaReferences}=require('../../functions/lib/functions/src/shareCards/cache.js');

test('availability ignores renderer versions and generated presentation copy',()=>{
  const data={name:'A Spot',rating:4,locality_string:'Town'};
  const source=projectCard('spot',data);
  const card={content_version:1,content_fingerprint:contentFingerprint('spot',data),revision:sourceFingerprint(source)};
  const version=renderer.SHARE_CARD_VERSION;
  renderer.SHARE_CARD_VERSION='future-renderer-999';
  try {
    assert.notEqual(sourceFingerprint({...source,input:{...source.input,detail:'New branding'}}),card.revision);
    assert.equal(cachedContentMatches(card,{contentFingerprint:contentFingerprint('spot',data),legacyRevisions:[]}),true);
    assert.equal(cachedContentMatches(card,{contentFingerprint:contentFingerprint('spot',{...data,name:'Edited Spot'}),legacyRevisions:[]}),false);
  } finally {renderer.SHARE_CARD_VERSION=version;}
});

test('content snapshots ignore object key order, irrelevant metadata and eligible photo selection',()=>{
  const data={name:'Event',published:true,place_names:{key:'town',locality:{en:'Town',de:'Stadt'}}};
  const equivalent={...data,private_field:'ignored',place_names:{locality:{de:'Stadt',en:'Town'},key:'town'}};
  assert.equal(contentFingerprint('event',data),contentFingerprint('event',equivalent));
  const source=projectCard('event',data);
  assert.equal(sourceFingerprint(source),sourceFingerprint({...source,eligibleMedia:['event_media/new.jpg']}));
});

test('the deployed prototype-10 projection remains readable after locality and collage additions',()=>{
  for(const [kind,data,oldInput] of [
    ['spot',{name:'Old Spot',rating:4,locality_string:'Town'},
      {kind:'spot',audience:'public',title:'Old Spot',subtitle:'Town',detail:'Explore on PK Spot',rating:4}],
    ['event',{name:'Old event',published:true,venue_string:'Hall',locality_string:'Town'},
      {kind:'event',audience:'public',title:'Old event',subtitle:'Hall',detail:'Discover the event on PK Spot'}],
    ['community',{displayName:'Old town',published:true,scope:'locality',geography:{countryCode:'CH'},counts:{totalSpots:5}},
      {kind:'community',audience:'public',title:'Old town',subtitle:'5 Spots',detail:'Find your community on PK Spot'}],
  ]) {
    const oldRevision=createHash('sha256').update('prototype-10').update(JSON.stringify({input:oldInput,media:[]})).digest('hex').slice(0,24);
    const source=projectCard(kind,data);
    const current={contentFingerprint:contentFingerprint(kind,data),legacyRevisions:legacyRevisions(kind,data,source)};
    assert.equal(cachedContentMatches({revision:oldRevision},current),true,kind);
    assert.equal(cachedContentMatches({revision:'unrecognized-revision'},current),false,kind);
  }
});

test('prototype-11 and prototype-12 compatibility projections exclude cache-only fields',()=>{
  const data={name:'Event',published:true,venue_string:'Hall',locality_string:'Town'};
  const source=projectCard('event',data);
  const {eligibleMedia,...oldSource}=source;
  const old12=createHash('sha256').update('prototype-12').update(JSON.stringify(oldSource)).digest('hex').slice(0,24);
  const {locationLabel,...input}=oldSource.input;
  const old11=createHash('sha256').update('prototype-11').update(JSON.stringify({...oldSource,input})).digest('hex').slice(0,24);
  assert.ok(legacyRevisions('event',data,source).includes(old11));
  assert.ok(legacyRevisions('event',data,source).includes(old12));
});

test('only photos actually embedded need validation, including older still-approved selections',()=>{
  const paths=new Set(['spot_pictures/old_800x800.jpg','spot_pictures/new_800x800.jpg']);
  assert.deepEqual(cachedMediaReferences([],paths),[]);
  assert.deepEqual(cachedMediaReferences([null,{path:'spot_pictures/old_800x800.jpg',generation:'123'}],paths),[{path:'spot_pictures/old_800x800.jpg',generation:'123'}]);
  for(const media of [undefined,{},[{}],[{path:'media_intake/private.jpg',generation:'123'}],[{path:'spot_pictures/old_800x800.jpg'}],Array(17).fill(null)]) {
    assert.equal(cachedMediaReferences(media,paths),null);
  }
});

test('version 2 tracks event end dates and civil timing without redefining version 1',()=>{
  const data={name:'Camp',published:true,start:{seconds:1797033600},end:{seconds:1797206400}};
  const current=data=>({contentFingerprint:contentFingerprint('event',data,2),contentFingerprintV1:contentFingerprint('event',data),legacyRevisions:[]});
  const card={content_version:2,content_fingerprint:current(data).contentFingerprint};
  assert.equal(cachedContentMatches(card,current(data)),true);
  for(const change of [{end:{seconds:1797292800}},{timing:{mode:'date_only',start_date:'2026-12-12',end_date:'2026-12-14'}}]) {
    const edited={...data,...change};
    assert.equal(cachedContentMatches(card,current(edited)),false);
    assert.equal(contentFingerprint('event',data),contentFingerprint('event',edited),'Frozen version 1 excludes fields it never rendered');
    assert.equal(cachedContentMatches({content_version:1,content_fingerprint:contentFingerprint('event',data)},current(edited)),true);
  }
});
