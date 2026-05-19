# PK Spot ([pkspot.app](https://pkspot.app))

**The spot for everything parkour.**

Find spots, check in, discover what is happening nearby, and connect with your local parkour community.

PK Spot is growing toward one app for parkour spots, training, events, jams, and community.

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

If Angular exits with `Abort trap: 6`, run the command in a normal terminal outside the sandbox.

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
