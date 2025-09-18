# PK Spot ([pkspot.app](https://pkspot.app))

**The spot for Parkour and Freerunning.**

Discover spots, challenges, <strike>events, and fellow athletes, plan training sessions with your friends and share achievements and memories with them and the world.</strike>

(Strike-through features are in development.)

## Roadmap

### Future Updates

For the detailed progress please refer to the following GitHub project: [PK Spot Updates](https://github.com/users/lukasbuehler/projects/1/views/8)

| Non-binding time estimate | Features                                                                                                   |
| :------------------------ | :--------------------------------------------------------------------------------------------------------- |
| Q3 2025                   | Usability Update: Make the whole thing easier to use. And fix user sign-up, spot creation and editing bugs |
| Q4 2025                   | **Training Update**: Plan and share training sessions and jams                                             |
| ...                       | ...                                                                                                        |

### Past Updates

| Date              | Features                                                                                                                                                                             | Last Commit                                                                                                                                                             |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q2 2025           | Added Embedding Option + Swiss Jam 25 Features (Challenges, event pages)                                                                                                             |
| Q1 2025           | Spot Map Update leftovers: Link Google places, drinking water and WC's on map, Angular 19, French                                                                                    |
| 27. December 2024 | **Spot map update**: Improvements to spot clustering, Highlighted spots, Spot ratings, spot features and amenities, performance improvements, more languages (Italian, Swiss-German) | [209dcbe](https://github.com/lukasbuehler/pkspot/commit/209dcbe7649289aee0813403b991e96f7c54b61b#diff-0cdfa2a1ed45e76b091a17632ec22c4c45b9642c15b03c26cd7e38756546201e) |
| 8. September 2024 | Added locality (region, city, country) to spots                                                                                                                                      | [8170d25](https://github.com/lukasbuehler/pkspot/commit/8170d25a558ff160b39de69095f928d0a44fd5a9)                                                                       |
| 28. August 2024   | Multilanguage (English, German), SSR, link previews, Angular 18                                                                                                                      | [504d587](https://github.com/lukasbuehler/pkspot/commit/504d58743607b84a3932c98ee9e6ef5073d77c41)                                                                       |
| Spring 2024       | Mobile (web) UI/UX enhancements                                                                                                                                                      |                                                                                                                                                                         |
| Spring 2024       | Spot and places full-text search                                                                                                                                                     |                                                                                                                                                                         |

## Collaborating

To collaborate on the code of this project, you will need to create a pull-request on GitHub. To get started you should for this repository, and
after making your changes, create a pull-request with your changes.

### Bug reports

For bug reports, please open an issue in this GitHub repository.
Or reach out on Instragram, Discord, or else via E-mail ([contact@lukasbuehler.ch](mailto:contact@lukasbuehler.ch))

### Feature requests

For feature requests please use the Discord or contact me directly.

### Translation

The translation files are in [`src/locales`](./src/locale/) and
English (`en`) is the source language.

To tweak a translation simply go to the corresponding file, find what you want to change, and change the value inside the `target` XML tag only. Example:

```xml
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de-CH">
    <file id="ngi18n" original="ng.template">
        <unit id="1940752772695642659">
            <segment state="initial">
                <source> The spot for Parkour and Freerunning. </source>
                <target> De Spot für Parkour und Freerunning. </target>
            </segment>
        </unit>
        ...
    </file>
</xliff>
```

#### Update the language files

After adding new text in the HTML markup and adding the i18n attribute, the language files will need to be updated to include this new text source.

Run the following command:

```
ng extract-i18n
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

4. Edit this new language file in [`src/locales`](./src/locale/).

5. Submit a pull-request with your changes on [GitHub](https://github.com/lukasbuehler/pkspot/compare)

### Local Development

The Spot-Map heavily utilizes Google Maps, if you want to test using it locally, you need your own Google API Key.

1. Generate your own Google API key
2. Enter it in `keys.development.ts`
3. Build for the development environment when developing locally

#### Build

```
npm run build
```

#### Start Frontend (and watch for changes)

```
npm run dev
```

#### Start SSR server

```
npm run build # build first
npm run serve:ssr
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
