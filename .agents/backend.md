# Backend guide (Firestore, Functions, Typesense)

Read this when changing Cloud Functions, Firestore rules or data shapes,
Typesense schemas, or anything a client writes.

## Cloud Functions

- New functions go in `europe-west1`. `functions/src/index.ts` sets the global
  v2 options to that region, and the app calls functions there. A function that
  does not inherit those options sets the region explicitly; Firebase's default
  is `us-central1`.
- Functions left in `us-central1` stay there only on purpose. A regional move
  creates a separate resource; delete the old one after the new one is
  verified.
- Use gen 2 APIs (`firebase-functions/v2/*`). The only exception is basic Auth
  lifecycle triggers that have no gen 2 version; keep them isolated and covered
  by the functions generation policy test.

## Data contracts

Firestore, Typesense and callable payloads are versioned contracts: mobile apps
and older web builds keep reading old fields after a deploy.

- Prefer additive fields. Keep legacy fields filled until every supported
  client has moved.
- When a UI data shape changes, map the new data back into the old fields or
  give clients fallbacks, so older apps degrade instead of showing empty
  states.
- A Firestore field that Typesense indexes needs the real `typesense/*.json`
  schema and `src/db/schemas/typesense-alignment.spec.ts` updated together.

### Coordinates

Client-written locations always include a plain raw field such as
`location_raw: { lat, lng }`, and bounds include raw forms where available.
Browser code may also write the `GeoPoint`; native code must not rely on it.
Functions normalize and backfill both shapes. Derived helpers such as
`bounds_center` and `bounds_radius_m` are server-owned. Readers keep fallbacks
for both shapes.

## Tests for write paths

Changes to a Firestore write path, especially event editing or payload
serialization, need an emulator test that does the real client write through
the app service and adapter. Mocked adapter tests and rules tests alone are not
enough for `Timestamp`, `GeoPoint`, `deleteField()`, nested arrays or objects,
or client versus server-owned fields.

## Deployment notes

A change that needs a Functions, rules, index or schema deploy, a backfill or
another release step gets an entry in its owning checklist. See
[releases.md](releases.md).
