# Internationalisation support

## Adding new translations

Modify the files in the `lang` folder directly.

## After making changes

Since we use the `lang` folder as the source of truth, no compilation step is needed.
Simply edit the JSON files in `frontend/src/locale/lang/`.

## Adding a whole new language

There's a fair bit you'll need to touch. Here's a list that may
not be complete by the time you're reading this:

- frontend/src/locale/lang/[yourlang].json
- frontend/src/locale/lang/lang-list.json
- frontend/src/locale/HelpDoc/[yourlang]/*
- frontend/src/locale/HelpDoc/index.tsx
- frontend/src/locale/IntlProvider.tsx
- frontend/check-locales.cjs


## Checking for missing translations in languages

Run `node check-locales.cjs` in this frontend folder.
