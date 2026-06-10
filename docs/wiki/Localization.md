# Localization

ShieldPM uses `i18next` / `react-i18next` for the frontend UI. Locale files live in `frontend/src/locale/lang/`.

## Supported Locale Files

Current supported locale files: **13**.

| Code | Language                   | File                               |
| :--- | :------------------------- | :--------------------------------- |
| `bg` | Bulgarian / Bulgarisch     | `frontend/src/locale/lang/bg.json` |
| `de` | German / Deutsch           | `frontend/src/locale/lang/de.json` |
| `en` | English                    | `frontend/src/locale/lang/en.json` |
| `es` | Spanish / Spanisch         | `frontend/src/locale/lang/es.json` |
| `it` | Italian / Italienisch      | `frontend/src/locale/lang/it.json` |
| `ja` | Japanese / Japanisch       | `frontend/src/locale/lang/ja.json` |
| `ko` | Korean / Koreanisch        | `frontend/src/locale/lang/ko.json` |
| `nl` | Dutch / Niederländisch     | `frontend/src/locale/lang/nl.json` |
| `pl` | Polish / Polnisch          | `frontend/src/locale/lang/pl.json` |
| `ru` | Russian / Russisch         | `frontend/src/locale/lang/ru.json` |
| `sk` | Slovak / Slowakisch        | `frontend/src/locale/lang/sk.json` |
| `vi` | Vietnamese / Vietnamesisch | `frontend/src/locale/lang/vi.json` |
| `zh` | Chinese / Chinesisch       | `frontend/src/locale/lang/zh.json` |

`frontend/src/locale/lang/lang-list.json` controls the language list shown to users.

## Translation Rules

- User-facing UI text must use locale keys instead of hardcoded strings.
- Add or update the English source key and provide native translations for all supported locale files when possible.
- Do not rely on English fallback text for completed UI work.
- Run the locale checker after UI/i18n changes:

```bash
cd frontend
node check-locales.cjs
```

## Important Files

- `frontend/src/locale/IntlProvider.tsx`
- `frontend/src/locale/Utils.ts`
- `frontend/src/locale/lang/*.json`
- `frontend/check-locales.cjs`

## Related Pages

- [Development](Development)
- [Proxy Hosts](Proxy-Hosts)
- [Anubis](Anubis)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
