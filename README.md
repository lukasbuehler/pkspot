# PK Spot ([pkspot.app](https://pkspot.app))

**The spot for everything parkour.**

Find spots, check in, discover what is happening nearby, and connect with your local Parkour community.

PK Spot is growing toward one app for Parkour spots, training, events, jams, and community.

<!-- ## Download on the App Store and Google Play -->

<!-- <a href="https://apps.apple.com/app/pk-spot-parkour-freerunning/id6757597683"><img style="height: 50px;" src="https://developer.apple.com/app-store/marketing/guidelines/images/badge-example-preferred_2x.png"></a>
<a href="https://play.google.com/store/apps/details?id=com.pkspot.app"><img style="height: 50px; margin-top: -10px; margin-bottom: -5px" src="https://play.google.com/intl/en_us/badges/images/generic/en_badge_web_generic.png"></a> -->

## Release Notes

### Version 1.1.3 - "Profiles & Community Submissions"

- Updated Profile pages and following mechanics
- Users can submit community card suggestions
- Moderation queue for admins to view community and spot votes

### Version 1.1.2 - 25.6.2026 "Events & Communities"

- Event info pages
- Community info cards
- Event series to filter by
- Map performance and UI/UX improvements
- Organizations can verify spots
- Event RSVPs
- Bug fixes and polishing

### Version 1.1.0 and 1.1.1 - 21.5.2026 "Communities and more"

- Added Communities and Events
- Save spots and mark them as visited
- Added community pages and map search
- Bug fixes and UI polish

### Version 1.0.11 - 22.2.2026

- Added saved and visited spot lists
- Improved provenance and verification workflows
- Bug fixes and more

### Version 1.0.9 - 3.2.2026

- Performance and image-loading improvements
- Added the hybrid satellite map with location labels
- Added splash screens and animated spot previews
- Fixed spot image editing side effects and mobile splash screens

### Version 1.0.8 - 24.1.2026

- Improved map performance and location UX
- Improved spot previews, highlights, and clusters
- Added Android early access setup
- Fixed Google sign-in on some devices with browser redirect fallback
- Fixed profile picture uploads, media ordering, and language startup issues

## Collaborating

Contributions are welcome. To collaborate on the codebase:

1. Fork this repository.
2. Create a focused branch for your change.
3. Follow the local setup below.
4. Run the relevant tests before submitting.
5. Open a pull request on GitHub.

Keep changes small and focused where possible. For code changes, prefer existing Angular and Firebase patterns in the project over introducing new abstractions.

### Bug reports

For bug reports, please open an issue in this GitHub repository.
You can also reach out on Instagram, Discord, or by email at [contact@lukasbuehler.ch](mailto:contact@lukasbuehler.ch).

### Feature requests

For feature requests, please use Discord or contact me directly.

### Local Development Setup

To setup for local development, duplicate the file `src/environments/environment.default.ts` to `src/environments/environment.development.ts`.

Replace the `firebaseConfig` with your own from Firebase.
Under `keys.firebaseConfig.apiKey` you will need to add your own Google API Key, with the following APIs enabled for full functionality:

- Firebase App Check API
- IAM Service Account Credentials
- Identity and Access Management (IAM) API
- Identity Toolkit API
- Maps JavaScript API
- Places API (New)
- Secret Manager API
- Street View Static API
- Token Service API

### Translation

The translation files are in [`src/locale`](./src/locale/) and
English (`en`) is the source language.

To tweak a translation, go to the corresponding file, find the string you want to change, and update the value inside the `target` XML tag only. Example:

```xml
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de-CH">
    <file id="ngi18n" original="ng.template">
        <unit id="1940752772695642659">
            <segment state="initial">
                <source> The spot for everything parkour. </source>
                <target> De Spot für alles Parkour. </target>
            </segment>
        </unit>
        ...
    </file>
</xliff>
```

#### Update the language files

After adding new text in the HTML markup and adding the `i18n` attribute, update the language files so they include the new source text.

Run the following command:

```
npx ng extract-i18n
```

After that the language files will be updated (and possibly reformatted, which is ok). You can now edit the language files as usual with the new text.

#### Adding a new language

1. Find the language code and country for the language you want to add.
   If it is a country specific language variant it should be of the form `xx-XX`, where the latter part is the country code.
   If it is not country specific, the language code is simply of the form `xx`.
   Check out the list of language codes on [Wikipedia](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) and see Set 1. Also, for country specific languages, check out this site: [Country Code Language List](https://www.fincher.org/Utilities/CountryLanguageList.shtml).

2. With the code, add the language in [`angular.json`](./angular.json). Add it as a locale inside `i18n > locales`, and the language code inside the JSON `architect > build > options > localize`

   ```json
   {
   ...
   "projects": {
       "pkspot": {
       ...
       "i18n": {
           ...
           "locales": {
           ...
           "de": {
               "translation": "src/locale/messages.de.xlf",
               "baseHref": "/de/"
           },
           "de-CH": {
               "translation": "src/locale/messages.de-CH.xlf",
               "baseHref": "/de-CH/"
           }
           ...

           // add your new language here
           // with its language code xx-XX or xx similar to above...

           // "xx-XX": {
           //   "translation": "src/locale/messages.xx-XX.xlf",
           //   "baseHref": "/xx-XX/"
           // }
           }
           ...
       },
       "architect": {
           "build": {
              "builder": "@angular/build:application",
              "options": {
                  "localize": ["en", "de", "de-CH", "xx-XX"], // add you language here too
                  ...
              }
              ...
           }
           ...
       }
       ...
       }
   }
   }
   ```

3. Copy an existing language file like `messages.de.xlf` in `src/locale` and paste it with the same name as in [`angular.json`](./angular.json), e.g. `messages.xx-XX.xlf` or `messages.xx.xlf`.

4. Edit this new language file in [`src/locale`](./src/locale/).

5. Submit a pull-request with your changes on [GitHub](https://github.com/lukasbuehler/pkspot/compare)

### Local Development

PK Spot uses Google Maps. To test the map locally, you need your own Google API key.

1. Generate your own Google API key
2. Enter it in `keys.development.ts`
3. Build for the development environment when developing locally

Install dependencies:

```
npm install
```

Run the development server:

```
npm run dev
```

Build the app:

```
npm run build
```

Start the SSR server after building:

```
npm run serve:ssr
```

Run the main local verification pass:

```
npm run test:all
```

Useful narrower checks:

```
npm run test:unit
npm run test:build
npm run test:e2e
```

### Maintenance jobs

Most maintenance jobs are triggered by creating a Firestore document with the
exact path listed below. Unless a payload is shown, `{}` is enough.

For production, use the Firebase Console:

1. Open Firestore.
2. Create the collection/doc path from the table, for example
   `maintenance/run-backfill-storage-image-sizes`.
3. Add the payload fields if needed.
4. Watch the same doc or Cloud Functions logs for completion.

#### Storage images

| Job                                                                                                                                                                     | Firestore document                             | Payload                   | Completion                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| Backfill missing image sizes (`200`, `400`, `800`) for spot, profile, post, and event images. Reads originals from the public media path and from `resized_originals/`. | `maintenance/run-backfill-storage-image-sizes` | `{}`                      | Deletes the run doc and writes `maintenance/last-storage-image-size-backfill`. |
| Backfill optional `1600` images too.                                                                                                                                    | `maintenance/run-backfill-storage-image-sizes` | `{ "include1600": true }` | Deletes the run doc and writes `maintenance/last-storage-image-size-backfill`. |
| Backfill only selected image sizes.                                                                                                                                     | `maintenance/run-backfill-storage-image-sizes` | `{ "sizes": [1600] }`     | Deletes the run doc and writes `maintenance/last-storage-image-size-backfill`. |

Example image backfill payload:

```json
{
  "include1600": true
}
```

#### Spots and search fields

| Job                                                          | Firestore document                          | Payload | Completion                                                                     |
| ------------------------------------------------------------ | ------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| Recompute spot Typesense helper fields.                      | `maintenance/run-backfill-typesense-fields` | `{}`    | Deletes the run doc.                                                           |
| Recompute spot landing/search helper fields.                 | `maintenance/run-backfill-landing`          | `{}`    | Updates the run doc with `status: "DONE"`.                                     |
| Refresh spot addresses from geocoding.                       | `maintenance/run-update-addresses`          | `{}`    | Deletes the run doc on success; otherwise leaves `status: "DONE_WITH_ERRORS"`. |
| Audit reserved spot slugs.                                   | `maintenance/run-audit-reserved-slugs`      | `{}`    | Updates the run doc with `status: "DONE"` or `status: "FAILED"`.               |
| Detect possible duplicate spots within the duplicate radius. | `maintenance/run-detect-duplicate-spots`    | `{}`    | Check Cloud Functions logs.                                                    |

#### Events and communities

| Job                                      | Firestore document                                | Payload | Completion                                                                                                     |
| ---------------------------------------- | ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| Recompute event Typesense helper fields. | `maintenance/run-backfill-event-typesense-fields` | `{}`    | Deletes the run doc.                                                                                           |
| Rebuild generated community pages.       | `maintenance/run-rebuild-community-pages`         | `{}`    | Updates the run doc with `status: "DONE"` and writes warnings to `maintenance/community-warnings` when needed. |

#### One-off migrations

| Job                                                       | Firestore document                  | Payload | Completion           |
| --------------------------------------------------------- | ----------------------------------- | ------- | -------------------- |
| Convert spot `location` maps back to Firestore GeoPoints. | `spots/run-fix-locations`           | `{}`    | Deletes the run doc. |
| Normalize old spot locale maps.                           | `spots/run-fix-locale-maps`         | `{}`    | Deletes the run doc. |
| Backfill user signup numbers from Auth creation time.     | `users/run-backfill-signup-numbers` | `{}`    | Deletes the run doc. |
| Recalculate user edit statistics from edit documents.     | `users/run-recalculate-edit-stats`  | `{}`    | Deletes the run doc. |

### Icon fonts

Material Symbols are self-hosted and subsetted for performance.

- Filled rounded icons come from [`src/assets/fonts/icons_list.txt`](./src/assets/fonts/icons_list.txt) and render through the default `Material Symbols Rounded` font.
- Outlined rounded icons come from [`src/assets/fonts/icons_outline_list.txt`](./src/assets/fonts/icons_outline_list.txt) and render through the tiny `Material Symbols Rounded Outlined` font.
- If an outlined state uses a legacy alias such as `star_border`, `bookmark_border`, or `mobile_border`, make sure the alias is mapped to the real glyph name in [`scripts/optimize_icons.py`](./scripts/optimize_icons.py).
- Listing an icon in `icons_outline_list.txt` only includes it in the generated outline font. The element must also use `material-symbols-rounded-outline` or `font-family: "Material Symbols Rounded Outlined"`; otherwise `<mat-icon>` uses the default filled font.
- After changing either icon list or alias map, run:

```
npm run icons:optimize
```

<!-- ### Working with Typesense for full-text search

I use the Firebase Typesense extension.

#### Changing the Schema

[Typesense Collections Documentation](https://typesense.org/docs/0.24.0/api/collections.html#create-a-collection)

#### Backfilling

Add a document to the Firestore collection `typesense_sync` named `backfill` with the following content:

```
firestore_collections: ["spots"],
trigger: true
``` -->
