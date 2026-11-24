# Translations guide

Read this when adding or changing user-facing text, or translating.

- The app uses Angular XLIFF 2.0 in `src/locale`. `messages.xlf` is the English
  source; translations are `messages.<locale>.xlf`. The XLIFF files are the
  only source of truth; never keep a second dictionary in scripts.
- Refresh keys with `npm run ng -- extract-i18n` from the repository root. It
  runs `ng-extract-i18n-merge`, which updates `messages.xlf`, merges new keys
  into every locale, updates changed source text and removes stale IDs. If it
  fails with a sandbox trap such as "Abort trap: 6", rerun it outside the
  sandbox.
- Then edit the locale files directly. Keep every placeholder tag exactly
  (`<ph .../>`, `<pc ...>...</pc>`) and translate only the text around it.
- Never translate the product term `Spot`. It stays `Spot` in every language.
- Run `node scripts/translation_analyzer.js`. It finds untranslated targets and
  translated `Spot`s in `de`, `es`, `fr`, `it` and `nl`.
- A new app language needs all of these together: `angular.json`
  `i18n.locales`, the `extract-i18n` `targetFiles` list, the analyzer's `files`
  list and `INCORRECT_SPOT_TRANSLATIONS`, and the language picker in the app.
- Done means: the XLIFF parses, `git diff --check` is clean, the analyzer
  passes, and `npm run test:build` passes.
